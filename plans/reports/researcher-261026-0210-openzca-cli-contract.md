# openzca CLI contract for a Python asyncio adapter

Date: 2026-10-26. Sources read:
- openzca repo `darkamenosa/openzca` at commit `20d7852f545549875b63b70048b73d8518c11dcb` (2026-09-27), `package.json` version **0.1.60**, the same as the npm `latest` (`npm view openzca version` returns 0.1.60).
- The underlying library `RFS-ADRENO/zca-js` at commit `0586dc5e` (v2.2.0, which openzca pins as `^2.2.0`).
- https://openzca.com/ and https://openzca.com/docs.html.

Where the source and the docs disagree, this report follows the source. File paths are relative to the repo root, and line numbers refer to `src/cli.ts` at that commit.

## Bottom line

openzca works as a subprocess backend, but parts of its contract are less clean than the README suggests. Five findings matter most for the adapter:

- **Send commands do not print JSON.** `msg send`, `image`, `voice`, `upload` and `sticker` call `output(response, false)`, which prints a Node `util.inspect` dump such as `{ message: { msgId: 7158000000001 }, attachment: [] }`. These commands have no `--json` flag. The adapter has to regex out `msgId`.
- **`listen --raw` stdout mixes JSON and plain text.** It also prints `Listening... Press Ctrl+C to stop.`, `Connected to Zalo websocket.` and `Listener closed (<code>) <reason>`. The adapter should parse only lines that start with `{`.
- **There is no `isSelf` field.** Use `--self` and compare `senderId` with your own UID.
- **There is no daemon for text sends.** Every send spawns Node and runs a full `zalo.login()`. The listener IPC socket only accepts file uploads.
- **Auth loss is not signalled by a distinct exit code.** A websocket close ends `listen` with exit code 0, unless the process is recycling (75).

## 1. Install and runtime

- The npm package is `openzca`. Install it with `npm i -g openzca@latest`, or run it without installing via `npx openzca`.
- There are two binaries, `openzca` and `zca`, both pointing at `dist/cli.js` (`package.json` `bin`).
- It needs **Node >= 22.13.0** (`package.json` `engines`), because it uses `node:sqlite`. The website's "Node 18+" claim is stale.
- The current version is 0.1.60, released 2026-09-27; its only change was the zca-js 2.2.0 bump (`CHANGELOG.md`).
- On Windows, npm installs an `openzca.cmd` shim. `asyncio.create_subprocess_exec("openzca", ...)` will not resolve that shim. Spawn `node <npm-root>/openzca/dist/cli.js` instead, which also avoids `cmd.exe` quoting problems with message text.
- Always put `--profile <name>` **before** the subcommand. `listen` defines its own `-p, --prefix`, which collides with the global `-p, --profile` (lines 4549 and 7473).

## 2. Auth, state and profiles

**Login options.**
- `openzca auth login` starts a QR login. It accepts `--qr-path <png>`, `--open-qr`, and `--qr-base64`.
- In a headless environment, set `OPENZCA_QR_AUTO_OPEN=0`, otherwise it tries to open an image viewer (`src/lib/client.ts`).
- `--qr-base64` spawns a detached child that performs the actual login, waits up to 20 s for the PNG, prints one line `data:image/png;base64,...` and exits (`emitQrBase64FromDetachedLogin`, line 3573). The detached child saves the credentials once the QR is scanned. This makes it the only non-blocking login path for integrations.
- `openzca auth login-cred [file]` logs in from a JSON file containing `{imei, cookie, userAgent, language?}` (`src/lib/types.ts` `StoredCredentials`) and then saves it.

**Where state lives.**
- The root is `$OPENZCA_HOME`, defaulting to `~/.openzca` (`src/lib/store.ts`).
- Under it are `profiles.json`, `profiles/<name>/credentials.json`, `cache/{friends,groups,meta}.json`, the listener owner lock, `listen.sock` (on Windows, the named pipe `\\.\pipe\openzca-listen-<profile>`), and an optional `messages.sqlite`.

**Profile selection.** The order of precedence is:
1. `--profile` / `-p`.
2. `OPENZCA_PROFILE`, or the legacy `ZCA_PROFILE`.
3. `defaultProfile` in `profiles.json`.
4. `default`.

