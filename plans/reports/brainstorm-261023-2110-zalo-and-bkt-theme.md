# Brainstorm: Zalo channel + BKT theme (additive-only)

Date: 2026-10-23 · Branch: `main-bktech` · Status: contract accepted, ready to plan

Companion record: `brainstorm-261023-1038-bkt-dashboard-plugins.md` (dashboard plugins and the
`bkt` dashboard theme). This report covers the Zalo platform adapter and extends the theme work
to the CLI/TUI and Desktop surfaces.

## Revision 2026-10-26

- **Dashboard theme already delivered.** `bkt/theme/bkt.yaml` (commit `eb22f52992`) uses the full
  brand palette below. Remaining theme scope is the CLI/TUI skin (carrying the Desktop
  `customCSS`) and teaching `bkt/install.mjs` to copy it into `<HERMES_HOME>/skins/`.
- **Alternative evaluated and declined by the user.** Upstream's `plugin-catalog/zalo-platform.yaml`
  lists `moken627-hub/hermes-plugin-zalo` (official Zalo Bot API, `ZALO_BOT_TOKEN`, zero fork
  files, no ban risk, but a separate bot identity). The user chose openzca (option A): the agent
  drives a real personal Zalo account. The ban and Node risks below are accepted.
- No `zalo` platform name exists in the Python tree, so `plugins/platforms/zalo/` has no clash.
- Still open: the test account and whether it is dedicated, and Node 22.13+ on deploy hosts.

## Contract

**Outcome.** A Zalo channel that relays messages both ways between a Zalo account and the agent,
and a BKT-branded theme applied to the CLI/TUI, the web dashboard and the Desktop app. Both
arrive as new files only, so merging upstream `main` stays conflict-free.

**Constraints.**

- No modification of any file tracked by upstream. Only new paths.
- The Zalo adapter registers through `PluginContext.register_platform()` and speaks to Zalo only
  through the documented `openzca` CLI contract — never `zca-js` internals, never Hermes
  internals beyond the plugin API.
- Zalo credentials live in the profile `.env` or in openzca's own
  `~/.openzca/profiles/<name>/credentials.json`. Never in the repository, never echoed in logs.
- The `openzca listen` child process is tracked and terminated on adapter `disconnect()`, per
  `.claude/rules/process-management.md`. No orphaned Node processes.
- Profile scope is bound explicitly on every path that runs outside a turn, per the root
  `AGENTS.md` rule on one process serving many profiles.
- Branding uses exactly the supplied palette, listed under "Brand tokens" below.

**Non-goals.**

- Repairing the existing 853-file `Hermes Agent -> CNCNS Agent` rebrand (user decision: leave it).
- Contributing either piece upstream.
- Rebuilding the dashboard plugins already scoped in the 10:38 report.
- The official Zalo OA (Official Account) API. It is a different product requiring a registered
  business account, not a cheaper route to this outcome.

**Acceptance criteria.**

- `git diff origin/main --name-status` for this work shows only `A` (added) entries.
- A real Zalo direct message produces an agent reply in the same thread.
- A real Zalo group message, when the bot is addressed, produces a reply in that group.
- An inbound image and an inbound file reach the agent; an outbound image send succeeds.
- `/skin bkt` repaints the CLI, the Desktop picks up the same skin, and `bkt` is listed in the
  dashboard theme picker with the BKT logo in the header.
- Adapter tests pass under `scripts/run_tests.sh`.
- Killing the gateway leaves no surviving `openzca` Node process.

**Trade-offs.** See "Zalo transport" below. The chosen pipe transport depends most on openzca's
`--raw` JSON field names staying stable; it fails first if openzca renames `threadId` or
`chatType`. It was preferred over the webhook variant because it is the cheapest to abandon.

**Better approaches: none** — openzca is the correct dependency for driving a personal Zalo
account; the evaluated alternatives were more expensive without being more capable.

## Evidence

### Fork and sync-back state

- `origin/main` and `main-bktech` share merge-base `8237c7f8ec`; the fork is current with upstream.
- Commit `e62085a95e` rewrites **853 upstream files** for the CNCNS rebrand (1497 insertions,
  1494 deletions), reaching `hermes_constants.py`, `hermes_logging.py`, `agent/i18n.py`,
  `hermes_cli/gateway.py`, `setup.py` and roughly 20 upstream test files. This is the existing
  obstacle to clean upstream syncing. It is out of scope by user decision, and nothing in this
  work adds to it.

