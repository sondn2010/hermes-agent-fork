---
phase: 04
title: Remove the core console from web/src
status: completed
depends_on: []
---

# Phase 04: Remove the core console from `web/src`

## Context
Commit `a843d0607a` added the console together with the BKT Modules Show UI work. Revert only the console part. Every BKT Modules change stays.

## Files (owned): `web/src/**`
Delete:
- `web/src/pages/DiaConsolePage.tsx`
- `web/src/pages/DiaConsolePage.test.tsx`
- `web/src/pages/DiaConsoleNav.test.ts`
- `web/src/pages/dia-console/` (the whole directory)
- `web/src/lib/dia-console-api.ts`
- `web/src/lib/dia-console-api.test.ts`

Edit:
- `web/src/App.tsx`. Remove:
  - the lazy `DiaConsolePage` import (around line 98);
  - the `isDiaConsoleNavVisible` import (around line 110);
  - the `"/dia": DiaConsolePage` route (around line 175);
  - the `{ path: "/dia", … }` nav item (around line 221);
  - the `showDia` filter (around line 476).
  If `Bot` or any other import becomes unused, drop it too.
- `web/src/i18n/types.ts` and `en.ts`: remove `DiaConsolePageStrings` and `diaConsolePage`.
- `pt.ts` and the other locales (`ru`, `tr`, `uk`, `zh`, `zh-hant`, …): remove only the DIA-console keys. Run `git diff origin/main -- web/src/i18n` to tell DIA-console keys apart from BKT Modules keys.
- `web/src/pages/bkt-modules/*`: change these only if they import from `dia-console-*`. Expected: no change.

## Steps
1. Grep `web/src` for `dia-console`, `DiaConsole`, `diaConsolePage` and `"/dia"`, then remove each hit.
2. `cd web && npm run typecheck && npm run lint && npx vitest run`. The pnpm note from the 11-17 journal applies: use the cached pnpm 10.33.2 if corepack's pnpm is broken.
3. `git diff origin/main --stat -- web/src`. Only BKT Modules files and their i18n keys should remain.

## Validation
- The grep from step 1 returns nothing.
- Web gates are green.

## Risk / rollback
- Visiting `/dia` before phases 01–02 land would show nothing, because the core route is gone and the plugin is still a stub. Land phase 04 in the same commit series as 01–03.
- Rollback: `git checkout` the deleted files from `HEAD~`.