An unknown non-default profile fails with `Profile "x" does not exist` (`resolveProfileName`). Profile names must match `[A-Za-z0-9_-]+`.

**Non-interactive auth check.** `openzca --profile P auth status` (line 4753) works as follows:
- If there are no credentials, it writes `Error: Profile P: not logged in` to stderr and exits with **code 1**.
- Otherwise it performs a **live login**. If the cookies are expired, it writes `Error: <zca-js message>` to stderr and exits with code 1.
- On success it exits 0 and prints a `util.inspect` object (not JSON): `{ profile: 'P', loggedIn: true, userId: '...', displayName: '...', credentialsPath: '...' }`. It has no `--json` flag.
- A cheaper offline check is whether `profiles/<P>/credentials.json` exists. `account list` exposes this as `loggedIn`, but only as a console table. That check does not prove the cookies are still valid.

**Own UID.** `openzca me id` prints the bare UID on one line; it needs a network login. `openzca me info --json` prints JSON. `db me id` works only if the DB is enabled.

## 3. `openzca listen --raw`

**Recommended invocation.**
`openzca --profile P listen --raw --self --supervised` with the env var `OPENZCA_LISTEN_HEARTBEAT_MS=30000`.

In supervised mode, zca-js internal retries are disabled, so the adapter owns restarts. Without `--supervised`, `--keep-alive` uses internal reconnects and a forced recycle every 30 min (exit 75).

**Per-line shape for a message** (built at lines 7871–7936). `JSON.stringify` drops undefined keys, so optional fields are absent rather than null.

```json
{"threadId":"<peerUid|groupId>","targetId":"<same>","conversationId":"<same>",
 "msgId":"7158000000001","cliMsgId":"1729900000123","content":"hello","type":0,
 "timestamp":1729900000,"msgType":"webchat",
 "metadata":{"isGroup":false,"chatType":"user","threadId":"...","targetId":"...",
   "senderDisplayName":"Alice","senderId":"111","fromId":"111","toId":"<ownUid>",
   "msgType":"webchat","timestamp":1729900000},
 "chatType":"user","senderId":"111","senderName":"Alice","senderDisplayName":"Alice",
 "toId":"<ownUid>","ts":"1729900000123"}
```

**Core fields.**
- `type` is the zca-js `ThreadType` enum: **0 means a user (DM), 1 means a group**. `chatType` is `"user"` or `"group"`.
- `threadId` is the other user's UID for a DM and the group ID for a group (zca-js `src/models/Message.ts`).
- `timestamp` is in epoch seconds. `ts` is the raw millisecond string.
- `msgId` and `cliMsgId` are strings.

**Field differences by message type.**
- **Group text:** `type:1`, `chatType:"group"`, `metadata.isGroup:true`, `metadata.threadName` (when Zalo provides it) and `metadata.senderName`. For DMs, `metadata.senderName` is intentionally omitted.
- **Group @mention:** `mentions:[{"uid":"<ownUid>","pos":0,"len":7,"type":0,"text":"@Hermes"}]` and `mentionIds:["<ownUid>"]`. The same data is mirrored in `metadata.mentions`, `metadata.mentionIds` and `metadata.mentionCount`. An `@all` mention has `uid:"-1"` and `type:1` (zca-js `sendMessage.ts` line 280). Bot-mention test: own UID in `mentionIds` or `"-1"` in `mentionIds`.
  - **Caveat:** `extractInboundMentions` (line 4385) recursively scans every object in `content` for keys `uid`, `userId` or `id`. Sticker content is shaped like `{id, catId, type}`, so it yields a **bogus mention** whose uid is the sticker ID. Only trust `mentionIds` when `msgType` is `webchat` or `chat.text`.
- **Image (`chat.photo`, also `chat.gif`):**
  - Fields: `mediaKind:"image"`, `mediaUrl`, `mediaUrls`, and when the download succeeded, `mediaPath`, `mediaPaths`, `mediaType` (e.g. `image/jpeg`), `mediaTypes`.
  - `content` becomes `[media attached: /abs/file.jpg (image/jpeg) | https://...]`, followed by the caption on a new line.
  - For several attachments it becomes `[media attached: N files]` plus one `[media attached i/N: ...]` line per file.
