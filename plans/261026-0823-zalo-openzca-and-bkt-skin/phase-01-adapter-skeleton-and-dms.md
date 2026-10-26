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
  `.found` and `.command` (`hermes_platform/resolver/core.py:71-116`). Plugins are exempt from the
  bare-`shutil.which` ban (`tests/test_managed_runtime_resolution.py:52-57`), but use the resolver.
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
  - `async run_cli(argv, *args, timeout) -> (code, stdout, stderr)` for one-shot commands.
  - `class ListenProcess`: spawns `<argv> --profile P listen --raw --self --supervised` with a child
    env built from a copy of the process env plus `OPENZCA_LISTEN_HEARTBEAT_MS=30000`,
    `OPENZCA_QR_AUTO_OPEN=0` (never mutates `os.environ`); async iterator over parsed message
    dicts (only lines starting with `{`, skips lines with a `kind` key after logging lifecycle
    `error`/`closed` at INFO/WARNING); `stop()` sends terminate, waits 5 s, then kills.
  - `parse_msg_id(stdout) -> str | None` using `msgId:\s*'?(\d+)`.
- `plugins/platforms/zalo/adapter.py` — `ZaloAdapter(BasePlatformAdapter)` plus `register(ctx)`,
  `check_requirements`, `validate_config`, `is_connected`, `_env_enablement`, `interactive_setup`.

## Tasks & Steps

1. [ ] `register(ctx)`: `name="zalo"`, `label="Zalo"`, `required_env=["ZALO_PROFILE"]`,
       `allowed_users_env="ZALO_ALLOWED_USERS"`, `allow_all_env="ZALO_ALLOW_ALL_USERS"`,
       `cron_deliver_env_var="ZALO_HOME_THREAD"`, `max_message_length=2000`,
       `install_hint="npm i -g openzca (Node >= 22.13), then: openzca --profile <name> auth login"`,
       and a `platform_hint` saying Zalo renders `**bold**`, `*italic*` and lists but not tables
       or code fences.
2. [ ] `check_requirements()` is passive: `ZALO_PROFILE` set and `resolve_openzca_argv` non-None.
       No subprocess, no install.
3. [ ] `connect()`: acquire the platform lock on `zalo:<profile>`; run `me id` (timeout 30 s) to get
       the own UID — exit 1 → `_set_fatal_error("zalo_auth", "...run: openzca --profile P auth
       login", retryable=False)`; start `ListenProcess` and the reader task; `_mark_connected()`.
4. [ ] Supervisor in the reader task: on child exit 0 or 75, restart with backoff (1 s doubling to
       60 s, reset after 5 min healthy). On exit 1, if stderr contains `Another openzca listener`
       → fatal `zalo_duplicate_listener` non-retryable; otherwise re-run `me id`, and if that also
       fails → fatal `zalo_auth`.
5. [ ] Inbound routing: drop when `senderId == own_uid`; drop when `type != 0` (groups land in
       phase 2); build source with `chat_id=threadId`, `chat_type="dm"`,
       `user_id=senderId`, `user_name=senderDisplayName`; `MessageEvent(text=content,
       message_id=msgId, raw_message=<line dict>)`; `await self.handle_message(event)`.
6. [ ] Keep a bounded (256) `msgId -> raw line` map so a reply can pass `--reply-message <json>`.
7. [ ] `send(chat_id, content, reply_to)`: serialize on an `asyncio.Lock` with ≥ 1 s since the last
       send; argv `msg send <thread> <content>` plus `--group` for `group:` IDs and
       `--reply-message` when `reply_to` is in the map; on exit 1 retry once with `--raw`; return
       `SendResult(success, message_id=parse_msg_id(stdout), error=stderr tail)`.
8. [ ] `get_chat_info`: cached `{name, type}` from inbound `senderDisplayName` /
       `metadata.threadName`; fallback name = ID.
9. [ ] `disconnect()`: cancel reader, `ListenProcess.stop()`, release the platform lock.
10. [ ] Tests in `tests/plugins/platforms/zalo/` (new dir), loading the plugin with
        `tests.gateway._plugin_adapter_loader.load_plugin_adapter("zalo")` as
        `tests/plugins/test_irc_inbound_identity.py` does. A fake openzca is a small Python script
        run as a real subprocess (`[sys.executable, fake_openzca.py]` via `ZALO_OPENZCA_BIN`-style
        argv injection) that emits recorded NDJSON lines and records send argv to a temp file.
        Cover: DM reaches `handle_message`; self line dropped; non-JSON and `kind` lines skipped;
        reply passes `--reply-message`; `disconnect()` leaves the child exited; exit 1 with the
        duplicate-listener text sets a non-retryable fatal error.

## Verification

- `scripts/run_tests.sh tests/plugins/platforms/zalo/`
- `scripts/run_tests.sh tests/gateway/test_shared_platform_boilerplate.py`
- `python scripts/check` (lint and complexity ratchet: functions CC ≤ 20, ≤ 300 lines)

## Risks / rollback

Deleting `plugins/platforms/zalo/` and its tests removes the platform entirely; nothing else
references it.