### openzca

- Node.js / TypeScript CLI (Node 22.13+) wrapping `zca-js`. MIT licensed.
- **Unofficial, reverse-engineered client for a personal Zalo account.** Not the official OA API.
- `openzca listen --raw` emits one JSON object per line on stdout. Routing fields observed in the
  documentation: `threadId`, `targetId`, `conversationId`, `senderId`, `toId`, `chatType`,
  `msgType`, `timestamp`, `msgId`.
- `openzca msg send <threadId> <message>`, with `--group` for group threads, `--reply-id <msgId>`
  for a stored message, and `--reply-message` taking the original `listen --raw` payload as JSON.
  Exactly one of the two reply flags.
- Auth via QR login or a credential JSON file (`openzca auth login-cred`); state in
  `~/.openzca/profiles/<name>/`.
- Sends text, images, videos, voice, stickers, links, contact cards and file uploads.

### Hermes extension surfaces that need no core edit

- `PluginContext.register_platform(name, label, adapter_factory, check_fn, ...)` at
  `hermes_cli/plugins.py:773`. `gateway/platform_registry.py` consults the registry before the
  built-in path, so a plugin-registered adapter is a first-class platform.
- `plugins/platforms/irc/` is the canonical shape: `plugin.yaml` declaring `requires_env` and
  `optional_env` (surfaced by `hermes config`), `__init__.py` exporting `register`, and
  `adapter.py` holding `register(ctx)` plus the adapter class.
- `BasePlatformAdapter` abstract surface is small: `connect(is_reconnect=False)`, `disconnect()`,
  `send(chat_id, content, reply_to=None, ...)` and `get_chat_info(chat_id)`.
- CLI/TUI skins load from `<HERMES_HOME>/skins/*.yaml` (`hermes_cli/skin_engine.py:365`).
- Dashboard themes load from `<HERMES_HOME>/dashboard-themes/*.yaml`
  (`hermes_cli/web_server_dashboard.py:437`). Themes cannot be shipped inside a plugin.
- The Desktop app consumes CLI skins and injects their `customCSS`, capped at 32 KiB
  (`hermes_cli/skin_engine.py:408`, `apps/shared/src/skin.ts:113`).

## Zalo transport: options compared

| | Stdout NDJSON pipe (chosen) | Local webhook listener | Node sidecar over `zca-js` |
|---|---|---|---|
| Inbound | `openzca listen --raw` child, read stdout lines | `openzca listen --webhook` into an aiohttp port | Own WS/HTTP service |
| Outbound | `openzca msg send` per reply | identical | Direct `zca-js` calls |
| Rests on | openzca's `--raw` field names | the same, plus a free port and the multiplex shared-ingress rules | the `zca-js` API surface |
| Fails first when | openzca renames a JSON field | a second profile needs the same port, or the port is occupied | `zca-js` ships a breaking change the fork now owns |
| Cost to abandon | Low | Medium | High |

**Chosen: the stdout pipe.** It needs no port, no webhook secret, and no interaction with
`gateway/platforms/shared_ingress.py`. The reply flag consumes the very payload the pipe has
already parsed, so replies need no message-ID bookkeeping.

## Design

### Placement (user decision)

`plugins/platforms/zalo/` — a new directory in this repository. Discovered as a bundled plugin,
so there is no install step, and because the path does not exist upstream it cannot produce a
merge conflict.

```
plugins/platforms/zalo/
├── __init__.py        # exports register
├── plugin.yaml        # requires_env / optional_env, surfaced by `hermes config`
├── adapter.py         # register(ctx) + ZaloAdapter(BasePlatformAdapter)
├── openzca_proc.py    # child-process lifecycle, NDJSON reader, send invocation
├── media.py           # inbound download + outbound upload mapping
└── README.md
```

### Adapter behaviour

- `connect()` verifies the `openzca` binary and Node version, confirms an authenticated profile,
  spawns `openzca listen --raw` and starts the stdout reader task.
- The reader parses each line, drops malformed lines with a warning rather than crashing, and
  dispatches into the gateway with `threadId` as the chat ID.
- `chatType` distinguishes direct from group. Group messages pass an addressing guard
  (mention or allowlist) before reaching the agent, so the bot does not answer every group line.
- `send()` invokes `openzca msg send <threadId> <text>`, adding `--group` for group threads and
  the reply flag with the stored inbound payload when replying.