- **Video:** `msgType:"chat.video.msg"`, `mediaKind:"video"`.
- **Voice:** `msgType:"chat.voice"`, `mediaKind:"audio"`. The URL comes from `voiceUrl` or `m4aUrl`.
- **File:** `msgType:"share.file"`, `mediaKind:"file"`. The file name is not a top-level field. It only appears as the caption or summary, through `title` or `fileName`.
- **Sticker:** `msgType:"chat.sticker"` is classified as `mediaKind:"image"`, but it carries no URL. `content` is `<non-text:chat.sticker>`.
- **Reply:** `quote` holds `{ownerId, senderName, msg, attach, mediaUrls, ts, cliMsgId, globalMsgId, cliMsgType}`. `content` gets an extra line `[reply context: <name>: <summary>]`. Disable that line with `OPENZCA_LISTEN_INCLUDE_QUOTE_CONTEXT=0`.
- **Own messages:** these appear only with `--self`. No `isSelf` or `fromMe` field is emitted, even though zca-js computes `message.isSelf`. zca-js rewrites `uidFrom` from `"0"` to the own UID, so the test is **`senderId == ownUid`**. With `--self`, the adapter must drop these to avoid answering itself.

**Media latency.** Media downloads finish **before** the line is emitted: up to 4 files, a 20 MB cap and a 10 s timeout per file (env vars `OPENZCA_LISTEN_MEDIA_*`). If a download fails, a `Warning: failed to cache ...` line goes to stderr and `mediaPath` is absent, but `mediaUrl` is kept. Messages whose text resolves to empty are dropped silently.

**Non-message events.**
- **Polls only:** `{"kind":"group_event","event":"poll",...}`.
- **Lifecycle lines** (only with `--supervised --raw`): `{"kind":"lifecycle","event":"session_id|connected|heartbeat|error|closed","session_id":"...","profile":"P","timestamp":<s>}`. `error` adds `message`; `closed` adds `code` and `reason`.
- **Not forwarded:** reactions, typing, undo, seen/delivered, and friend events, even though zca-js emits them.
- **How to tell lines apart:** a message line has no `kind` key.
- **Errors:** they also go to stderr as `Listener error: ...`.

**Exit and reconnect behaviour.**
- **Auth failure at startup** (no credentials, or expired cookies inside `zalo.login`): `Error: ...` on stderr, exit 1.
- **Websocket close** without keep-alive, or in supervised mode: stdout `Listener closed (<code>) <reason>`, then the process ends with **exit 0**.
- **Close codes:**
  - 1000 is a manual closure.
  - 3000 is `DuplicateConnection`, which means another session took the socket (zca-js `src/apis/listen.ts`).
  - Other codes are Zalo-specific.
- **Detecting auth loss mid-stream:** it is reported only as a close, and the restart fails with exit 1. The supervisor should treat "restart → exit 1 with a login error" as auth loss.
- **Recycle:** a timed recycle exits 75.
- **Signals:** SIGINT and SIGTERM run cleanup and then exit.
- **Single listener per profile:** a second `listen` fails with `Another openzca listener already owns profile "P" (pid N).` and exit 1. A stale lock file left by a dead PID is cleaned up automatically.

## 4. Sending

All send commands share the same failure handling: on error, `wrapAction` writes `Error: <message>` to stderr with **exit 1** (line 247). A send is retried once after 750 ms, but only for timeout or reset-type errors (`src/lib/send-retry.ts`; tune with `OPENZCA_SEND_RETRY_COUNT` and `OPENZCA_SEND_RETRY_DELAY_MS`).

**Text.**
- DM: `openzca msg send <uid> "<text>"`. Group: add `-g` / `--group`. Use one argv element for the text; no shell is needed.
- Output is a `util.inspect` dump, e.g. `{ message: { msgId: 7158000000001 }, attachment: [] }`. `msgId` is a JS number with about 13 digits, which is below 2^53.
- When the text is split into several messages, the output looks like `{ chunked: true, chunkCount: 2, msgId: '7158...', response: [ ... ] }`, where `msgId` is the last chunk's.
- Robust parse: the first match of `msgId:\s*'?(\d+)`.

