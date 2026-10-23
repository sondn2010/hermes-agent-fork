---
phase: 5
title: "bkt-chat"
status: completed
priority: P1
effort: "2d"
dependencies: [1]
---

# Phase 5: bkt-chat

## Goal

Add a React chat tab that talks to the agent over the `/api/ws` JSON-RPC gateway sidecar. It
must work on native Windows, where the PTY `/chat` does not. It renders markdown, mermaid, tool
calls, approvals and clarifying questions.

## Context

- The sidecar endpoint is `hermes_cli/web_routers/chat_ws.py:702` (`/api/ws`).
  - Auth goes through the SDK: `SDK.buildWsUrl` and `SDK.buildWsAuthParam`
    (`web/src/plugins/registry.ts:174-188`) choose a token in loopback mode or a single-use
    ticket in gated mode. Plugins never read `window.__HERMES_SESSION_TOKEN__` directly.
  - A gated ticket is single-use and expires after 30 seconds
    (`hermes_cli/web_server_chat.py:207-211`), so every reconnect attempt builds a new URL.
  <!-- Red Team: reuse SDK WS auth; fresh ticket per reconnect -->
- The socket has no profile binding. It is opened with `profile_scope: 'host'`
  (`chat_ws.py:702-735`), and the profile is passed in the params of each RPC
  (`session.create`, `prompt.submit` and the rest; `tui_gateway/hosted_room_server_rpc.py:53-79`).
  <!-- Red Team: profile is per RPC, not per socket -->
- The contract is in `apps/shared/src/gateway-contract.openrpc.json`. It has three sections:
  - `methods`, which the client calls: `session.create`, `session.resume`, `prompt.submit`,
    `approval.respond`, and `approval.pending`, which replays the approvals still waiting
    after a reconnect.
  - `x-server-requests`, which the server sends: `approval`, `clarify`, `sudo`, `secret` and
    others.
  - `x-notifications`.
  - The desktop's shared layer projects the live `approval` and `clarify` server requests onto
    the `approval.request` / `approval.settled` and `clarify.request` / `clarify.settled`
    events (`apps/shared/src/gateway-events.ts:30-40`). Those are client-local names and are not
    in the openrpc file.
  <!-- Red Team: approval.pending is replay; live approvals and clarify are server requests -->
- The desktop client already implements the protocol with `apps/shared/src/json-rpc-channel.ts`
  and `apps/shared/src/reconnect-backoff.ts`. Bundle them from source through the phase 1
  `@hermes/shared` alias instead of reimplementing them. This is a read-only import, and no file
  in `apps/shared` is modified.
- Upstream says not to rebuild the chat in React (`web/AGENTS.md`). The user accepted that
  deviation because the fork needs Windows support.

## Files to create

- `plugins/bkt-chat/dashboard/manifest.json` declares the `/bkt-chat` tab with icon
  `MessageSquare` and position `end`.
- `bkt/packages/chat/src/` contains:
  - `connection.ts`:
    - Builds the socket URL with `SDK.buildWsUrl('/api/ws')` for every connect and reconnect.
    - Reconnects with `reconnect-backoff.ts`.
    - After a reconnect, calls `approval.pending` to replay any approvals still waiting.
  - `useGatewaySession.ts`:
    - Handles create and resume, the event reducer, and interrupts.
    - Passes the selected `profile` in the params of every RPC.
    - Answers server requests:
      - `approval` through `ApprovalDialog`.
      - `clarify` through `ClarifyDialog`.
      - Any other server request type is declined with the contract's decline response, so a
        turn never hangs on a request bkt-chat cannot show.
  - `Transcript.tsx`: user messages in a cyan callout, assistant output through `MarkdownView`,
    and tool calls as collapsible indigo cards. A lime check marks a finished turn.
  - `Composer.tsx`:
    - Multiline input. Enter sends and shift+enter adds a newline.
    - Slash-command passthrough.
    - File and image attachment through core `/api/chat/image-upload` (`files.py:477`), sent
      with `bktUpload`.
    - A stop button.
    - On mount, it reads the phase 1 `bkt/shared/prefill.ts` read-once value, if one is set.
  - `SessionRail.tsx`: lists recent sessions with `SDK.api.getSessions` for the selected
    profile, resumes a session, and starts a new one, with a profile and model picker.
  - `ApprovalDialog.tsx` and `ClarifyDialog.tsx`.
- `bkt/packages/chat/src/contract.test.ts` is the upstream-sync tripwire. It reads machine
  contracts, not production source:
  - Every method bkt-chat calls is in the openrpc `methods`.
  - Every server request it answers is in `x-server-requests`.
  - Every event it consumes is a key of the event map types in `gateway-events.ts`.
- `bkt/packages/chat/src/reducer.test.ts` holds pure tests of the event reducer, using fixture
  frames. They cover approval and clarify requests, approval replay after a reconnect, and the
  decline of an unknown server request.

## Steps

1. Read `json-rpc-channel.ts`, `reconnect-backoff.ts`, `gateway-events.ts` and the desktop chat
   store under `apps/desktop/src`. List the exact methods, server requests and events the
   desktop uses for one turn, including how it declines an unsupported server request, and write
   them into this phase file.
2. Spike: connect, run `session.create` and `prompt.submit` with an explicit `profile`, and log
   the frames. Do this on Windows first, in both loopback and gated mode.
3. Build the reducer, its tests and the contract test, then the UI.
4. Check whether a session created here shows in Sessions for the same profile and can be
   resumed in the core `/chat` on WSL.

## Step 1 findings: protocol for one turn

