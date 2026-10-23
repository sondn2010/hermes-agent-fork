---
phase: 5
title: "bkt-chat"
status: pending
priority: P1
effort: "2d"
dependencies: [1]
---

# Phase 5: bkt-chat

## Goal

Add a React chat tab that talks to the agent over the `/api/ws` JSON-RPC gateway sidecar. It
must work on native Windows, where the PTY `/chat` does not, and it renders markdown, mermaid,
tool calls and approvals.

## Context

- The sidecar endpoint is `hermes_cli/web_routers/chat_ws.py:702` (`/api/ws`). Its auth is the
  same as REST: `?token=`, the session token in `window.__HERMES_SESSION_TOKEN__`, or the
  ticket flow when `__HERMES_AUTH_REQUIRED__` is set.
- The contract is in `apps/shared/src/gateway-contract.openrpc.json`, with types in
  `apps/shared/src/gateway-contract.generated.ts`. Relevant methods include `session.create`,
  `session.resume`, `prompt.submit` and `approval.respond`, and the event stream is described in
  `gateway-events.ts`.
- The desktop client already implements the protocol with `apps/shared/src/json-rpc-channel.ts`.
  Bundle `@hermes/shared` from source at build time instead of reimplementing it. It is a
  read-only import and the file is not modified.
- Upstream says not to rebuild the chat in React (`web/AGENTS.md`). The user accepted that
  deviation because the fork needs Windows support.

## Files to create

- `plugins/bkt-chat/dashboard/manifest.json` declares the `/bkt-chat` tab, placed
  `before:chat`, with icon `MessageSquare`.
- `bkt/packages/chat/src/` contains:
  - `connection.ts` builds the WS URL, including the base path from `__HERMES_BASE_PATH__`, and
    handles auth (token or ticket), reconnect with backoff, and the profile choice.
  - `useGatewaySession.ts` handles create and resume, the event reducer, interrupts and
    approvals.
  - `Transcript.tsx`: user messages in a cyan callout, assistant output through `MarkdownView`,
    and tool calls as collapsible indigo cards. A lime check marks a finished turn.
  - `Composer.tsx`: multiline input, enter to send and shift+enter for a newline, slash-command
    passthrough, file and image attachment (core `/api/chat/image-upload`), and a stop button.
  - `SessionRail.tsx`: lists recent sessions with `SDK.api.getSessions`, resumes a session, and
    starts a new one, with a profile and model picker.
  - `ApprovalDialog.tsx`: answers `approval.pending` requests.
- `bkt/packages/chat/src/contract.test.ts`:
  - Asserts that every method and event name bkt-chat uses is present in
    `gateway-contract.openrpc.json`.
  - This is the upstream-sync tripwire. It reads a machine contract, not production source.
- `bkt/packages/chat/src/reducer.test.ts` holds pure tests of the event reducer, using fixture
  frames.

## Steps

1. Read `json-rpc-channel.ts`, `gateway-events.ts` and the desktop chat store under
   `apps/desktop/src`. List the exact method and event set the desktop uses for one turn, and
   write it into this phase file.
2. Spike: connect, run `session.create` and `prompt.submit`, and log the frames. Do this on
   Windows first.
3. Build the reducer, its tests and the contract test, then the UI.
4. Check whether a session created here shows in Sessions and can be resumed in the core
   `/chat` on WSL.

## Verification

- `npm --prefix bkt test` covers the contract and reducer tests.
- On native Windows, a two-turn conversation streams, a tool call renders, an approval
  round-trips and stop interrupts the turn.
- The same checks pass on WSL.

## Risks

- Contract drift on a sync. The contract test plus a pinned list of methods in use is the
  mitigation.
- The sidecar may need a profile binding. If so, pass the profile the same way the desktop does.