- `disconnect()` terminates the child cleanly and escalates only if it ignores the signal.
- `check_fn` is a passive probe: is `openzca` on PATH and is Node new enough. It never installs.
  The active installer belongs in `ensure_deps_fn`.

### Environment contract (`plugin.yaml`)

| Variable | Required | Purpose |
|---|---|---|
| `ZALO_PROFILE` | yes | openzca profile name to drive |
| `ZALO_ALLOWED_USERS` | no | comma-separated sender IDs permitted to talk to the agent |
| `ZALO_ALLOW_ALL_USERS` | no | development escape hatch |
| `ZALO_HOME_THREAD` | no | thread for cron and notification delivery |
| `ZALO_GROUP_REQUIRE_MENTION` | no | group addressing guard, default on |
| `ZALO_OPENZCA_BIN` | no | explicit path when `openzca` is not on PATH |

### Chat types in scope (user decision)

Direct messages, group chats, and media. Media covers inbound image, file and voice reaching the
agent, and outbound image sending, routed through `gateway/platforms/media_cache.py` conventions.

### Theme (user decision: all three surfaces)

One brand, three artifacts, none of them core code:

1. `<HERMES_HOME>/skins/bkt.yaml` — CLI and TUI colors, banner, prompt, status bar, plus the
   `customCSS` block the Desktop injects.
2. `<HERMES_HOME>/dashboard-themes/bkt.yaml` — dashboard palette, `colorOverrides`,
   `componentStyles`, `customCSS`, `assets.logo`.
3. Desktop is served by artifact 1. A genuine built-in Desktop theme would require editing
   `apps/desktop/src/themes/`, which is upstream code, so `customCSS` is the additive route.

Because themes cannot ship inside a plugin, both YAML files need an install step that copies them
into `HERMES_HOME`. Source of truth stays in the repository under a new `bkt/` directory, matching
the layout the 10:38 report chose for the dashboard plugins.

### Brand tokens

| Role | Hex | Applied to |
|---|---|---|
| Primary | `#00ADEF` | primary buttons, active nav, user query callouts, input focus ring, live generation indicator |
| Secondary | `#3F51B5` | contextual framing, model badges, tool-invoke surfaces, elevated card borders |
| Tertiary | `#A2D149` | semantic validation only: completion, resolution, status pings, positive metrics |
| Canvas | `#0E1012` | deep backdrop |
| Base surface | `#1A1C1E` | base surface |
| Elevated | `#212428` | workbench panels, collapsible sidebar |
| Floating | `#282B30` | menus, tooltips |
| Text primary | `#F0F4F8` | conversational text |
| Text secondary | `#94A3B8` | telemetry, timestamps, parameters |

Tertiary is reserved for validation semantics and must not be used as a decorative accent.

## Risks

- **Account ban.** openzca drives a personal Zalo account over a reverse-engineered protocol.
  Zalo can detect and ban the account, and the session can be invalidated with no recourse. Use a
  dedicated account, not a personal one, and expect re-authentication to be a routine operation.
  This is a product risk, not an engineering defect.
- **Node dependency on the host.** Hermes is Python; this adapter requires Node 22.13+ and a
  resolvable `openzca` binary. `check_fn` must report this clearly rather than failing obscurely.
- **CLI contract drift.** openzca is young. Field names and flags may change. The NDJSON parser
  should tolerate unknown fields and log, not crash, on a shape it does not recognise.
- **Orphaned child processes.** A `listen` child that outlives the gateway is the exact failure
  mode `process-management.md` exists to prevent. Termination belongs in `disconnect()` and must
  be covered by a test.
- **Theme install drift.** The YAML lives in the repository but runs from `HERMES_HOME`. Editing
  one without reinstalling leaves the two out of sync; the install step should be a single
  documented command.

## Handoff

Next: `ak:plan` to phase the work, then `/ak:cook`. Suggested phase split, since the two tracks
share no files and can run in parallel: (1) Zalo adapter skeleton, registration and direct
messages; (2) group chats and the addressing guard; (3) media both ways; (4) the three theme
artifacts and their install step.

## Unresolved questions

- Which Zalo account will be used for testing, and is it a dedicated account rather than a
  personal one?
- Is Node 22.13+ already present on the target deployment hosts, or does provisioning need to
  cover it?
- For group chats, should the addressing guard be a mention, a command prefix, or a sender
  allowlist? The plan assumes mention-or-allowlist with mention required by default.