Read from `apps/shared/src/json-rpc-channel.ts`, `reconnect-backoff.ts`, `gateway-events.ts`,
`gateway-contract.openrpc.json`, the desktop's
`app/session/hooks/use-message-stream/gateway-event/server-requests.ts` and `input-requests.ts`,
`store/prompts.ts` and `store/server-requests.ts`. All of them were confirmed against a live
`/api/ws` spike on macOS (`session.create` and `prompt.submit` with `profile: "work"`, and the
`info.model` reported the work profile's model).

- **Handshake (owned by the channel).** The first frame is the `gateway.ready` event. The
  channel answers it with `client.capabilities {server_requests: true}`. Without that call the
  backend fails every approval or clarify immediately. When `gateway.ready.heartbeat` is set,
  the channel sends `gateway.ping` as a heartbeat.
- **Methods (`methods`) bkt-chat calls.** Each one carries `profile`, and every params schema
  is closed (`additionalProperties: false`).
  - `session.create {profile, model?, provider?}` returns a runtime `session_id`,
    `stored_session_id` and `info`.
  - `session.resume {session_id: <stored id>, profile}` returns the runtime id, `messages`,
    `running` and `open_requests`.
  - `prompt.submit {session_id, profile, text}` returns `status` (`streaming`, `queued`, ...).
  - `session.interrupt {session_id, profile}`.
  - `approval.pending {session_id, profile}` replays waiting approvals, and
    `approval.received {..., request_id}` follows it, as the desktop does on replay.
  - `approval.respond {session_id, profile, choice, request_id}` answers a replayed queue
    entry. A live request is answered as a JSON-RPC response instead.
  - Attachments use `image.attach {path}`, after `POST /api/chat/image-upload?profile=`, and
    `file.attach {data_url, name}`, which returns a `ref_text` that is appended to the prompt.
  - Slash passthrough uses `slash.exec {command}`. A `send` or `skill` directive is then
    submitted as a prompt.
  - The model picker uses `model.options {profile}`.
- **Server requests (`x-server-requests`) bkt-chat answers.**
  - `approval {request_id, command, description, choices}` is answered with
    `{choice: once|session|always|deny}`.
  - `clarify {questions[{qid, question, choices, multi_select}], answers?}` is answered with
    `{answers: {qid: label | JSON list for multi-select | null}, outcome}`. `{}` or
    `{outcome: "cancelled"}` cancels.
  - After a reconnect the channel re-delivers `open_requests` from `session.resume` with the
    same ids.
- **Decline of an unsupported server request.** The desktop returns `false` from its handler,
  and the channel then answers JSON-RPC error `-32601` (`deliverRequest`). The backend
  (`tui_gateway/server_requests.py::resolve_response`) treats any error as unanswered, so the
  tool returns at once instead of waiting out its deadline. bkt-chat sends the same `-32601`
  explicitly for every method except `approval` and `clarify`.
- **Events (`x-notifications`, all in `BACKEND_EVENT_NAMES`) consumed for one turn.**
  - The turn arrives as `message.start` and then `message.delta*`. A `{text: null}` delta is a
    segment boundary.
  - Tool calls emit `tool.generating`, `tool.start`, `tool.progress` and `tool.complete`.
  - The turn ends with `message.complete {text, status: complete|error|interrupted}`.
  - Status and metadata come from `thinking.delta`, `status.update`, `notice`, `error`,
    `session.info`, `session.title` and `sessions.changed`.
  - Pending prompts are withdrawn by `request.cancel {id}` (timeout or interrupt) and by
    `approval.cancelled {request_ids}`.
- **Correction to the context above.** `approval.request`, `approval.settled`,
  `clarify.request` and `clarify.settled` are canonical-gateway projections
  (`gateway/session_pending_controls.py`) and are not used by `/api/ws`. The dashboard socket
  delivers live approvals and clarify questions only as server requests.

## Implementation status (2026-10-23)

- [x] Step 1: protocol written above.
- [x] Step 2: spike on macOS in loopback mode against a temporary `HERMES_HOME` with a `work`
  profile and a scripted OpenAI-compatible endpoint. Windows and gated mode are still open.
- [x] Step 3: reducer, reducer tests, contract test, connection test, and the UI. Built bundle:
  193.6 KiB.
- [ ] Step 4: resume in the core `/chat` on WSL. On macOS, a bkt-chat session shows in the
  `work` profile's session list, does not show under `default`, and resumes in bkt-chat.
- macOS E2E (agent-browser, dashboard :9223) passed for:
  - a two-turn stream on `work` with markdown, a table and a mermaid SVG;
  - a tool card;
  - an approval denied (the command was blocked) and an approval accepted after a forced
    socket drop (the card survived the reconnect and the command ran);
  - a clarify round-trip;
  - Stop (turn marked "stopped");
  - image and file attachments;
  - `/help` passthrough;
  - resume from the rail.
- Still open for manual verification on native Windows and WSL:
  - every Verification bullet below;
  - gated mode, where a fresh ticket is used per reconnect (unit-tested on macOS: `buildUrl`
    runs for every dial);
  - resume in the core `/chat`.

## Verification

- `npm --prefix bkt test` covers the contract and reducer tests.
- On native Windows:
  - A two-turn conversation streams.
  - A tool call renders.
  - An approval and a clarifying question round-trip.
  - Stop interrupts the turn.
  - A dropped connection reconnects with a fresh ticket in gated mode.
- A session started on a non-launch profile runs under that profile.
- The same checks pass on WSL.

## Risks

- Contract drift on a sync. The contract test, the pinned list of methods in use, and
  `check-dist-fresh` are the mitigation.
- Behaviour drift in `json-rpc-channel.ts` that keeps the names unchanged is caught only by the
  rebuild and the manual end-to-end check in the phase 8 sync checklist.
