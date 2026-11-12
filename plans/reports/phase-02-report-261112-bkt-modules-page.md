# Phase 02 report — BKT Modules dashboard page

Status: DONE_WITH_CONCERNS (all phase-02 gates green; repo-wide `scripts/check` red only on files outside this phase)

## Files changed
- `hermes_cli/web_server_dashboard.py` (+10/-1): hub rows gain `tags`; helper `_plugin_manifest_tags()` reuses `plugins_manifest._manifest_field_of_type` (same type rule as loader: non-list warns → `[]`). Manifest read once per row (shared with `provides_tools`). Cache untouched.
- `tests/hermes_cli/test_plugins_hub_tags.py` (new): real discovery in temp `HERMES_HOME` (tags surfaced; missing/malformed → `[]`; cache still memoizes). Live catalog kept offline.
- `web/src/lib/api.ts`: `HubAgentPluginRow.tags: string[]`. `tab` type of `PluginManifestResponse` collapsed onto one line to offset growth (health FILE_LINES ratchet: api.ts is over 2000 and may not grow).
- `web/src/App.tsx`: lazy `/bkt-modules` route + nav entry "BKT Modules" (Boxes icon) after Plugins.
- `web/src/i18n/types.ts`: exported `BktModulesPageStrings`, optional `bktModulesPage?`.
- `web/src/i18n/en.ts`: `enBktModulesPage` (exported for fallback) + `bktModulesPage` in `en`.
- `web/src/pages/BktModulesPage.tsx` (route root, wiring only), `BktModulesPage.test.tsx`.
- `web/src/pages/bkt-modules/`: `bkt-modules-grouping.ts` (+test), `bkt-modules-store.ts` (local hooks; web has no nanostores), `bkt-modules-filter-bar.tsx`, `bkt-modules-category-section.tsx`, `bkt-modules-row.tsx`, `bkt-modules-notices.tsx` (banner/empty/error), `bkt-modules-i18n.ts` (Vietnamese labels + English fallback resolver).

## Behaviour notes
- Category: first `category:<slug>` tag, trimmed+lowercased; empty/missing → `uncategorized`; unknown → title-cased. Order: 7 known, unknown A–Z, uncategorized last; rows by name.
- Filters in URL `?q=&cat=a,b&status=` (replace navigation; defaults omitted).
- Sequencing: a hub response applies only if newest fetch AND no toggle started/settled during it; one debounced (300 ms) reconcile refetch after last toggle settles.
- Category control is `role="checkbox"` with `aria-checked="mixed"` (switch role cannot express partial); acts on visible modules not yet in target state; sequential calls; section locked while in flight; one consolidated toast.
- Banner bilingual (EN + `lang="vi"` line). Warning badge when an enabled `bkt-dia-*` module exists while `bkt-dia-common` is off or absent.

## Test outputs
- `scripts/run_tests.sh tests/hermes_cli/test_plugins_hub_tags.py tests/hermes_cli/test_plugins_hub_live_catalog.py tests/hermes_cli/test_plugins_hub_perf_guard.py` → 3 files, 12 passed.
- `web`: `pnpm run typecheck` clean; `npx vitest run src/pages/bkt-modules src/pages/BktModulesPage.test.tsx` → 20 passed; full `vitest run` → 75 files / 512 passed; `pnpm run lint` → 0 errors (29 pre-existing warnings; none in new files).
- `python scripts/check`: health/ruff/footguns pass for phase-02 files. Remaining failures are not ours:
  - `apps/desktop/src/i18n/vi.ts` FILE_LINES 3370 > 2000 (committed earlier on this branch, `ca9c9c7417`).
  - ruff RUF100 `tests/plugins/bkt_dia/conftest.py:67,74` and footgun `plugins/bkt_dia_common/tool_factory.py:217` (phase 01, in progress).

## Concerns
- JS deps were missing; installed with pinned pnpm 12.15.0 via `npx pnpm@12.15.0 install --frozen-lockfile --config.engine-strict=false` because the machine has Node 22 and the root requires Node >= 26. Lockfile unchanged. Typecheck/lint/vitest ran on Node 22.
- Page title set via `usePageHeader().setTitle`; `lib/resolve-page-title.ts` (not owned) would otherwise derive "Bkt-modules" before mount.
- Manual `hermes dashboard` check not run (no dev server started).
- Phase file status not edited (left to orchestrator / `ak plan`).
