import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { ServerRequest } from "@hermes/shared/json-rpc-channel";
import { JSON_RPC_METHOD_NOT_FOUND } from "@hermes/shared/json-rpc-channel";
import { bktUpload, errorMessage, profileRequest } from "@bkt/shared/api";
import { sdk } from "@bkt/shared/sdk";
import { GatewayConnection } from "./connection";
import type { ApprovalChoice, ChatMethod, Params, Result } from "./protocol";
import { chatReducer, clarifyAnswers, initialChatState, routeServerRequest } from "./reducer";
import type { ApprovalCard, ChatState, ClarifyCard, SessionSnapshot } from "./reducer";

/** The backend honours an approval answer for `approvals.timeout` (300 s by default). */
const APPROVAL_RESPOND_TIMEOUT_MS = 330_000;
const PROMPT_SUBMIT_TIMEOUT_MS = 60_000;
/** `/api/chat/image-upload` cap (`hermes_cli/web_routers/files.py`); also used for other files. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp|bmp)$/i;

export interface SessionOptions {
  model?: string;
  provider?: string;
}

export interface GatewaySession {
  state: ChatState;
  newSession: () => void;
  resume: (storedId: string, title?: string | null) => Promise<void>;
  submit: (text: string, files: File[], options: SessionOptions) => Promise<boolean>;
  interrupt: () => Promise<void>;
  answerApproval: (card: ApprovalCard, choice: ApprovalChoice) => Promise<void>;
  answerClarify: (card: ClarifyCard, picks: Record<string, string[]> | null) => void;
  modelOptions: () => Promise<Result<"model.options">>;
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error(`Could not read ${file.name}`)));
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

interface SlashDirective {
  output?: string | null;
  warning?: string | null;
  type?: string | null;
  message?: string | null;
  notice?: string | null;
  display?: string | null;
}

export function useGatewaySession(profile: string): GatewaySession {
  const [state, dispatch] = useReducer(chatReducer, profile, initialChatState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const openRequests = useRef(new Map<string, ServerRequest>());
  const connectionRef = useRef<GatewayConnection | null>(null);

  const rpc = useCallback(async <M extends ChatMethod>(method: M, params: Params<M>, timeoutMs?: number): Promise<Result<M>> => {
    const connection = connectionRef.current;
    if (!connection) throw new Error("Not connected to the Hermes gateway");
    await connection.whenOpen();
    return connection.request<Result<M>>(method, params as Record<string, unknown>, timeoutMs);
  }, []);

  const notice = useCallback((text: string, tone: "info" | "error" = "error") => dispatch({ type: "notice", text, tone }), []);

  const replayApprovals = useCallback(
    async (sessionId: string, sessionProfile: string) => {
      const { approvals } = await rpc("approval.pending", { session_id: sessionId, profile: sessionProfile });
      dispatch({ type: "approval-replay", sessionId, approvals });
      // The card is on screen: start the backend's answer clock, as the desktop does on replay.
      for (const pending of approvals) {
        if (!pending.request_id) continue;
        void rpc("approval.received", { session_id: sessionId, profile: sessionProfile, request_id: pending.request_id }).catch(() => undefined);
      }
    },
    [rpc],
  );

  const applySnapshot = useCallback((snapshot: SessionSnapshot) => dispatch({ type: "session", snapshot }), []);

  const resumeStored = useCallback(
    async (storedId: string, sessionProfile: string, title?: string | null) => {
      // open_requests in the reply are re-delivered to onRequest by the channel before this resolves.
      const result = await rpc("session.resume", { session_id: storedId, profile: sessionProfile });
      applySnapshot({
        sessionId: result.session_id,
        storedId: result.stored_session_id ?? storedId,
        profile: sessionProfile,
        messages: result.messages ?? [],
        running: result.running === true,
        info: result.info,
        title,
      });
      await replayApprovals(result.session_id, sessionProfile);
    },
    [rpc, applySnapshot, replayApprovals],
  );

  const onRequest = useCallback((request: ServerRequest) => {
    const route = routeServerRequest(request);
    switch (route.kind) {
      case "approval":
        openRequests.current.set(request.id, request);
        dispatch({ type: "approval-request", card: route.card });
        return;
      case "clarify":
        openRequests.current.set(request.id, request);
        dispatch({ type: "clarify-request", card: route.card });
        return;
      case "empty-clarify":
        request.respond({});
        return;
      case "decline":
        // The channel's own "no handler" answer: the backend settles the request as unanswered
        // and the waiting tool returns at once instead of blocking the turn.
        request.fail(JSON_RPC_METHOD_NOT_FOUND, route.message);
        return;
    }
  }, []);

  useEffect(() => {
    const connection = new GatewayConnection({
      buildUrl: () => sdk().buildWsUrl("/api/ws"),
      onEvent: (event) => {
        if (event.type === "request.cancel") {
          const id = (event.payload as { id?: unknown } | undefined)?.id;
          if (typeof id === "string") openRequests.current.delete(id);
        }
        dispatch({ type: "event", event });
      },
      onRequest,
      onStatus: (status) => dispatch({ type: "connection", status }),
      onReconnected: () => {
        // A new socket generation: requests from the old one can no longer be answered over it.
        openRequests.current.clear();
        const { storedId, profile: sessionProfile } = stateRef.current;
        if (!storedId) return;
        resumeStored(storedId, sessionProfile).catch((err) => notice(`Could not re-attach the session: ${errorMessage(err)}`));
      },
      onError: (message) => notice(message),
    });
    connectionRef.current = connection;
    connection.start();
    return () => {
      connection.stop();
      connectionRef.current = null;
    };
  }, [onRequest, resumeStored, notice]);

  useEffect(() => {
    dispatch({ type: "profile", profile });
  }, [profile]);

  const newSession = useCallback(() => dispatch({ type: "reset" }), []);

  const resume = useCallback(
    async (storedId: string, title?: string | null) => {
      try {
        await resumeStored(storedId, stateRef.current.profile, title);
      } catch (err) {
        notice(`Could not open the session: ${errorMessage(err)}`);
      }
    },
    [resumeStored, notice],
  );

  const ensureSession = useCallback(
    async (options: SessionOptions): Promise<{ sessionId: string; profile: string }> => {
      const current = stateRef.current;
      if (current.sessionId) return { sessionId: current.sessionId, profile: current.profile };
      const sessionProfile = current.profile;
      const result = await rpc("session.create", {
        profile: sessionProfile,
        ...(options.model ? { model: options.model } : {}),
        ...(options.provider ? { provider: options.provider } : {}),
      });
      applySnapshot({
        sessionId: result.session_id,
        storedId: result.stored_session_id,
        profile: sessionProfile,
        messages: result.messages ?? [],
        running: false,
        info: result.info,
      });
      return { sessionId: result.session_id, profile: sessionProfile };
    },
    [rpc, applySnapshot],
  );

  const attach = useCallback(
    async (file: File, sessionId: string, sessionProfile: string): Promise<{ label: string; ref?: string }> => {
      if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} is larger than 25 MB`);
      const dataUrl = await readDataUrl(file);
      if (IMAGE_TYPES.test(file.type)) {
        const { url, init } = profileRequest("/api/chat/image-upload", sessionProfile, {
          body: { data_url: dataUrl, filename: file.name },
        });
        const response = await bktUpload(url, init.body as string, { headers: init.headers });
        if (!response.ok) throw new Error(`${file.name}: upload failed (${response.status}) ${await response.text()}`);
        const uploaded = (await response.json()) as { path?: unknown };
        if (typeof uploaded.path !== "string") throw new Error(`${file.name}: upload returned no path`);
        await rpc("image.attach", { session_id: sessionId, profile: sessionProfile, path: uploaded.path });
        return { label: file.name };
      }
      const staged = await rpc("file.attach", { session_id: sessionId, profile: sessionProfile, data_url: dataUrl, name: file.name });
      return { label: file.name, ref: staged.ref_text };
    },
    [rpc],
  );

  const runSlash = useCallback(
    async (command: string, sessionId: string, sessionProfile: string): Promise<string | null> => {
      const result = (await rpc("slash.exec", { session_id: sessionId, profile: sessionProfile, command })) as SlashDirective;
      const shown = [result.output, result.display, result.notice, result.warning].filter((t): t is string => typeof t === "string" && !!t.trim());
      if (shown.length) notice(shown.join("\n\n"), "info");
      // `send` / `skill` directives hand back a prompt to run as a turn.
      if ((result.type === "send" || result.type === "skill") && result.message) return result.message;
      if (!shown.length) notice(`${command.split(/\s/)[0]} done.`, "info");
      return null;
    },
    [rpc, notice],
  );

  const submit = useCallback(
    async (text: string, files: File[], options: SessionOptions): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed && !files.length) return false;
      try {
        const { sessionId, profile: sessionProfile } = await ensureSession(options);
        if (trimmed.startsWith("/") && !files.length) {
          dispatch({ type: "user", text: trimmed });
          dispatch({ type: "busy", busy: false });
          const prompt = await runSlash(trimmed, sessionId, sessionProfile);
          if (!prompt) return true;
          dispatch({ type: "busy", busy: true });
          await rpc("prompt.submit", { session_id: sessionId, profile: sessionProfile, text: prompt }, PROMPT_SUBMIT_TIMEOUT_MS);
          return true;
        }
        const labels: string[] = [];
        const refs: string[] = [];
        for (const file of files) {
          const attached = await attach(file, sessionId, sessionProfile);
          labels.push(attached.label);
          if (attached.ref) refs.push(attached.ref);
        }
        const body = [trimmed, ...refs].filter(Boolean).join("\n\n");
        dispatch({ type: "user", text: trimmed || "(attachment)", attachments: labels });
        const receipt = await rpc("prompt.submit", { session_id: sessionId, profile: sessionProfile, text: body }, PROMPT_SUBMIT_TIMEOUT_MS);
        if (receipt.status === "queued") notice("Queued: it runs after the current turn.", "info");
        return true;
      } catch (err) {
        dispatch({ type: "busy", busy: false });
        notice(errorMessage(err));
        return false;
      }
    },
    [ensureSession, runSlash, attach, rpc, notice],
  );

  const interrupt = useCallback(async () => {
    const { sessionId, profile: sessionProfile } = stateRef.current;
    if (!sessionId) return;
    try {
      await rpc("session.interrupt", { session_id: sessionId, profile: sessionProfile });
    } catch (err) {
      notice(`Stop failed: ${errorMessage(err)}`);
    }
  }, [rpc, notice]);

  const answerApproval = useCallback(
    async (card: ApprovalCard, choice: ApprovalChoice) => {
      dispatch({ type: "approval-settled", requestId: card.requestId });
      const live = card.serverRequestId ? openRequests.current.get(card.serverRequestId) : undefined;
      if (live) {
        openRequests.current.delete(live.id);
        live.respond({ choice });
        return;
      }
      // Restored from approval.pending: answer the queue entry by its id.
      try {
        await rpc(
          "approval.respond",
          { session_id: card.sessionId, profile: stateRef.current.profile, choice, request_id: card.requestId },
          APPROVAL_RESPOND_TIMEOUT_MS,
        );
      } catch (err) {
        notice(`Approval failed: ${errorMessage(err)}`);
      }
    },
    [rpc, notice],
  );

  const answerClarify = useCallback((card: ClarifyCard, picks: Record<string, string[]> | null) => {
    dispatch({ type: "clarify-settled", serverRequestId: card.serverRequestId });
    const live = openRequests.current.get(card.serverRequestId);
    if (!live) return;
    openRequests.current.delete(card.serverRequestId);
    live.respond(picks ? { answers: clarifyAnswers(card, picks), outcome: "submitted" } : { outcome: "cancelled" });
  }, []);

  const modelOptions = useCallback(() => rpc("model.options", { profile: stateRef.current.profile }), [rpc]);

  return useMemo(
    () => ({ state, newSession, resume, submit, interrupt, answerApproval, answerClarify, modelOptions }),
    [state, newSession, resume, submit, interrupt, answerApproval, answerClarify, modelOptions],
  );
}
