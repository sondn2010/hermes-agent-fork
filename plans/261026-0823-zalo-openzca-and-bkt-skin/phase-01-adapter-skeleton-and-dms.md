---
phase: 1
title: "openzca process layer, adapter skeleton and DMs"
status: pending
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: openzca process layer, adapter skeleton and DMs

## Goal

A registered `zalo` platform that connects, relays Zalo DMs to the agent, sends text replies, and
never leaves a `listen` child behind.

## Context

- Canonical shape: `plugins/platforms/irc/` (`plugin.yaml`, `__init__.py`, `adapter.py` with
  `register(ctx)` at `adapter.py:589`). Mirror its config helpers: `get_scoped_secret`,
  `seed_extra_from_env` from `gateway.platforms._shared` (`irc/adapter.py:19-21`), `_env_or_extra`
  (`irc/adapter.py:70`), `_env_enablement` (`irc/adapter.py:421`), `_acquire_platform_lock`
  (`irc/adapter.py:168`), `_set_fatal_error` and `_mark_connected`.
- `register_platform` kwargs: `hermes_cli/plugins.py:773`. `BasePlatformAdapter` surface:
  `connect`/`disconnect`/`send` (`gateway/platforms/base.py:2675-2688`), `get_chat_info` (`:4827`),
  `handle_message` (`:3989`). `MessageEvent` fields: `gateway/platforms/event.py:45`.
- Executable lookup: `hermes_platform.resolver.locate_command(name)` returns a `Resolution` with
  `.found` and `.command` (a tuple; `hermes_platform/resolver/core.py:116`). The "plugins exempt"
  flag at `tests/test_managed_runtime_resolution.py:52-57` only waives the AST lint ratchet — it
  does not make PATH Node lookups correct.
- Node resolution: use `find_node_executable("node")` from `hermes_constants` (`:569-590`) to get
  the PM-managed Node, falling back to PATH. Apply `with_hermes_node_path()` (`:610`) to every child
  env. Always spawn `[node, <pkg>/dist/cli.js]`; the `.cmd` rewrite handles PATH hits and must also
  apply to an explicit `ZALO_OPENZCA_BIN` value.
- Child env: build with `hermes_subprocess_env()` (`tools/environments/local.py:345-358`) as the
  base, then add `with_hermes_node_path()` and the `OPENZCA_*` overrides; explicitly unset
  `OPENCLAW_STATE_DIR`. Never copy `os.environ` directly — it leaks every provider API key and
  crosses profiles under multiplex.
- openzca contract: researcher report §1–4, §7.

## Files to create

- `plugins/platforms/zalo/__init__.py` — `from .adapter import register`.
- `plugins/platforms/zalo/plugin.yaml` — `name: zalo-platform`, `kind: platform`, `requires_env`:
  `ZALO_PROFILE`; `optional_env`: `ZALO_ALLOWED_USERS`, `ZALO_ALLOW_ALL_USERS`, `ZALO_HOME_THREAD`,
  `ZALO_GROUP_REQUIRE_MENTION`, `ZALO_OPENZCA_BIN`.
- `plugins/platforms/zalo/openzca_proc.py` — process layer, no Hermes gateway imports:
  - `resolve_openzca_argv(explicit: str | None) -> list[str] | None`: explicit path wins; else
    `locate_command("openzca")`; if the hit ends in `.cmd`/`.ps1`, return
    `[node, <dir>/node_modules/openzca/dist/cli.js]` with `node` from `locate_command("node")`.
  - `async run_cli(argv, *args, timeout) -> (code, stdout, stderr)` for one-shot commands; on
    timeout or `CancelledError`, send SIGTERM then SIGKILL to the child before re-raising.
  - `class ListenProcess`: spawns `<argv> --profile P listen --raw --self --supervised` with a child
    env built from `hermes_subprocess_env()` plus `with_hermes_node_path()`,
    `OPENZCA_LISTEN_HEARTBEAT_MS=30000`, `OPENZCA_QR_AUTO_OPEN=0`, `OPENZCA_LISTEN_MEDIA_DIR`
    (explicitly unset `OPENCLAW_STATE_DIR`); async iterator over parsed message dicts (only lines
    starting with `{`, skips lines with a `kind` key after logging lifecycle `error`/`closed` at
    INFO/WARNING, but yields the `closed` dict so the supervisor can read `code`); `stop()` sends
    SIGTERM, waits at most 2 s, then sends SIGKILL — wrapped in `try/finally` so `CancelledError`
    still kills the child. Stop the child before cancelling the reader. `track_msg_child(proc)` /
    `kill_msg_children()` tracks live `msg` children for `disconnect()` to kill.
  - `parse_msg_id(stdout) -> str | None` using `msgId:\s*'?(\d+)`.
