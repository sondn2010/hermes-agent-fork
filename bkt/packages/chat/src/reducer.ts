// Pure chat state: gateway events, server requests and local actions -> transcript + prompts.
import type {
  ClarifyQuestion,
  GatewayEvent,
  GatewayEventMap,
  PendingApproval,
  TranscriptMessage,
} from "@hermes/shared/gateway-events";
import { APPROVAL_CHOICES } from "./protocol";
import type { ApprovalChoice, ConsumedEvent } from "./protocol";

export type ToolStatus = "running" | "done" | "error";

export interface ToolCall {
  id: string;
  name: string;
  context?: string;
  args?: Record<string, unknown>;
  status: ToolStatus;
  progress?: string;
  result?: string;
  durationS?: number;
}

export type TranscriptItem =
  | { kind: "user"; id: string; text: string; attachments?: string[] }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | { kind: "tool"; id: string; tool: ToolCall }
  | { kind: "notice"; id: string; text: string; tone: "info" | "error" }
  | { kind: "turn"; id: string; status: "complete" | "interrupted" | "error" };

export interface ApprovalCard {
  /** The approval queue id (`approval.pending` / `approval.respond` key on it). */
  requestId: string;
  /** Live server request id; absent for a card replayed only through `approval.pending`. */
  serverRequestId?: string;
  sessionId: string;
  command: string;
  description: string;
  choices: ApprovalChoice[];
}

export interface ClarifyCard {
  serverRequestId: string;
  sessionId: string;
  questions: ClarifyQuestion[];
  /** Answers the server already locked (only on a reconnect replay). */
  locked: Record<string, string | null>;
}

export type ConnectionStatus =
  | { state: "connecting" }
  | { state: "open" }
  | { state: "reconnecting"; attempt: number; delayMs: number; reason: string }
  | { state: "closed" };

export interface ChatState {
  connection: ConnectionStatus;
  /** Runtime session id (events and RPCs key on it). */
  sessionId: string | null;
  /** Durable id in the session store (`/api/sessions`, `session.resume`). */
  storedId: string | null;
  profile: string;
  title: string | null;
  model: string | null;
  provider: string | null;
  items: TranscriptItem[];
  busy: boolean;
  /** Transient status line (thinking / tool generation / status updates). */
  activity: string | null;
  approvals: ApprovalCard[];
  clarify: ClarifyCard | null;
  /** Bumped when the stored session list may have changed. */
  sessionsVersion: number;
  nextId: number;
}

export function initialChatState(profile: string): ChatState {
  return {
    connection: { state: "connecting" },
    sessionId: null,
    storedId: null,
    profile,
    title: null,
    model: null,
    provider: null,
    items: [],
    busy: false,
    activity: null,
    approvals: [],
    clarify: null,
    sessionsVersion: 0,
    nextId: 1,
  };
}

export interface SessionSnapshot {
  sessionId: string;
  storedId: string | null;
  profile: string;
  messages: TranscriptMessage[];
  running: boolean;
  info?: { model?: string; provider?: string } | null;
  title?: string | null;
}

export type ChatAction =
  | { type: "connection"; status: ConnectionStatus }
  | { type: "profile"; profile: string }
  | { type: "session"; snapshot: SessionSnapshot }
  | { type: "reset" }
  | { type: "user"; text: string; attachments?: string[] }
  | { type: "notice"; text: string; tone: "info" | "error" }
  | { type: "busy"; busy: boolean }
  | { type: "event"; event: GatewayEvent }
  | { type: "approval-request"; card: ApprovalCard }
  | { type: "approval-replay"; sessionId: string; approvals: PendingApproval[] }
  | { type: "approval-settled"; requestId: string }
  | { type: "clarify-request"; card: ClarifyCard }
  | { type: "clarify-settled"; serverRequestId: string };

