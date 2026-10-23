import type { GatewayEvent } from "@hermes/shared/gateway-events";
import { chatReducer, clarifyAnswers, initialChatState, routeServerRequest } from "./reducer";
import type { ChatAction, ChatState } from "./reducer";

const SID = "rt1";

function run(actions: ChatAction[], start: ChatState = initialChatState("work")): ChatState {
  return actions.reduce(chatReducer, start);
}

function ev(type: string, payload: unknown, session_id = SID): ChatAction {
  return { type: "event", event: { type, payload, session_id } as unknown as GatewayEvent };
}

const session: ChatAction = {
  type: "session",
  snapshot: { sessionId: SID, storedId: "stored1", profile: "work", messages: [], running: false, info: { model: "m-work", provider: "custom" } },
};

describe("chatReducer: a streamed turn", () => {
  it("streams deltas into one assistant segment and marks the finished turn", () => {
    const state = run([
      session,
      { type: "user", text: "hi" },
      ev("message.start", {}),
      ev("message.delta", { text: "Hel" }),
      ev("message.delta", { text: "lo" }),
      ev("message.complete", { text: "Hello", status: "complete" }),
    ]);
    expect(state.items.map((i) => i.kind)).toEqual(["user", "assistant", "turn"]);
    expect(state.items[1]).toMatchObject({ kind: "assistant", text: "Hello", streaming: false });
    expect(state.items[2]).toMatchObject({ kind: "turn", status: "complete" });
    expect(state.busy).toBe(false);
    expect(state.model).toBe("m-work");
  });

  it("splits segments around a tool call and records its result", () => {
    const state = run([
      session,
      { type: "user", text: "run" },
      ev("message.delta", { text: "Checking" }),
      ev("tool.start", { tool_id: "t1", name: "terminal", context: "echo ok", args: { command: "echo ok" } }),
      ev("tool.complete", { tool_id: "t1", name: "terminal", duration_s: 0.1, result: { output: "ok", exit_code: 0, error: null } }),
      ev("message.delta", { text: "\n\nDone" }),
      ev("message.complete", { text: "Done", status: "complete" }),
    ]);
    expect(state.items.map((i) => i.kind)).toEqual(["user", "assistant", "tool", "assistant", "turn"]);
    const tool = state.items[2];
    expect(tool.kind === "tool" && tool.tool).toMatchObject({ id: "t1", status: "done", durationS: 0.1 });
    expect(tool.kind === "tool" && tool.tool.result).toContain('"output": "ok"');
    expect(state.items[3]).toMatchObject({ text: "Done" });
  });

  it("marks a failed tool and an interrupted turn", () => {
    const state = run([
      session,
      { type: "user", text: "x" },
      ev("tool.start", { tool_id: "t1", name: "terminal" }),
      ev("tool.complete", { tool_id: "t1", name: "terminal", result: { output: "", exit_code: 2, error: null } }),
      ev("message.complete", { text: "", status: "interrupted" }),
    ]);
    const tool = state.items.find((i) => i.kind === "tool");
    expect(tool?.kind === "tool" && tool.tool.status).toBe("error");
    expect(state.items[state.items.length - 1]).toMatchObject({ kind: "turn", status: "interrupted" });
  });

  it("ends the turn on an error event", () => {
    const state = run([session, { type: "user", text: "x" }, ev("error", { message: "provider down" })]);
    expect(state.busy).toBe(false);
    expect(state.items.slice(-2)).toMatchObject([{ kind: "notice", tone: "error", text: "provider down" }, { kind: "turn", status: "error" }]);
  });

  it("ignores events of another session on the same socket", () => {
    const state = run([session, ev("message.delta", { text: "other" }, "rt2")]);
    expect(state.items).toEqual([]);
  });

  it("rebuilds the transcript from a resumed session", () => {
    const state = run([
      {
        type: "session",
        snapshot: {
          sessionId: SID,
          storedId: "stored1",
          profile: "work",
          running: true,
          messages: [
            { role: "user", text: "hello" },
            { role: "assistant", text: "hi there" },
            { role: "tool", name: "terminal", tool_call_id: "c1", content: "ok", context: "echo ok" },
          ],
        },
      },
    ]);
    expect(state.items.map((i) => i.kind)).toEqual(["user", "assistant", "tool"]);
    expect(state.busy).toBe(true);
  });
});

