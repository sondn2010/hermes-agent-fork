---
phase: 09
title: Integration & verification
wave: C
status: done
depends_on: [02, 03, 04, 05, 06, 07, 08]
---

# Phase 09: Integration & verification

## Files owned
- `tests/plugins/bkt_dia/test_all_modules_contract.py`
- `scripts/boundary_lint_baseline.json`, only if the lint shows an intended new entry; a regression means fixing the code
- Fix authority: after wave B has ended, small fixes in any bkt plugin dir. Record each fix in the report.

## Requirements
1. Cross-module contract test (behaviour, not a change detector):
   - every dir `plugins/bkt-dia-*` has exactly one `category:*` tag, and its slug is in `plugins/bkt_dia_common/categories.py`;
   - all tool names are globally unique and match `bkt_dia_*`;
   - every plugin has `provides_tools: [...]` in its `plugin.yaml` exactly matching the registered tool names, and each plugin has at most 2 tools;
   - the 20 function codes F002, F005–F007, F010–F012 and F015–F027 each map to exactly one plugin;
   - in a temp `HERMES_HOME`, enabling all modules registers all of their tools; disabling one removes only its tools in a fresh load;
   - `hermes plugins validate` succeeds on all 20 plugins plus `bkt_dia_common` with 0 capability probe warnings/errors.
2. The prompt surface is unchanged: `scripts/run_tests.sh tests/ci/test_prompt_surface.py` passes **without** re-rendering. If it fails, a bkt plugin leaked into the stock surface (default-enabled); fix that instead of re-rendering.
3. Run the full gates: `python scripts/check`, `scripts/run_tests.sh tests/plugins/ tests/hermes_cli/test_plugins_hub_tags.py tests/ci/test_docs_drift.py tests/scripts/test_boundary_lint.py`, and in `web/` run `npm run typecheck && npm run lint && npm test`.
4. Live smoke against the real ES service, if reachable: configure the endpoint in a temp home (verifying resolution against `/api/v1/query` and health on `/api/v1/query/test`), enable F015 and F016, run one `hermes chat -q` question each, and confirm the answer cites sources. If the service is unreachable, say so in the report. Do not fake it.
5. Dashboard smoke: open `/bkt-modules`, check filters and category toggle, and confirm that `config.yaml` changes.

## Done means
- Global acceptance criteria 1–4 in `plan.md` are verified, each with evidence (command output) in the report `plans/reports/phase-09-verification-261112-bkt-modules.md`.