- `plugins/platforms/zalo/adapter.py` — `ZaloAdapter(BasePlatformAdapter)` plus `register(ctx)`,
  `check_requirements`, `validate_config`, `is_connected`, `_env_enablement`, `interactive_setup`.

## Tasks & Steps

1. [ ] `register(ctx)`: `name="zalo"`, `label="Zalo"`, `required_env=["ZALO_PROFILE"]`,
       `allowed_users_env="ZALO_ALLOWED_USERS"`, `allow_all_env="ZALO_ALLOW_ALL_USERS"`,
       `allowlist_suppresses_pairing=True`,
       `cron_deliver_env_var="ZALO_HOME_THREAD"`, `standalone_sender_fn=_standalone_send`,
       `max_message_length=2000`,
       `install_hint="npm i -g openzca@<VERSION> (Node >= 22.13), then: openzca --profile <name> auth login — replace <VERSION> with the minimum version recorded in docs/bkt/zalo.md"`,
       and a `platform_hint` saying Zalo renders `**bold**`, `*italic*` and lists but not tables
       or code fences; warn that `ZALO_ALLOW_ALL_USERS` exposes the agent to every contact and
       group member who @mentions it.
2. [ ] `check_requirements()`: `ZALO_PROFILE` set and `resolve_openzca_argv` non-None. Run
       `openzca --version` via `run_cli` (10 s timeout); parse the Node semver and return a
       distinct `zalo_node_version` error when Node < 22.13. Also check that the installed openzca
       version meets the minimum pinned version recorded in `docs/bkt/zalo.md` (the version pinned
       at plan-write time by running `npm view openzca version`). No interactive install.
3. [ ] `connect()`: wrap the whole body in `try/except BaseException` with a `finally` that stops
       any started child and calls `_release_platform_lock()` on failure. Acquire the platform lock
       with `_acquire_platform_lock("zalo", profile, f"Zalo profile {profile}")` (three args).
       Call `_reap_orphan_if_ours()` before spawning to reclaim a pidfile left by a prior crash.
       Run `me id` (timeout 15 s); classify stderr: auth-failure strings (`not logged in`, zca-js
       cookie/session errors) → `retryable=False` `zalo_auth`; all other exit 1 (DNS, timeout,
       network) → `retryable=True` `zalo_connect`. Start `ListenProcess`, write the pidfile (PID +
       process start-time) to `<HERMES_HOME>/cache/zalo-<profile>.pid`, start the reader task,
       `_mark_connected()`.
4. [ ] Reader task (no in-adapter restart loop — the gateway watcher owns all retries):
       parse each stdout line; when a `closed` lifecycle dict arrives, record its `code` and treat
       the child's exit as a fatal event. Classify and call `_set_fatal_error` then
       `await self._notify_fatal_error()` for every case:
       - code 3000 (`DuplicateConnection`) → `retryable=True` `zalo_duplicate_session`, WARNING
         directing the operator to use a dedicated account;
       - exit 1 with `Another openzca listener` and the pidfile not identifying this process →
         `retryable=True` `zalo_duplicate_listener`;
       - exit 1 (other) → re-run `me id` (same stderr classification as task 3); if that also
         fails → `zalo_auth` (retryable=False for auth strings, True otherwise);
       - clean exit 0 or 75 → `retryable=True` `zalo_disconnected`.
       The gateway reconnect watcher (`run_adapters.py:710-712`, 30 s → 300 s backoff) handles
       all retries. No backoff loop inside the adapter.
5. [ ] Inbound routing: drop when `senderId == own_uid`; drop when `type != 0` (groups land in
       phase 2); build source with `chat_id=threadId`, `chat_type="dm"`,
       `user_id=senderId`, `user_name=senderDisplayName`; `MessageEvent(text=content,
       message_id=msgId, raw_message=<line dict>)`; `await self.handle_message(event)`.
