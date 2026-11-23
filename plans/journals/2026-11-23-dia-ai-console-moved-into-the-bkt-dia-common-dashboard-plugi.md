---
title: DIA AI Console moved into the bkt-dia-common dashboard plugin
date: 2026-11-23
summary: /dia is now a bkt plugin bundle (bkt/packages/dia); core web/src console removed; full bkt build blocked by a pre-existing gitignore rule
---

# DIA AI Console moved into the bkt-dia-common dashboard plugin

## What happened
- Ported the core DIA AI Console (web/src/pages/DiaConsolePage.tsx, dia-console/*, lib/dia-console-api.ts) to `bkt/packages/dia`, built into `plugins/bkt_dia_common/dashboard/dist/` via a `DIST_OVERRIDES` entry in `bkt/scripts/build.mjs`. Manifest is now the visible tab "Trung tâm DIA AI" (`/dia`, position end, v0.2.0).
- Layout changed to Tổng quan (health, module grid, recent runs, monitoring) plus one sub-tab per category with modules; active sub-tab in `?tab=`. UI is Vietnamese-only (`dia-strings.ts`).
- Removed every DIA console file, route, nav entry and i18n key from web/src; BKT Modules keeps its own `diaConsoleRow` label.

## Findings
- The plugin SDK exposes no Spinner, Switch, router Link or lucide icons; the package uses a CSS spinner, the SDK Checkbox, a `RouteLink` (href + navigateTo) and glyphs.
- Editing `bkt/shared/sdk.ts` (even adding an unused export) reshuffles minified identifiers in every bundle that imports it, dirtying unrelated dist files. dia keeps its own route-href helper instead.
- Pre-existing: root `.gitignore` rule `export*` hides `bkt/packages/profiles/src/export-path.ts`, so `npm run typecheck`, the full `npm run build` and `check:dist` fail on a clean checkout. `plugins/bkt-chat` dist is already stale vs its source.
- Review fix: monitoring (1 + N cron requests) moved into the console store so it loads once per page, not on every return to Tổng quan.

## Verification
- bkt vitest 193/193; web tsc clean, vitest 638/638, eslint 0 errors; `tests/plugins/bkt_dia` + hub tags 342/342. Mutation checks: hidden-module filter and run-request profile scoping both turn tests red.

## Next steps
- Manual `hermes dashboard` check of /dia (sub-tabs, ?tab= reload, run, hide module, hide bkt-dia-common, profile switch).
- Fix the `export*` gitignore rule / commit export-path.ts, and rebuild bkt-chat, so the full bkt build and check:dist go green.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
