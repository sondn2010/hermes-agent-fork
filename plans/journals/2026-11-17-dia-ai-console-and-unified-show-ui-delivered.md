---
title: DIA AI Console and unified Show UI delivered
date: 2026-11-17
summary: Built /dia console + Show UI toggles on BKT Modules across 5 parallel phases; fixed stale-pyc catalog reload and run-log OSError found in review.
---

# DIA AI Console and unified Show UI delivered

## What happened
Plan `plans/261117-1315-dia-console-and-unified-ui-visibility` was carried out with parallel subagents: phases 01 (backend) and 02 (web wiring) ran together, then 03 (`/dia` page) and 04 (BKT Modules Show UI), then 05 (docs, gates and review).
- Backend: `plugins/bkt_dia_common/dashboard/plugin_api.py` serves modules, health, run and runs. The agent tool and the console share one path, `run_query_tool`. Runs are logged per profile in `plugin-data/bkt-dia-common/runs.db`.
- URL safety for the configured DIA endpoint is now userinfo rejection plus `is_always_blocked_url`. Private and loopback endpoints work without `security.allow_private_urls`.
- Web: the `/dia` console lives under `web/src/pages/dia-console/`. Show UI switches and dashboard-tab rows were added to `/bkt-modules`. `api.ts` did not grow.

## Root causes found during verification
- `test_changed_module_file_is_reloaded` failed intermittently. The catalog's nanosecond-mtime cache noticed the edit, but `exec_module` reused a `.pyc`, which is validated by whole-second mtime and size. Fix: compile the source directly in `module_catalog._load_module_spec`.
- `run_log` caught only `sqlite3.Error`. When `plugin_db` failed to create `plugin-data`, the `OSError` escaped and failed the tool call. It now catches both, and closes the connection if schema creation fails.
- A malformed `plugin.yaml` broke the whole catalog. It is now isolated per module.

## Environment notes
- The boundary-lint baseline was already stale before this plan (859/20, 19 un-baselined bkt and zalo crossings). This plan adds 2 deliberate crossings, recorded in `bkt/UPSTREAM-SEAMS.md`. `--update` was not run.
- corepack's pnpm 12.14.0 is broken on this machine because `pnpm.cjs` is missing. The cached pnpm 10.33.2 was used instead.
- `python` resolves to the py launcher, which follows the bash shebang. Use `bash scripts/run-in-hermes-env python3 scripts/...`.

## Next steps
- Run the manual dashboard check: hide Files+, one DIA module, and the console, then reload.
- The baseline owner decides on `boundary_lint --update`.
- Commit when the user approves.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
