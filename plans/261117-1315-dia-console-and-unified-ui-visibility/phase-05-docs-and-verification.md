---
phase: 5
title: "Docs and full verification"
status: done
priority: P2
effort: "3h"
dependencies: [1, 2, 3, 4]
---

# Phase 05: Docs and full verification

## Goal

Document the console and the Show UI switches for end users and admins, record the new seams, and run every gate.

## Files

Modify, reading each one first:
- `docs/bkt-dia-modules-user-guide.md` (Vietnamese, plus an English summary):
  - Using `/dia`: status, running a module form, reading steps and sources, recent runs, monitoring.
  - Showing or hiding UIs on BKT Modules.
  - State plainly that the steps are Hermes-side request steps, not DIA pipeline steps.
- `docs/bkt-dia-modules-admin-setup.md`:
  - The console backend routes and what the health card needs.
  - A run from the console is refused for a disabled module.
  - The run log location (`<home>/plugin-data/bkt-dia-common/runs.db`, 500 rows, no answers stored).
  - `dashboard.hidden_plugins` semantics for modules and the console.
  - Troubleshooting rows for `stage` values.
  - Private and internal DIA endpoints no longer need `security.allow_private_urls`. Only cloud-metadata targets are blocked. Remove that setting from the example config and from the troubleshooting row.
  - Note that the run log stores a 200-character question preview per run, in the profile's local `plugin-data`.
- `website/docs/user-guide/features/bkt-modules.md`: the Show UI switch, and a short DIA AI Console section linking the user guide.
- `bkt/UPSTREAM-SEAMS.md`: a "bkt-dia console" section that lists `_require_token`, `plugin_storage.plugin_db`, `_plugin_route_secret_scope` (`?profile=`), the hub `user_hidden`/`orphan_dashboard_plugins` fields, `POST /api/dashboard/plugins/{name}/visibility`, and `GET /api/cron/jobs`.

## Steps

1. Update the docs. Verify every route, path and config key against the source.
2. Run the gates:
   - `scripts/run_tests.sh tests/plugins/bkt_dia tests/hermes_cli/test_plugins_hub_tags.py tests/ci/test_docs_drift.py`
   - `python scripts/boundary_lint.py --check` (843/20)
   - `python scripts/check` (only the existing `apps/desktop/src/i18n/vi.ts` FILE_LINES finding is allowed)
   - `pnpm --dir web typecheck && pnpm --dir web lint && pnpm --dir web test`
   - `git diff --stat main-bktech -- web/src/lib/api.ts`: no growth from this plan.
3. The prompt-surface test is Linux-only. No tools changed, so record that as not run, with the reason.
4. Run a code review over the whole diff: security of the run route, profile isolation, and no secret or endpoint leaks.

## Verification

All gates are green, or the plan records each one as not run, with the reason. The review has no Critical or High findings open.

## Risks / rollback

Docs only. Revert the four files.