const MAX_RESULT_CHARS = 8000;

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function clip(text: string): string {
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n… (${text.length - MAX_RESULT_CHARS} more characters)` : text;
}

function withItem(state: ChatState, make: (id: string) => TranscriptItem): ChatState {
  const id = `i${state.nextId}`;
  return { ...state, items: [...state.items, make(id)], nextId: state.nextId + 1 };
}

/** Close the streaming assistant segment; drop it when nothing but whitespace arrived. */
function closeSegment(items: TranscriptItem[]): TranscriptItem[] {
  const last = items[items.length - 1];
  if (last?.kind !== "assistant" || !last.streaming) return items;
  if (!last.text.trim()) return items.slice(0, -1);
  return [...items.slice(0, -1), { ...last, text: last.text.trim(), streaming: false }];
}

function updateTool(items: TranscriptItem[], toolId: string, patch: (tool: ToolCall) => ToolCall): TranscriptItem[] | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "tool" && item.tool.id === toolId) {
      const next = items.slice();
      next[i] = { ...item, tool: patch(item.tool) };
      return next;
    }
  }
  return null;
}

/** Choices the card offers: the backend's list when present, else what the flags allow. */
export function approvalChoices(raw: unknown, allowSession?: boolean | null, allowPermanent?: boolean | null): ApprovalChoice[] {
  const offered = Array.isArray(raw) ? raw.filter((c): c is ApprovalChoice => APPROVAL_CHOICES.includes(c as ApprovalChoice)) : [];
  if (offered.length) return APPROVAL_CHOICES.filter((c) => offered.includes(c) || c === "deny");
  return APPROVAL_CHOICES.filter((c) => (c === "session" ? allowSession !== false : c === "always" ? allowPermanent !== false : true));
}

function upsertApproval(approvals: ApprovalCard[], card: ApprovalCard): ApprovalCard[] {
  const index = approvals.findIndex((a) => a.requestId === card.requestId);
  if (index < 0) return [...approvals, card];
  const next = approvals.slice();
  // A live request beats a replayed queue entry: it carries the id to answer directly.
  next[index] = { ...approvals[index], ...card, serverRequestId: card.serverRequestId ?? approvals[index].serverRequestId };
  return next;
}

function transcriptFrom(messages: TranscriptMessage[], startId: number): { items: TranscriptItem[]; nextId: number } {
  let nextId = startId;
  const items: TranscriptItem[] = [];
  const id = () => `i${nextId++}`;
  for (const message of messages) {
    const text = typeof message.text === "string" ? message.text : typeof message.content === "string" ? message.content : "";
    if (message.role === "user") {
      if (text) items.push({ kind: "user", id: id(), text });
    } else if (message.role === "assistant") {
      if (text.trim()) items.push({ kind: "assistant", id: id(), text, streaming: false });
    } else if (message.role === "tool") {
      items.push({
        kind: "tool",
        id: id(),
        tool: {
          id: message.tool_call_id ?? id(),
          name: message.name ?? "tool",
          context: message.context ?? undefined,
          args: message.args ?? undefined,
          status: "done",
          result: clip(stringify(message.content)),
        },
      });
    } else if (text) {
      items.push({ kind: "notice", id: id(), text, tone: "info" });
    }
  }
  return { items, nextId };
}

type EventHandler = (state: ChatState, event: GatewayEvent) => ChatState;
type Payload<K extends ConsumedEvent> = Partial<GatewayEventMap[K]> | undefined;
const payload = <K extends ConsumedEvent>(event: GatewayEvent, _type: K) => event.payload as Payload<K>;

const EVENT_HANDLERS: Record<ConsumedEvent, EventHandler> = {
  "message.start": (state) => ({ ...state, busy: true, activity: null }),
  "message.delta": (state, event) => {
    const text = payload(event, "message.delta")?.text;
    if (text === null) return { ...state, items: closeSegment(state.items) };
    if (typeof text !== "string" || !text) return state;
    const last = state.items[state.items.length - 1];
    if (last?.kind === "assistant" && last.streaming) {
      return { ...state, busy: true, items: [...state.items.slice(0, -1), { ...last, text: last.text + text }] };
    }
    return withItem({ ...state, busy: true }, (id) => ({ kind: "assistant", id, text: text.replace(/^\s+/, ""), streaming: true }));
  },
  "message.complete": (state, event) => {
    const p = payload(event, "message.complete");
    const finalText = typeof p?.text === "string" ? p.text.trim() : "";
    let items = state.items;
    const last = items[items.length - 1];
    if (last?.kind === "assistant" && last.streaming) {
      // The completion text is authoritative for the closing segment.
      const text = finalText || last.text.trim();
      items = text ? [...items.slice(0, -1), { ...last, text, streaming: false }] : items.slice(0, -1);
    } else if (finalText) {
      items = [...items, { kind: "assistant", id: `i${state.nextId}`, text: finalText, streaming: false }];
    }
    let next: ChatState = { ...state, items, nextId: state.nextId + 1 };
    const problem = p?.error ?? p?.warning;
    if (typeof problem === "string" && problem) {
      next = withItem(next, (id) => ({ kind: "notice", id, text: problem, tone: p?.error ? "error" : "info" }));
    }
    if (!state.busy) return { ...next, activity: null };
    const status = p?.status === "interrupted" || p?.status === "error" ? p.status : "complete";
    next = withItem(next, (id) => ({ kind: "turn", id, status }));
    return { ...next, busy: false, activity: null, sessionsVersion: state.sessionsVersion + 1 };
  },
  "tool.generating": (state, event) => {
    const name = payload(event, "tool.generating")?.name;
    return name ? { ...state, activity: `Preparing ${name}…` } : state;
  },
  "tool.start": (state, event) => {
    const p = payload(event, "tool.start");
    if (!p?.tool_id) return state;
    const base = { ...state, items: closeSegment(state.items), activity: null };
    const existing = updateTool(base.items, p.tool_id, (tool) => tool);
    if (existing) return base;
    return withItem(base, (id) => ({
      kind: "tool",
      id,
      tool: {
        id: p.tool_id as string,
        name: p.name ?? "tool",
        context: p.context ?? p.preview ?? undefined,
        args: p.args ?? undefined,
        status: "running",
      },
    }));
  },
  "tool.progress": (state, event) => {
    const p = payload(event, "tool.progress");
    if (!p?.tool_id) return state;
    const progress = p.message ?? (typeof p.percent === "number" ? `${p.percent}%` : undefined);
    const items = updateTool(state.items, p.tool_id, (tool) => ({ ...tool, progress }));
    return items ? { ...state, items } : state;
  },
  "tool.complete": (state, event) => {
    const p = payload(event, "tool.complete");
    if (!p?.tool_id) return state;
    const resultObj = p.result as { error?: unknown; exit_code?: unknown } | null | undefined;
    const failed = Boolean(resultObj && typeof resultObj === "object" && (resultObj.error || (typeof resultObj.exit_code === "number" && resultObj.exit_code !== 0)));
    const result = clip(p.result_text ?? p.summary ?? stringify(p.result));
    const patch = (tool: ToolCall): ToolCall => ({
      ...tool,
      args: tool.args ?? p.args ?? undefined,
      status: failed ? "error" : "done",
      progress: undefined,
      result,
      durationS: p.duration_s ?? undefined,
    });
    const items = updateTool(state.items, p.tool_id, patch);
    if (items) return { ...state, items };
    return withItem(state, (id) => ({ kind: "tool", id, tool: patch({ id: p.tool_id as string, name: p.name ?? "tool", status: "running" }) }));
  },
  "thinking.delta": (state, event) => {
    const text = (event.payload as { text?: unknown } | undefined)?.text;
    return { ...state, activity: typeof text === "string" && text.trim() ? text.trim() : null };
  },
  "status.update": (state, event) => {
    const text = payload(event, "status.update")?.text;
    return typeof text === "string" && text ? { ...state, activity: text } : state;
  },
  notice: (state, event) => {
    const text = payload(event, "notice")?.message;
    return text ? withItem(state, (id) => ({ kind: "notice", id, text, tone: "info" })) : state;
  },
  error: (state, event) => {
    const text = payload(event, "error")?.message || "The agent reported an error.";
    const next = withItem({ ...state, items: closeSegment(state.items) }, (id) => ({ kind: "notice", id, text, tone: "error" }));
    if (!state.busy) return next;
    return { ...withItem(next, (id) => ({ kind: "turn", id, status: "error" })), busy: false, activity: null };
  },
  "request.cancel": (state, event) => {
    const id = payload(event, "request.cancel")?.id;
    if (!id) return state;
    return {
      ...state,
      approvals: state.approvals.filter((a) => a.serverRequestId !== id),
      clarify: state.clarify?.serverRequestId === id ? null : state.clarify,
    };
  },
  "approval.cancelled": (state, event) => {
    const p = payload(event, "approval.cancelled");
    const ids = new Set(p?.request_ids ?? []);
    if (!ids.size) return state;
    const approvals = state.approvals.filter((a) => !ids.has(a.requestId));
    if (approvals.length === state.approvals.length) return state;
    const text = `Pending approval cancelled (${p?.reason ?? "cancelled"}).`;
    return withItem({ ...state, approvals }, (id) => ({ kind: "notice", id, text, tone: "info" }));
  },
  "session.info": (state, event) => {
    const p = payload(event, "session.info");
    return { ...state, model: p?.model || state.model, provider: p?.provider || state.provider };
  },
  "session.title": (state, event) => {
    const p = payload(event, "session.title");
    if (!p?.title || (p.session_id && state.storedId && p.session_id !== state.storedId)) return state;
    return { ...state, title: p.title, sessionsVersion: state.sessionsVersion + 1 };
  },
  "sessions.changed": (state) => ({ ...state, sessionsVersion: state.sessionsVersion + 1 }),
};

/**
 * A new (not yet created) session. Open prompts survive: the socket still owns the sessions that
 * raised them and the backend is still waiting for the answer.
 */
function freshSession(state: ChatState, profile: string): ChatState {
  return {
    ...initialChatState(profile),
    connection: state.connection,
    approvals: state.approvals,
    clarify: state.clarify,
    sessionsVersion: state.sessionsVersion + 1,
    nextId: state.nextId,
  };
}

function isConsumed(type: string): type is ConsumedEvent {
  return Object.prototype.hasOwnProperty.call(EVENT_HANDLERS, type);
}

function onSession(state: ChatState, { snapshot }: ActionOf<"session">): ChatState {
  const { items, nextId } = transcriptFrom(snapshot.messages, state.nextId);
  return {
    ...state,
    sessionId: snapshot.sessionId,
    storedId: snapshot.storedId,
    profile: snapshot.profile,
    title: snapshot.title ?? (snapshot.storedId === state.storedId ? state.title : null),
    model: snapshot.info?.model || null,
    provider: snapshot.info?.provider || null,
    items,
    nextId,
    busy: snapshot.running,
    activity: null,
    sessionsVersion: state.sessionsVersion + 1,
  };
}

function onEvent(state: ChatState, { event }: ActionOf<"event">): ChatState {
  if (!isConsumed(event.type)) return state;
  // A socket carries every session it created or resumed; render only the open one.
  if (event.session_id && state.sessionId && event.session_id !== state.sessionId) {
    return event.type === "sessions.changed" ? EVENT_HANDLERS[event.type](state, event) : state;
  }
  return EVENT_HANDLERS[event.type](state, event);
}

function onApprovalReplay(state: ChatState, action: ActionOf<"approval-replay">): ChatState {
  // The queue is the source of truth after a reconnect: drop cards it no longer holds.
  const live = new Set(action.approvals.map((a) => a.request_id).filter((id): id is string => !!id));
  let approvals = state.approvals.filter((a) => a.sessionId !== action.sessionId || live.has(a.requestId));
  for (const pending of action.approvals) {
    if (!pending.request_id) continue;
    approvals = upsertApproval(approvals, {
      requestId: pending.request_id,
      sessionId: action.sessionId,
      command: pending.command ?? "",
      description: pending.description || "dangerous command",
      choices: approvalChoices(pending.choices, pending.allow_session, pending.allow_permanent),
    });
  }
  return { ...state, approvals };
}

type ActionOf<T extends ChatAction["type"]> = Extract<ChatAction, { type: T }>;

const ACTION_HANDLERS: { [T in ChatAction["type"]]: (state: ChatState, action: ActionOf<T>) => ChatState } = {
  connection: (state, action) => ({ ...state, connection: action.status }),
  profile: (state, action) => (action.profile === state.profile ? state : freshSession(state, action.profile)),
  reset: (state) => freshSession(state, state.profile),
  session: onSession,
  user: (state, action) =>
    withItem({ ...state, busy: true, items: closeSegment(state.items) }, (id) => ({
      kind: "user",
      id,
      text: action.text,
      attachments: action.attachments?.length ? action.attachments : undefined,
    })),
  notice: (state, action) => withItem(state, (id) => ({ kind: "notice", id, text: action.text, tone: action.tone })),
  busy: (state, action) => ({ ...state, busy: action.busy, activity: action.busy ? state.activity : null }),
  event: onEvent,
  "approval-request": (state, action) => ({ ...state, approvals: upsertApproval(state.approvals, action.card) }),
  "approval-replay": onApprovalReplay,
  "approval-settled": (state, action) => ({
    ...state,
    approvals: state.approvals.filter((a) => a.requestId !== action.requestId),
  }),
  "clarify-request": (state, action) => ({ ...state, clarify: action.card }),
  "clarify-settled": (state, action) =>
    state.clarify?.serverRequestId === action.serverRequestId ? { ...state, clarify: null } : state,
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  const handler = ACTION_HANDLERS[action.type] as (state: ChatState, action: ChatAction) => ChatState;
  return handler(state, action);
}

// ---- server -> client requests -------------------------------------------------------------

export type RequestRoute =
  | { kind: "approval"; card: ApprovalCard }
  | { kind: "clarify"; card: ClarifyCard }
  /** Answer `{}` at once: a clarify with nothing to ask (cancel-all per the contract). */
  | { kind: "empty-clarify" }
  /** No dialog for this request: decline it so the waiting tool returns instead of hanging. */
  | { kind: "decline"; message: string };

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clarifyQuestions(raw: unknown): ClarifyQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((q): ClarifyQuestion[] => {
    if (!q || typeof q !== "object") return [];
    const { qid, question, choices, multi_select } = q as Record<string, unknown>;
    if (typeof qid !== "string" || typeof question !== "string" || !question) return [];
    const list = Array.isArray(choices) ? choices.filter((c): c is string => typeof c === "string" && !!c) : [];
    return [{ qid, question, choices: list.length ? list : null, multi_select: multi_select === true && list.length > 0 }];
  });
}

/** Decide how to answer one server request. Pure: the caller performs the answer. */
export function routeServerRequest(request: { id: string; method: string; params: Record<string, unknown> }): RequestRoute {
  const sessionId = str(request.params.session_id);
  if (request.method === "approval") {
    const p = request.params;
    return {
      kind: "approval",
      card: {
        requestId: str(p.request_id) || request.id,
        serverRequestId: request.id,
        sessionId,
        command: str(p.command),
        description: str(p.description) || "dangerous command",
        choices: approvalChoices(p.choices, p.allow_session as boolean | null, p.allow_permanent as boolean | null),
      },
    };
  }
  if (request.method === "clarify") {
    const questions = clarifyQuestions(request.params.questions);
    if (!questions.length) return { kind: "empty-clarify" };
    const answers = request.params.answers;
    const locked: Record<string, string | null> = {};
    if (answers && typeof answers === "object") {
      for (const [qid, value] of Object.entries(answers as Record<string, unknown>)) {
        if (value === null || typeof value === "string") locked[qid] = value;
      }
    }
    return { kind: "clarify", card: { serverRequestId: request.id, sessionId, questions, locked } };
  }
  return { kind: "decline", message: `bkt-chat cannot show a ${request.method} request` };
}

/** Wire answer for a clarify card: single-select answers are the label, multi-select a JSON list. */
export function clarifyAnswers(card: ClarifyCard, picks: Record<string, string[]>): Record<string, string | null> {
  const answers: Record<string, string | null> = { ...card.locked };
  for (const question of card.questions) {
    const values = (picks[question.qid] ?? []).map((v) => v.trim()).filter(Boolean);
    if (!values.length) {
      if (!(question.qid in answers)) answers[question.qid] = null;
      continue;
    }
    answers[question.qid] = question.multi_select ? JSON.stringify(values) : values[0];
  }
  return answers;
}
