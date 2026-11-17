# Phase 04 report: BKT Modules Show UI toggles

Status: completed. No commit.

## Files

| File | Change |
|---|---|
| `web/src/pages/bkt-modules/bkt-modules-grouping.ts` | `BktModule` gains `kind` (`agent`/`dashboard`), `hasUi`, `uiHidden`, `uiLabel`. `DASHBOARD_TABS_CATEGORY` ranks last. `UI_FILTERS` and `filters.ui` round-trip through `?ui=`. Group gains `agentCount` and `uiState`. `state` and `uiState` are null when the group has no rows of that kind. `switchState(on, total)` is now count-based. `BKT_DIA_COMMON` is set to `DIA_COMMON_PLUGIN`. `toBktModules` moved out. |
| `bkt-modules-hub-rows.ts` (new) | Turns a hub response into rows. Agent `bkt-*` rows have `hasUi` = `has_dashboard_manifest` or a `bkt-dia-*` name, which covers both the DIA modules and `bkt-dia-common`. Orphan `bkt-*` manifests become `dashboard` rows. `user_hidden` counts only when it is exactly `true`; a missing value means shown. `HubOrphanDashboardRow` is defined locally, so `api.ts` is untouched. |
| `bkt-modules-requests.ts` (new) | `requestPluginEnabled`, `requestPluginUiShown` (which calls `api.setPluginVisibility(name, !show)`), `errorMessage`, `withSetMember`. |
| `bkt-modules-store.ts` | Both switches share one toggle machinery through `FIELD_APPLY`/`FIELD_REQUEST` tables. Adds `setShowUi(name, show)` and `toggleCategoryUi`. `pending` and `uiPending` are separate sets. Adds `visibilityChanged`. Updates are optimistic, roll back on failure, and reconcile with one debounced refetch, as before. |
| `bkt-modules-row.tsx` | Agent rows get the Enabled switch. Rows with `hasUi` get the Show UI switch. Each switch has a visible caption. Dashboard rows get a "Dashboard tab" badge, and hidden UIs get a "Hidden" badge. Every row shows a label before its name: "DIA AI Console", "Header logo" or "Credit line" for those three rows, otherwise the manifest label (for example "Files+"). |
| `bkt-modules-category-section.tsx` | Adds a bulk Show UI switch next to the bulk Enabled switch. Each switch renders only when the group has rows of its kind. Both lock while any row has either request in flight. The count badge counts agent rows only. |
| `bkt-modules-filter-bar.tsx` | Adds the filter "UI: All / Shown / Hidden". |
| `bkt-modules-notices.tsx` | Adds `BktModulesVisibilityNotice` (`role="status"`), a one-line notice with a "Reload Dashboard" button. |
| `bkt-modules-i18n.ts` | Adds `BKT_UI_VI` (Vietnamese labels), the `rowLabel()` lookup table, and the Dashboard tabs category label. |
| `web/src/pages/BktModulesPage.tsx` | Wires the new props. Shows the notice after a saved change; the button calls `window.location.reload()`. |

`web/src/lib/api.ts`: `git diff --stat` is empty. No files outside my ownership were touched.

## Tests added

- `bkt-modules-grouping.test.ts`: the `mod()` helper and the filter literals now include the new fields. The `toBktModules` tests moved to the hub-rows file. New tests:
  - Dashboard tabs group order and its UI-only bulk state.
  - Enabled state from agent rows vs UI state from rows with a UI.
  - The UI filter, and dashboard rows kept out of the status filters.
  - `?ui=` round-trip.
- `bkt-modules-hub-rows.test.ts` (new): the 2 moved tests, plus:
  - The `hasUi` rules.
  - Orphans become dashboard rows; non-`bkt-*` orphans are dropped.
  - A missing `user_hidden` reads as shown.
  - A missing orphan list is tolerated.
- `BktModulesPage.test.tsx`: 7 new page tests:
  - The 8 tabs show only a Show UI switch, plus the Header logo and Credit line labels.
  - DIA rows have both switches; agent-only rows have no Show UI switch.
  - Toggling calls `setPluginVisibility(name, true/false)`, and the Reload button calls `location.reload`.
  - Optimistic update with separate pending sets and exactly one reconciling refetch.
  - Rollback, toast and no notice on failure.
  - The bulk Show UI switch writes only the rows that need it.
  - `?ui=hidden` filtering.

## Gates

- typecheck: pass.
- lint: 0 errors and 29 warnings. All warnings are pre-existing and none are in the touched files.
- test (full suite): 79 files and 547 tests pass. The 36 BKT tests include the original 20, all passing.
- `git diff --stat web/src/lib/api.ts`: empty.

## Deviations

- The page-test helper `moduleNames()` now selects only the `Enable …` switches. DIA rows now carry a second switch, and the helper's intent (listing the Enabled switches) is unchanged.
- The hub-to-rows mapping is a new sibling, `bkt-modules-hub-rows.ts`, and the request helpers are in `bkt-modules-requests.ts`. This keeps grouping and the store small. The 2 `toBktModules` tests moved with it.
- The status filter (enabled/disabled) excludes dashboard rows, because they have no Enabled state. The UI filter excludes rows without a UI.
- The bulk Show UI toggle shows no success toast; the reload notice is the feedback. Partial failures reuse `categoryPartialFailure`.
- No new English strings were needed. The Vietnamese strings are in `bkt-modules-i18n.ts` (`BKT_UI_VI`).

## Unresolved questions

- The manual dashboard check (hide Files+, hide a DIA panel, hide DIA AI Console) was not run because no dashboard was available.
- Docs impact: the UI behaviour visible to users changed. The orchestrator should decide whether user docs mention `/bkt-modules` Show UI.
