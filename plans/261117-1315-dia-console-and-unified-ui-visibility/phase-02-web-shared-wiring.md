---
phase: 2
title: "Web shared wiring: client, route, nav, i18n"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 02: Web shared wiring

## Goal

Own every shared web file this feature touches, so phases 03 and 04 can run in parallel without editing the same files.

## Context

- `web/src/lib/api.ts` is 2670 lines, already over the 2000-line cap. **Do not add to it.** The new client goes in its own file and uses `fetchJSON` (and the authed POST helper `api.ts` already uses), exported from `api.ts` or `web/src/lib/`.
- `App.tsx` registers routes in a map (`"/bkt-modules": BktModulesPage`, line ~171) and nav items in a list (line ~216).
- Plugin manifests come from `usePlugins` (`web/src/plugins/usePlugins.ts`). `GET /api/dashboard/plugins` omits hidden or disabled plugins.

## Files

Create:
- `web/src/lib/dia-console-api.ts`: types and calls that match the frozen contract in `plan.md`: `getDiaModules`, `getDiaHealth`, `runDiaTool(module, tool, args)`, `getDiaRuns(limit)`, plus `getCronJobRuns(id)` (`GET /api/cron/jobs/{id}/runs?profile=<getManagementProfile()>`), because `api.ts` has no runs call and must not grow. Do not add `?profile=` to the four `/api/plugins/` calls: `fetchJSON` already appends it to the `/api/plugins/` and `/api/dashboard/plugins` prefixes (`web/src/lib/api-request-scope.ts`). Cron calls pass the profile explicitly, as `api.getCronJobs` does.
- `web/src/lib/dia-console-api.test.ts`: URL, method and body shape for each call, using mocked fetch.

Modify:
- `web/src/App.tsx`:
  - Lazy `DiaConsolePage` and the route `"/dia"`.
  - Nav item `{ path: "/dia", label: "DIA AI Console", icon: Bot }` (or the closest existing lucide icon), placed after BKT Modules.
  - The nav item is shown only when the `bkt-dia-common` manifest is in the `usePlugins` result. The route still renders on a direct URL visit.
- `web/src/i18n/types.ts` and `web/src/i18n/en.ts`:
  - Optional `diaConsolePage?` block: title, status labels, step labels, stage messages, empty states, buttons.
  - New keys in the existing optional `bktModulesPage?` block: "Show UI" and "Dashboard tab" labels, and the DIA Console row label.
  - The Vietnamese strings stay in the page folders, matching `bkt-modules-i18n.ts`.
- Create the placeholder `web/src/pages/DiaConsolePage.tsx` (a heading only) so the route compiles. Phase 03 replaces its body.

## Steps

1. Write `dia-console-api.ts` and its test.
2. Add the route, the nav item and the hide rule, with a test in the existing App/nav test style. If no such test exists, add `web/src/pages/DiaConsoleNav.test.tsx` covering "manifest present → nav shown; absent → hidden".
3. Add the i18n keys.
4. Run `pnpm --dir web typecheck`, `pnpm --dir web lint` and `pnpm --dir web test -- dia-console`.

## Verification

- Typecheck, lint and the new tests are green.
- `git diff --stat web/src/lib/api.ts` is empty.

## Risks / rollback

- **Nav flicker** while plugins load. Hide the item until the plugins have loaded. Do not show it optimistically.
- **Rollback:** revert the four modified files and delete the new ones.
