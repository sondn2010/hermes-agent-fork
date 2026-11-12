---
phase: 02
title: BKT Modules dashboard page
wave: A
status: done
depends_on: []   # needs only the tag contract `category:<slug>` from plan.md
---

# Phase 02: BKT Modules dashboard page
<!-- Updated: Validation Session 1 - Confirmed strictly opt-in default state for all DIA plugins -->

## Context
- Read: `web/AGENTS.md`, root `AGENTS.md` (TypeScript rules), `hermes_cli/AGENTS.md`.
- Hub endpoint: `GET /api/dashboard/plugins/hub` → `hermes_cli/web_routers/dashboard_ui.py:133` → `hermes_cli/web_server_dashboard.py::_merged_plugins_hub` (rows are built at around line 800).
- Toggle endpoints: `POST /api/dashboard/agent-plugins/{name}/enable|disable` (`dashboard_ui.py:271-282`). The client is in `web/src/lib/api.ts` (lines 1056–1090). The row type is `HubAgentPluginRow` (line ~2626).
- Existing page for patterns (do not grow it): `web/src/pages/PluginsPage.tsx`. Routes and nav: `web/src/App.tsx` (lines ~168 and ~212). Strings: `web/src/i18n/*.ts` with types in `web/src/i18n/types.ts`.
- UI kit: `@nous-research/ui` (Switch, Input, Select, Badge, Card).

## Files owned
- `hermes_cli/web_server_dashboard.py` (add `tags` to hub rows only)
- `tests/hermes_cli/test_plugins_hub_tags.py`
- `web/src/lib/api.ts` (add `tags: string[]` to `HubAgentPluginRow` only)
- `web/src/App.tsx` (lazy route `/bkt-modules` and a nav entry next to Plugins)
- `web/src/pages/BktModulesPage.tsx` (thin route root)
- `web/src/pages/bkt-modules/` with `bkt-modules-store.ts` (nanostore or local hook; follow the web convention), `bkt-modules-grouping.ts` (pure grouping and filter functions), `bkt-modules-filter-bar.tsx`, `bkt-modules-category-section.tsx`, `bkt-modules-row.tsx`, `bkt-modules-grouping.test.ts` and `BktModulesPage.test.tsx`
- `web/src/i18n/types.ts` (declare optional `bktModulesPage?: { ... }` block), `web/src/i18n/en.ts` (full English strings), with bilingual/Vietnamese labels supported via component-level constants in `web/src/pages/bkt-modules/bkt-modules-i18n.ts` (avoids breaking strict TypeScript checks across the 17 non-Vietnamese locale files).

## Requirements
1. **Backend**: each hub row gets `tags: list[str]`, read from the plugin manifest (reuse the parser in `hermes_cli/plugins_manifest.py`; do not re-parse YAML by hand). The field is generic and has no bkt-specific logic in core. Use `[]` when the manifest has no tags. Keep the hub cache behaviour.
2. **Page** `/bkt-modules`:
   - Source: hub rows filtered by `name.startsWith("bkt-")`.
   - Category = the first `category:<slug>` tag (trimmed and normalized to lowercase; unrecognized tags or missing category fallback to `uncategorized`). Labels come from i18n for the 7 known slugs (`shared`, `knowledge-rag`, `assistant-channels`, `domain-lookup`, `analysis-forecast`, `decision-support`, `monitoring-personalization`); unknown slugs show the slug title-cased.
   - Layout: a filter bar (text search over name and description; a category multi-select; status: all/enabled/disabled), then one collapsible section per category with a count badge (`enabled/total`) and a category switch (with an indeterminate visual state when partially enabled), then rows with name, description, version, status badge and switch.
   - Switching calls the enable/disable APIs. It updates optimistically, rolls back with a toast on error, and uses request sequencing/debouncing for hub refetches so stale responses never overwrite optimistic state. The category switch acts on visible modules in that section, disabling interaction during in-flight updates, and reports partial failures in a consolidated toast.
   - A persistent banner explains that changes apply to new sessions and that `bkt-dia-common` must stay enabled for any DIA module to work. Show a warning badge when a DIA module is enabled while `bkt-dia-common` is disabled.
   - An empty state appears when there are no `bkt-*` plugins.
   - Filters are kept in the URL query (`?q=&cat=&status=`) so a view can be shared.
3. Accessibility: switches have labels, sections use `aria-expanded`, and everything works with the keyboard.

## Steps
1. Backend field + `test_plugins_hub_tags.py` (a temp `HERMES_HOME` with a fake plugin whose manifest has tags → the hub row has those tags).
2. Pure grouping/filter module + unit tests (grouping, filter combinations, unknown category, sorting by category order then name).
3. Components + page test (mock fetch at the API boundary: render, filter, toggle success and rollback).
4. Route, nav and i18n.

## Validation
- `scripts/run_tests.sh tests/hermes_cli/test_plugins_hub_tags.py`
- In `web/`: `npm run typecheck`, `npm run lint`, `npx vitest run src/pages/bkt-modules src/pages/BktModulesPage.test.tsx`
- Manual: `hermes dashboard`, open `/bkt-modules` with the phase 01 plugins present, toggle a module and confirm `config.yaml` `plugins.enabled`/`disabled` changes.

## Done means
- Global acceptance criterion 1 holds.

## Risks / rollback
- `web_server_dashboard.py` is 1,243 lines. Add a small helper so the change is a few lines. If complexity limits are hit, move the helper into a sibling.
- Rollback: revert the listed files. The API addition is backward compatible.