**Formatting.** It is on by default; `--raw` disables it (`src/lib/text-styles.ts`).
- Inline: `**bold**`, `__bold__`, `*italic*`, `_italic_`, `~~strike~~`, plus `{red|orange|yellow|green|big|underline}...{/x}`.
- Line-level: `#` headings, `-` and `1.` lists, `>` indent.
- Code fences are stripped to plain text. Inline backticks are not handled.
- Group sends resolve `@Name` and `@uid` into real mentions. An ambiguous name makes the command fail.
- Pass `--raw` when the text is not authored for this dialect.

**Length and chunking.** Text is split automatically above 2000 rendered characters (`OPENZCA_TEXT_MESSAGE_MAX_LENGTH`) or above an estimated request size of 4000 (`OPENZCA_TEXT_REQUEST_PARAMS_MAX_ESTIMATE`). Constants are in `src/lib/text-send.ts`. `msg analyze-text ... --json` previews the result.

**Reply.** Use exactly one of the two options; giving both is an error.
- `--reply-id <id>` needs `db enable` and looks up the message in SQLite.
- `--reply-message '<json>'` accepts the listen `--raw` line directly. It needs `msgType`, `senderId`/`uidFrom`, `msgId`, `cliMsgId`, and `ts` or `timestamp`, plus `content` (`src/lib/reply.ts`). **Prefer this one.**

**Images.** `msg image <thread> [file] [-u URL]... [-m caption] [-g]`. This goes over plain HTTP upload with no websocket needed.

**Files.** `msg upload <file> <thread> [-g]`. Note the argument order: file first when both are given, or `msg upload <thread> -u URL`.
- File upload needs a websocket. When a listener is running, it goes through the listener's IPC.
- Without the `-g` flag it defaults to a user thread; set `OPENZCA_UPLOAD_AUTO_THREAD_TYPE=1` to auto-detect.

**Voice.** `msg voice <thread> [file] [-u URL] [-g]`. Output is an array of results.
- A URL is sent directly. A local file is uploaded through a **temporary websocket that does not use the IPC path**. That may kick the running listener with close code 3000.
- Safer options: send voice as a URL, or set `OPENZCA_VOICE_PUBLISH_CMD`.

**Video.** `msg video <thread> [file] [-u URL] [--thumbnail X] [-m caption] [-g]`.
- **It fails while a listener is running** (`Active listener owner detected ... video upload IPC is unavailable`, line 5730) unless `OPENZCA_UPLOAD_ENFORCE_SINGLE_OWNER=0` is set.
- Native mode needs `ffmpeg`; otherwise it falls back to an attachment.

**Other commands.** `msg typing <thread> [-g]` and `msg react <msgId> <cliMsgId> <thread> <reaction> [-g]` also exist.

## 5. Inbound media URLs

The URLs are plain HTTP(S) Zalo CDN URLs. openzca itself downloads them with a bare `fetch(url)` that sends no cookies or headers (`cacheInboundMediaToProfile`, line 3953), which shows they can be fetched without auth.

Neither the source nor the docs mention expiry. Because openzca already writes the file to `mediaPath` under `~/.openclaw/media/openzca/<profile>/inbound`, the adapter should read `mediaPath` when it runs on the same host and fall back to `mediaUrl` otherwise.
- `OPENCLAW_STATE_DIR` or `OPENZCA_LISTEN_MEDIA_DIR` override the directory.
- openzca never prunes these files, so the adapter or an operator must clean them up.

## 6. Daemon or server mode

There is no request/response daemon.
- Every `msg ...` invocation starts Node, reads `credentials.json` and runs `zalo.login()`. That login makes HTTP calls to Zalo's login and server-info endpoints, so expect roughly 1–3 s per send; this figure is an estimate and was not measured.
- The only long-lived channel is the listener's IPC (lines 382–420 and 633). It takes newline-delimited JSON `{"kind":"upload","requestId","profile","threadId","threadType":"user|group","attachments":[absPaths],"uploadTimeoutMs?"}` and replies with one line `{"kind":"upload_result","requestId","ok":true,"response":...}` or `{"ok":false,"error":"..."}`.
- Any other `kind` is rejected. The IPC protocol is undocumented and internal.