6. [ ] Keep a bounded (256) `msgId -> raw line` map so a reply can pass `--reply-message <json>`.
7. [ ] `send(chat_id, content, reply_to)`: serialize on an `asyncio.Lock` (acquire with a 10 s
       timeout; check `is_connected` after acquiring). Build argv
       `msg send -- <thread> <content>` (the `--` prevents content starting with `-` from being
       parsed as options); add `--group` for `group:` IDs; add a reduced `--reply-message` payload
       (only `msgType`, `senderId`, `msgId`, `cliMsgId`, `ts`, with `content` truncated to 100
       chars) when `reply_to` is in the map. Run with a 30 s hard timeout that kills the child on
       cancel or expiry via `track_msg_child`. On exit 1, retry with `--raw` ONLY when stderr
       matches a formatting or mention-resolution error (e.g. contains `ambiguous` or `format`);
       all other exit 1 returns `SendResult(success=False)` without a second attempt. Return
       `SendResult(success, message_id=parse_msg_id(stdout), error=<redacted stderr — no personal
       data>)`.
8. [ ] `get_chat_info`: cached `{name, type}` from inbound `senderDisplayName` /
       `metadata.threadName`; fallback name = ID.
9. [ ] `disconnect()`: kill all tracked `msg` children first via `kill_msg_children()`, then cancel
       the reader, call `ListenProcess.stop()` (2 s grace + kill), delete the pidfile, release the
       platform lock.
9.1. [ ] Add class attribute `serial_receive_loop = True` to `ZaloAdapter`.
9.2. [ ] `_standalone_send(pconfig, chat_id, message, **kwargs)`: resolve openzca argv from
         `pconfig`; run `msg send -- <chat_id> <message>` with `--group` for `group:` IDs, using
         the same filtered env recipe as `ListenProcess`.
9.3. [ ] `_reap_orphan_if_ours()`: read the pidfile; if the PID no longer exists or its
         start-time fingerprint does not match, send SIGTERM then SIGKILL and delete the pidfile.
         Pidfile: `<HERMES_HOME>/cache/zalo-<profile>.pid`.
9.4. [ ] Use absolute imports for sibling modules: `from plugins.platforms.zalo.openzca_proc
         import …` (the test loader uses `spec_from_file_location` without a parent package, so
         relative imports break).
9.5. [ ] Adapter-local credential guard: add a `_reject_if_openzca_home(path)` helper that
         resolves the path and raises if it sits inside `~/.openzca` or `~/.openclaw`. Call it in
         `send_document`, `send_image` (for local-path sends), and `send_voice`/`send_video` before
         spawning `msg`. This is adapter-local only — no changes to `gateway/platforms/base.py`.
10. [ ] Tests in `tests/plugins/platforms/zalo/` (new dir), loading the plugin with
        `tests.gateway._plugin_adapter_loader.load_plugin_adapter("zalo")` as
        `tests/plugins/test_irc_inbound_identity.py` does. A fake openzca is a small Python script
        run as a real subprocess (`[sys.executable, fake_openzca.py]` via `ZALO_OPENZCA_BIN`-style
        argv injection) that emits recorded NDJSON lines and records send argv to a temp file.
        Cover: DM reaches `handle_message`; self line dropped; non-JSON and `kind` lines skipped;
        reply passes `--reply-message` with a reduced payload; `disconnect()` kills all `msg`
        children and leaves the `listen` child exited; close code 3000 sets a retryable fatal with
        a ≥ 30 s delay, not a 1 s restart; `connect()` cancellation releases the lock and stops
        the child; transient `me id` failure (DNS/timeout) is retryable; content starting with `-`
        does not become a CLI option; `standalone_sender_fn` delivers to a DM and to a `group:`
        prefix; attempting to send `~/.openzca/profiles/default/credentials.json` via the adapter
        is rejected.

## Verification

- `scripts/run_tests.sh tests/plugins/platforms/zalo/`
- `scripts/run_tests.sh tests/gateway/test_shared_platform_boilerplate.py`
- `python scripts/check` (lint and complexity ratchet: functions CC ≤ 20, ≤ 300 lines)

## Risks / rollback

Deleting `plugins/platforms/zalo/` and its tests removes the platform entirely; nothing else
references it.
