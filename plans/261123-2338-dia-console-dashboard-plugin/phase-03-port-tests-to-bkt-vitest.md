---
phase: 03
title: Port tests to bkt vitest
status: completed
depends_on: [02]
---

# Phase 03: Port tests to bkt vitest

## Context
The core tests to carry over are:
- `web/src/pages/DiaConsolePage.test.tsx` (345 lines)
- `web/src/lib/dia-console-api.test.ts` (141)
- `web/src/pages/dia-console/dia-console-grouping.test.ts` (104)
- `web/src/pages/DiaConsoleNav.test.ts` (21)

`bkt/vitest.config.ts` runs in jsdom and picks up `packages/*/src/**/*.test.ts(x)`. The existing bkt tests stub `window.__HERMES_PLUGIN_SDK__`; reuse whatever helper they use.

## Files (owned): `bkt/packages/dia/src/*.test.ts(x)`

## Steps
1. `dia-api.test.ts`: request URLs and the profile scoping (the active profile reaches the plugin routes and the cron routes), and mapping of error responses.
2. `dia-grouping.test.ts`: port as is. Add a case that `shared` and empty categories produce no tab.
3. `dia-tabs.test.ts`: `?tab=` round-trip, the default tab, and fallback for an unknown slug.
4. `DiaConsole.test.tsx`: port the page behaviour cases.
   - health ok and the error states;
   - a disabled module shows the link to BKT Modules;
   - a hidden module does not render;
   - submit is blocked while a required field is empty;
   - a run shows the timeline and answer;
   - recent runs and monitoring.
   Assert on Vietnamese text and roles.
5. Drop `DiaConsoleNav.test.ts`. The host now handles nav visibility through the manifest and `hidden_plugins`, and the core already tests that.

## Validation
- `cd bkt && npm test` is green.
- Each ported behaviour test fails when its feature is removed. Spot-check at least one (for example, stop filtering hidden modules) and confirm the test goes red.

## Constraint
- These are behaviour contracts. No snapshot or source-reading tests (`AGENTS.md`).
