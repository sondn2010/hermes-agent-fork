---
title: "Move the DIA AI Console from a core web page to an additive dashboard plugin"
description: "Rebuild /dia as the bkt-dia-common dashboard plugin bundle from bkt/packages/dia (Vietnamese-only UI, overview + 6 category sub-tabs), then remove every DIA console edit from web/src."
status: in-progress
priority: P2
effort: 2d
branch: feature/bktech
tags: [frontend, plugins, dashboard, diaai, refactor]
blockedBy: []
blocks: []
created: 2026-11-23
---

# DIA AI Console → dashboard plugin

The source contract is the grilling session of 2026-11-23, which the user confirmed.
This plan reverses decision 2 of [`../reports/brainstorm-261117-1240-dia-console-and-unified-ui-visibility.md`](../reports/brainstorm-261117-1240-dia-console-and-unified-ui-visibility.md), which chose a core page over a plugin. The user made that reversal explicitly on 2026-11-23. The other decisions and non-goals from that brainstorm still hold.

## Outcome

`/dia` is served by the `bkt-dia-common` dashboard plugin:
- The bundle is built from `bkt/packages/dia` into `plugins/bkt_dia_common/dashboard/dist/`.
- The sidebar tab is labelled **Trung tâm DIA AI** and sits at position `end`.
- Inside the tab is a Tabs bar. **Tổng quan** comes first: health card, module grid, recent runs and monitoring. Then there is one sub-tab per category that has modules (6 of them; `shared` is dropped).
- The active sub-tab is kept in the URL as `?tab=<slug>`. `tong-quan` is the default.
- Features match the current console 1:1. The UI is in Vietnamese only.

`web/src` no longer contains any DIA console code. The BKT Modules page stays a core page and is out of scope.

## Decisions (user, 2026-11-23)

| # | Decision |
|---|---|
| 1 | Move the console to a plugin, then delete the core page and all of its core wiring. |
| 2 | Driver: no upstream-merge conflicts. Make zero DIA edits in `web/src`. `plugin_api.py` stays unchanged. |
| 3 | One sidebar tab with sub-tabs: Tổng quan + 6 categories. |
| 4 | Feature parity 1:1. Data comes only from query and health plus Hermes-side state. |
| 5 | Vietnamese strings only, hard-coded. |
| 6 | `/bkt-modules` stays core. Its `bkt-dia-common` Show UI row hides the plugin tab through the existing `dashboard.hidden_plugins`. |
| 7 | Tests run on bkt vitest. Gates and docs are listed in phase 05. |

## Phases

| # | Phase | Depends on | Status |
|---|---|---|---|
| 01 | [Build wiring and manifest](phase-01-build-wiring-and-manifest.md) | — | completed |
| 02 | [Port console UI to bkt/packages/dia](phase-02-port-console-ui-to-plugin.md) | 01 | completed |
| 03 | [Port tests to bkt vitest](phase-03-port-tests-to-bkt-vitest.md) | 02 | completed |
| 04 | [Remove the core console from web/src](phase-04-remove-core-console.md) | — (can run in parallel with 02/03; it touches web/ only) | completed |
| 05 | [Docs and verification](phase-05-docs-and-verification.md) | 01–04 | in-progress (manual dashboard check open) |

File ownership: phases 01–03 own `bkt/**` plus `plugins/bkt_dia_common/dashboard/{manifest.json,dist/**}`, and phase 04 owns `web/src/**`. They don't overlap.

## Acceptance criteria

1. `/dia` shows the **Trung tâm DIA AI** tab. It contains Tổng quan plus 6 category sub-tabs, and every module (all 20 `bkt-dia-*` modules) appears under its category.
   - Reloading with `?tab=<slug>` reopens that sub-tab. An unknown slug falls back to Tổng quan.
2. Parity with the current console:
   - The health card covers ok and the five error states with their hints.
   - Module grid.
   - Tool forms are generated from the spec, and submit is blocked while a required field is empty.
   - Step timeline, markdown answer and sources.
   - A disabled module shows a link to `/bkt-modules`, and the server refuses its run.
   - Modules whose UI is hidden do not render.
   - Recent runs show a link to the session.
   - Monitoring lists cron jobs and their last runs.
3. Turning off Show UI for `bkt-dia-common` on `/bkt-modules` and reloading hides the tab.
4. `git diff origin/main -- web/src` contains no DIA console file, route, nav entry, API helper or i18n key. Only the BKT Modules page diff remains.
5. Gates:
   - `cd bkt && npm run typecheck && npm test && npm run check:dist` are green.
   - Web `npm run typecheck`, lint and vitest are green.
   - `scripts/run_tests.sh tests/plugins/bkt_dia` is green.
   - Boundary lint is no worse than it is today.
6. Docs are updated: user guide, admin setup, website bkt-modules page, `bkt/UPSTREAM-SEAMS.md` and `bkt/README.md`.

## Non-goals

- Rebuilding `/bkt-modules` as a plugin.
- New DIA endpoints, charts or structured data views.
- English or other locales.
- Changes to `plugin_api.py` routes.

## Known constraints found while scouting

- `bkt/scripts/build.mjs` maps package `<name>` to `plugins/bkt-<name>/`. The DIA output needs an explicit target, `plugins/bkt_dia_common`, which uses an underscore (phase 01).
- The plugin SDK (`web/src/plugins/registry.ts:189`) does not expose `Segmented`, `Spinner`, `Switch`, `lucide-react`, the `react-router` `Link`, `usePageHeader` or the core `Markdown`. Phase 02 substitutes each one with something available in `bkt/`.
- `check:additive` against `main-bktech` already reports about 13k changes from upstream merges, so it cannot serve as a gate. Acceptance criterion 4 uses a scoped diff against `origin/main` instead.

## Unresolved questions

- None blocking. The exact Vietnamese wording is drafted in phase 02, and the user can review it in the manual check.
