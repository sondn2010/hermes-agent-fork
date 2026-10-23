// The slice of the tui_gateway JSON-RPC contract bkt-chat depends on. contract.test.ts checks every
// entry against apps/shared/src/gateway-contract.openrpc.json, so an upstream rename fails the suite.
import type { GatewayEventName, RpcMethods, ServerRequestMap } from "@hermes/shared/gateway-events";

/** Client -> server methods bkt-chat calls, with the param keys it sends (all schemas are closed). */
export const CHAT_METHOD_PARAMS = {
  "session.create": ["profile", "model", "provider"],
  "session.resume": ["session_id", "profile"],
  "prompt.submit": ["session_id", "profile", "text"],
  "session.interrupt": ["session_id", "profile"],
  "approval.pending": ["session_id", "profile"],
  "approval.received": ["session_id", "profile", "request_id"],
  "approval.respond": ["session_id", "profile", "choice", "request_id"],
  "image.attach": ["session_id", "profile", "path"],
  "file.attach": ["session_id", "profile", "data_url", "name"],
  "slash.exec": ["session_id", "profile", "command"],
  "model.options": ["profile"],
} as const satisfies { [M in keyof RpcMethods]?: readonly (keyof RpcMethods[M]["params"] & string)[] };

export type ChatMethod = keyof typeof CHAT_METHOD_PARAMS;
export const CHAT_METHODS = Object.keys(CHAT_METHOD_PARAMS) as ChatMethod[];

export type Params<M extends ChatMethod> = RpcMethods[M]["params"];
export type Result<M extends ChatMethod> = RpcMethods[M]["result"];

/** Server -> client requests bkt-chat answers with a dialog. Every other one is declined. */
export const ANSWERED_SERVER_REQUESTS = ["approval", "clarify"] as const satisfies readonly (keyof ServerRequestMap)[];

/** Event notifications the reducer consumes. */
export const CONSUMED_EVENTS = [
  "message.start",
  "message.delta",
  "message.complete",
  "tool.generating",
  "tool.start",
  "tool.progress",
  "tool.complete",
  "thinking.delta",
  "status.update",
  "notice",
  "error",
  "request.cancel",
  "approval.cancelled",
  "session.info",
  "session.title",
  "sessions.changed",
] as const satisfies readonly GatewayEventName[];

export type ConsumedEvent = (typeof CONSUMED_EVENTS)[number];

/** The approval choices bkt-chat can offer, in display order. */
export const APPROVAL_CHOICES = ["once", "session", "always", "deny"] as const satisfies readonly ServerRequestMap["approval"]["result"]["choice"][];
export type ApprovalChoice = (typeof APPROVAL_CHOICES)[number];
