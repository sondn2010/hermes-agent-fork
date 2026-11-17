---
phase: 4
title: "BKT Modules: Show UI toggles"
status: pending
priority: P1
effort: "4h"
dependencies: [2]
---

# Phase 04: BKT Modules page becomes the single show/hide place

## Goal

Every bkt and DIA UI can be shown or hidden from `/bkt-modules`. The page shows two independent switches per row: **Enabled** for agent tools, and **Show UI**.

## Context

- The hub row already carries `user_hidden` and `has_dashboard_manifest`. `orphan_dashboard_plugins` holds the 8 dashboard-only bkt tabs (`bkt-author`, `bkt-brand`, `bkt-chat`, `bkt-files`, `bkt-health`, `bkt-kanban-workflow`, `bkt-profiles`, `bkt-prompts`). Following Phase 01's backend update in `hermes_cli/web_server_dashboard.py`, orphan rows also carry `"user_hidden": boolean` reflecting `dashboard.hidden_plugins`. They have no agent plugin, so they show no Enabled switch.
- To change visibility, use `api.setPluginVisibility(name, hidden)` (`web/src/lib/api.ts:1129`). It persists `dashboard.hidden_plugins` and invalidates the hub cache.
- Show UI applies to:
  - **Dashboard plugins** (orphans and any `has_dashboard_manifest` row): the sidebar tab or slot.
  - **DIA modules:** the module's panel in `/dia`. The console reads `user_hidden`.
  - **`bkt-dia-common`:** labelled "DIA AI Console". It hides the `/dia` nav entry.
  - Other agent-only `bkt-*` rows with no UI show no Show UI switch.
- The Show UI change takes effect after a dashboard refresh. Show a one-line notice; don't promise it is live.

## Files

Modify:
- `web/src/pages/bkt-modules/bkt-modules-grouping.ts` (+ its test):
  - Turn orphan `bkt-*` manifests into rows of kind `dashboard`. Agent rows are kind `agent`.
  - Derive `hasUi` (dashboard manifest, `bkt-dia-*` module, or `bkt-dia-common`).
  - Put the dashboard tabs in a "Dashboard tabs" group.
- `web/src/pages/bkt-modules/bkt-modules-store.ts`:
  - Add `setShowUi(name, show)` with the same optimistic-then-reconcile and pending-set pattern as `setEnabled`.
  - The two kinds of pending state are tracked separately.
- `web/src/pages/bkt-modules/bkt-modules-row.tsx`: render the Show UI switch when `hasUi`, and the Enabled switch only for agent rows.
- `web/src/pages/bkt-modules/bkt-modules-category-section.tsx`: the category-level Show UI bulk switch, next to the existing bulk Enabled switch. It is disabled while any row in the group is pending, the same rule as before.
- `web/src/pages/bkt-modules/bkt-modules-filter-bar.tsx`: add the filter "UI: all / shown / hidden".
- `web/src/pages/bkt-modules/bkt-modules-notices.tsx`: the refresh notice for visibility changes.
- `web/src/pages/bkt-modules/bkt-modules-i18n.ts`: vi labels.
- `web/src/pages/BktModulesPage.tsx` and `BktModulesPage.test.tsx`.

## Steps

1. Grouping changes and unit tests: orphans become rows, `hasUi` rules, and the console row label.
2. Store `setShowUi`, with tests for optimistic update, rollback on failure, and one reconciling refetch.
3. UI components and filter.
4. Page tests:
   - The 8 tabs are listed with only a Show UI switch.
   - Toggling calls `setPluginVisibility` with `hidden: true` or `false`.
   - The DIA module rows have both switches.
   - Agent-only rows with no UI have no Show UI switch.
   - The existing 20 BKT page tests still pass.
5. Run `pnpm --dir web typecheck`, `lint` and `test`.

## Verification

- Web typecheck, lint and tests are green.
- Do a manual check when a dashboard can run:
  1. Hide Files+, refresh, and confirm the tab is gone.
  2. Hide one DIA module and confirm its panel is gone from `/dia`.
  3. Hide DIA AI Console and confirm the nav entry is gone.

## Risks / rollback

- `bkt-brand` and `bkt-author` render into shell slots, so hiding them removes the logo and the credit line. Label their rows "Header logo" and "Credit line" so the effect is clear.
- Rollback: revert the listed files.