Ranked options:

| Rank | Option | Latency | Complexity | Risk |
|---|---|---|---|---|
| 1 | Spawn per send (the CLI as designed) | ~1–3 s per send | Lowest | A re-login per send adds traffic to Zalo |
| 2 | A small Node sidecar that imports `zca-js` directly (one login, one websocket, JSON over stdio) | Milliseconds | A ~200-line Node file to maintain | Duplicates openzca's formatting and chunking unless it imports openzca internals, which are not exported |
| 3 | Talking to the listener IPC from Python | Low | Low | Files only, no captions, and the internal contract may change |

**Recommendation:** use option 1 first, because a personal agent sends at low volume. Move to option 2 only if the measured latency or login volume becomes a problem.

## 7. Group and user info lookups

| Need | Command | Output |
|---|---|---|
| All groups with names | `group list --json` | JSON array with `groupId`, `name`, `totalMember`, `type`, ... (`buildGroupsDetailed`) |
| One group | `group info <gid>` | **`util.inspect` only**, the zca-js `gridInfoMap[gid]` object (`name`, `totalMember`, ...) |
| Group members | `group members <gid> --json` | JSON |
| User profile | `msg member-info <uid> --json` | Raw `getUserInfo`; read `changed_profiles[uid]` (or `"<uid>_0"`) for `displayName` and `zaloName` |
| Friends | `friend list --json` | JSON array with `userId`, `displayName`, ... |
| Cached or offline | `db group info <gid> --json`, `db friend info <uid> --json` | JSON; needs `db enable` |

For `get_chat_info`, use the listen line's `chatType` for the type. For the name, use `metadata.threadName` (groups) or `senderDisplayName` (DMs), and fall back to `group list --json` or `msg member-info --json`, with results cached in the adapter.

## 8. Rate limits and ban risk

None of the sources publish rate limits. The warnings that do exist:
- zca-js README: "Using this API could get your account locked or banned... Use it at your own risk."
- openzca.com FAQ: automation "may violate Zalo's Terms of Service and could result in account restrictions."

openzca does no throttling of its own; it only has the single retry. The adapter should therefore:
- Space its sends out itself.
- Avoid mass-sending to non-friends.
- Keep exactly one listener per profile, since a duplicate connection triggers close code 3000.
- Avoid the per-send re-login overhead if send volume grows (see section 6).

## Trade-offs and adoption risk

- **Maturity:** this is a single-maintainer project ("Tom") at version 0.1.x with frequent releases and an MIT licence. It sits on zca-js, an unofficial reverse-engineered client that is moderately active (last commit 2026-10-13). Zalo protocol changes can break both without warning.
- **Contract stability:** the `listen --raw` field names are deliberately backward-compatible. The duplicated top-level and `metadata.*` fields exist for OpenClaw. The text output of send commands is not a contract.
- **Fit for Hermes:** a gateway adapter that supervises one `listen --supervised --raw` child and spawns short `msg` children matches openzca's intended OpenClaw usage. Per the root `AGENTS.md`, it should live as a gateway platform adapter or plugin, with config in `config.yaml` and no new `HERMES_*` env vars.

## Limitations

- Everything above was read from source. No live Zalo session was run, so the example payloads are derived from code and real Zalo field values may vary, for example whether `threadName` is populated or what file `content` keys look like.
- The zca-js `dist` typings could not be inspected (blocked by a local hook), so the zca-js GitHub source at v2.2.0 was used instead.

## Unresolved questions

1. Do Zalo CDN media URLs expire, and after how long? This needs a live test.
2. Is a mid-stream cookie expiry signalled by a specific close code, or only by the restart failing? This needs a live session.
3. Is a sticker or image `content` object ever free of `id` keys? This affects the reliability of the bogus-mention caveat.
4. Does a `--self` listener also receive messages sent from the account's phone? zca-js marks them `uidFrom == "0"`, so it probably does; worth confirming so the agent does not reply to the human owner's own messages.
5. Should the adapter ask upstream for `--json` on `msg send` and an `isSelf` field? Both are small upstream PRs that would remove the regex parsing and the UID comparison.
