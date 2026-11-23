---
phase: 05
title: Docs and verification
status: in-progress
depends_on: [01, 02, 03, 04]
---

# Phase 05: Docs and verification

## Files (owned)
- `docs/bkt-dia-modules-user-guide.md`: the console is now the **Trung tâm DIA AI** tab with sub-tabs, and the UI is in Vietnamese.
- `docs/bkt-dia-modules-admin-setup.md`: the plugin bundle location, rebuilding with `cd bkt && npm run build`, and hiding the tab through BKT Modules → Show UI on `bkt-dia-common`.
- `website/docs/user-guide/features/bkt-modules.md`: update any `/dia` description that calls it a core page.
- `bkt/UPSTREAM-SEAMS.md` § "bkt-dia console":
  - the page is now `bkt/packages/dia` (plugin);
  - drop the rows for the core page and the `/dia` nav entry;
  - add the core APIs the plugin reads: `/api/cron/*`, `/api/dashboard/plugins/hub`, and the SDK components it uses.
- `bkt/README.md`: add `dia` to the package list, and note that its output goes to `plugins/bkt_dia_common`.

## Verification gates
1. `cd bkt && npm run typecheck && npm test && npm run build && npm run check:dist`
2. Web: `npm run typecheck`, lint and vitest.
3. `scripts/run_tests.sh tests/plugins/bkt_dia tests/hermes_cli/test_plugins_hub_tags.py`
4. `bash scripts/run-in-hermes-env python3 scripts/boundary_lint.py`, which must be no worse than before.
5. `python scripts/check`: no new findings.
6. `git diff origin/main --stat -- web/src`: no DIA console paths.
7. Manual check in `hermes dashboard`:
   - `/dia` shows the tab and its 7 sub-tabs, and `?tab=` survives a reload;
   - run one tool;
   - hide one module and confirm its panel disappears;
   - hide `bkt-dia-common` on `/bkt-modules`, reload, and confirm the tab disappears;
   - switch profile and confirm recent runs change.

## Finish
- Review with `code-reviewer` (cross-module change).
- Write a journal entry. Commit only with the user's approval, as conventional commits, for example `feat(bkt-dia): serve the DIA console as a dashboard plugin` and `refactor(web): remove the core DIA console page`.
