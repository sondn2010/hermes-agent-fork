---
title: "Red-team and validation of Zalo/openzca + BKT skin plan"
date: 2026-10-26
summary: "15 adversarial findings (3 critical, 8 high, 4 medium) applied to plan; 4 decisions confirmed via validation interview"
plan: "plans/261026-0823-zalo-openzca-and-bkt-skin/"
---

## What happened

Ran a full red-team (3 parallel adversarial reviewers: Security Adversary, Failure Mode Analyst,
Assumption Destroyer) against `plans/261026-0823-zalo-openzca-and-bkt-skin/`, then ran the
validation interview (4 questions).

### Red-team: 15 findings accepted, 0 rejected

**3 Critical**

- **Child env leaks all secrets**: `os.environ.copy()` passed to openzca children hands every
  provider API key and bot token to a third-party npm package. Fix: use `hermes_subprocess_env()`
  (`tools/environments/local.py:345`) as the base, add only `OPENZCA_*` overrides.
- **`~/.openzca` not in file-delivery denylist**: the gateway's `_MEDIA_DELIVERY_DENIED_HOME_SUBPATHS`
  (`base.py:775`) has no entry for the openzca credential store. Fix: adapter-local
  `_reject_if_openzca_home()` helper that rejects paths inside `~/.openzca` and `~/.openclaw`.
- **`ListenProcess.stop()` 5 s grace equals the gateway's 5 s disconnect budget**: the kill step
  never runs when `disconnect()` is cancelled by the gateway timeout (`run.py:63`,
  `run_adapters.py:74`). Fix: 2 s SIGTERM then SIGKILL, whole teardown under 5 s.

**8 High**

- No `--` separator before argv positionals in `msg send` — content starting with `-` is parsed as
  an option.
- `allowlist_suppresses_pairing=True` not set — pairing codes sent to all unauthorized DMs
  (`gateway/authz_mixin.py:753`).
- SSRF: httpx fallback for file URLs and `msg image -u URL` bypass the gateway's SSRF-safe client
  (`base.py:639`).
- Orphaned listener after a gateway crash triggers a permanent non-retryable fatal; the WhatsApp
  pidfile pattern (`whatsapp/adapter.py:154`) was not reused.
- PATH Node lookup skips Hermes-managed Node; `find_node_executable` exists at
  `hermes_constants.py:569` and was not used.
- All `me id` exit 1 mapped to non-retryable `zalo_auth`; DNS/timeout failures become permanent.
- Reader-task fatals never call `_notify_fatal_error()` — gateway never reconnects; also missing
  `serial_receive_loop = True` attribute and relative imports break the test loader.
- `ZALO_GROUP_REQUIRE_MENTION=false` is a truthy Python string — the mention guard stays on.

**4 Medium**

- Send retry with `--raw` fires on any exit 1, duplicating messages on transient failures.
- Unaddressed-message media never cleaned up; no path containment; file read before size check.
- `standalone_sender_fn` not registered — cron delivery fails at runtime (`send_message_tool.py:581`).
- Desktop inline styles override `customCSS`; `colors.background` not set; installer functions
  not exported for tests.

### Validation: 4 decisions confirmed

| Decision | Answer | Applied |
|---|---|---|
| Supervisor recovery pattern | Gateway-watcher-only (no in-adapter restart loop) | Phase 1 task 4 rewritten |
| `~/.openzca` denylist scope | Adapter-local only | Phase 1 task 9.5 added |
| Zalo account for Phase 5 | Dedicated account confirmed available | Phase 5 updated |
| openzca version pinning | Pin to version current at write time | Phase 5 task 1 added; `check_requirements` extended |

## Decision

All 15 findings applied to the plan phase files. Validation decisions propagated. The plan has
zero unresolved contradictions and is ready for implementation.

## Next steps

- Before phase 1: verify openzca's commander parser honours `--` after `msg send` against the
  installed CLI package.
- Confirm whether Zalo runs alongside terminal or file-access tools on the deploy profile
  (determines prompt-injection severity for credential exfiltration).
- Implement with:
  ```
  /ak:cook /Users/sondn2010gmail.com/RiderProjects/hermes-agent-fork/plans/261026-0823-zalo-openzca-and-bkt-skin/plan.md
  ```
  Recommend `/clear` first to start with fresh context.

AgentWiki publish skipped.