describe("server requests", () => {
  const approvalFrame = {
    id: "srq-1",
    method: "approval",
    params: { session_id: SID, request_id: "ap1", command: "rm -rf /tmp/x", description: "delete in root path", choices: ["once", "session", "deny"] },
  };

  it("routes an approval to a card and settles it on request.cancel", () => {
    const route = routeServerRequest(approvalFrame);
    expect(route.kind).toBe("approval");
    if (route.kind !== "approval") return;
    expect(route.card).toMatchObject({ requestId: "ap1", serverRequestId: "srq-1", choices: ["once", "session", "deny"] });
    let state = run([session, { type: "approval-request", card: route.card }]);
    expect(state.approvals).toHaveLength(1);
    state = chatReducer(state, ev("request.cancel", { id: "srq-1", method: "approval", reason: "timeout" }));
    expect(state.approvals).toEqual([]);
  });

  it("derives approval choices from the permission flags when none are listed", () => {
    const route = routeServerRequest({ id: "s", method: "approval", params: { session_id: SID, request_id: "a", allow_permanent: false } });
    expect(route.kind === "approval" && route.card.choices).toEqual(["once", "session", "deny"]);
  });

  it("replays pending approvals after a reconnect without duplicating the live request", () => {
    const route = routeServerRequest(approvalFrame);
    if (route.kind !== "approval") throw new Error("expected approval");
    let state = run([
      session,
      { type: "approval-request", card: { ...route.card, requestId: "stale" } },
      { type: "approval-request", card: route.card },
    ]);
    state = chatReducer(state, {
      type: "approval-replay",
      sessionId: SID,
      approvals: [
        { request_id: "ap1", command: "rm -rf /tmp/x", description: "delete in root path", choices: ["once", "deny"] },
        { request_id: "ap2", command: "dd if=/dev/zero", allow_session: false },
      ],
    });
    // "stale" is gone from the queue; ap1 keeps its live server id; ap2 is answerable via approval.respond.
    expect(state.approvals.map((a) => [a.requestId, a.serverRequestId])).toEqual([
      ["ap1", "srq-1"],
      ["ap2", undefined],
    ]);
    expect(state.approvals[1].choices).toEqual(["once", "always", "deny"]);
    state = chatReducer(state, ev("approval.cancelled", { session_id: SID, stored_session_id: "stored1", reason: "interrupt", cancelled_count: 1, request_ids: ["ap2"] }));
    expect(state.approvals.map((a) => a.requestId)).toEqual(["ap1"]);
  });

  it("routes a clarify request and encodes single and multi-select answers", () => {
    const route = routeServerRequest({
      id: "srq-2",
      method: "clarify",
      params: {
        session_id: SID,
        questions: [
          { qid: "q0", question: "Colour?", choices: ["cyan (Recommended)", "indigo"] },
          { qid: "q1", question: "Sizes?", choices: ["s", "m"], multi_select: true },
          { qid: "q2", question: "Why?" },
        ],
        answers: { q2: "already locked" },
      },
    });
    expect(route.kind).toBe("clarify");
    if (route.kind !== "clarify") return;
    expect(route.card.locked).toEqual({ q2: "already locked" });
    expect(clarifyAnswers(route.card, { q0: ["cyan (Recommended)"], q1: ["s", "m"] })).toEqual({
      q0: "cyan (Recommended)",
      q1: '["s","m"]',
      q2: "already locked",
    });
    let state = run([session, { type: "clarify-request", card: route.card }]);
    expect(state.clarify?.serverRequestId).toBe("srq-2");
    state = chatReducer(state, ev("request.cancel", { id: "srq-2", method: "clarify", reason: "interrupted" }));
    expect(state.clarify).toBeNull();
  });

  it("answers a clarify with no usable questions at once", () => {
    expect(routeServerRequest({ id: "s", method: "clarify", params: { session_id: SID, questions: [] } }).kind).toBe("empty-clarify");
  });

  it("declines a server request it cannot show", () => {
    for (const method of ["sudo", "secret", "preview.read", "some.future.request"]) {
      const route = routeServerRequest({ id: "s", method, params: { session_id: SID } });
      expect(route).toEqual({ kind: "decline", message: `bkt-chat cannot show a ${method} request` });
    }
  });

  it("keeps open prompts when a new chat starts", () => {
    const route = routeServerRequest(approvalFrame);
    if (route.kind !== "approval") throw new Error("expected approval");
    const state = run([session, { type: "approval-request", card: route.card }, { type: "reset" }]);
    expect(state.sessionId).toBeNull();
    expect(state.approvals).toHaveLength(1);
  });
});
