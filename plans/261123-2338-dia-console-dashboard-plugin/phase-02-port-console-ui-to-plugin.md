---
phase: 02
title: Port console UI to bkt/packages/dia
status: completed
depends_on: [01]
---

# Phase 02: Port console UI to `bkt/packages/dia`

## Context
The source to port is `web/src/pages/DiaConsolePage.tsx`, `web/src/pages/dia-console/*` and `web/src/lib/dia-console-api.ts`, about 1,750 lines without tests. Behaviour must stay the same. Only the layout (sub-tabs) and the language (Vietnamese) change.

Follow the package patterns in `bkt/packages/health` and `bkt/packages/files`:
- `@bkt/shared/sdk` provides `ui()`, `registerPlugin` and `navigateTo`.
- `@bkt/shared/api` provides `bktFetch`, `profileFetch` and `bundleProfile`.
- `@bkt/shared/components/MarkdownView` renders markdown.

## Files (owned): `bkt/packages/dia/src/**`
Suggested modules, with kebab-case names to match the source. Each file stays under 200 lines.

- `dia-api.ts`: types and fetchers.
  - Plugin routes: `/api/plugins/bkt-dia-common/{modules,health,run,runs}`.
  - Cron routes: `/api/cron/jobs?profile=` and `/api/cron/jobs/:id/runs`.
  - Hub route for per-module `user_hidden`: `/api/dashboard/plugins/hub`.
  - Every call is scoped to `bundleProfile()` the way the other bkt packages do it. Check how `fetchJSON` scopes `/api/plugins/*` today and reproduce exactly that.
- `dia-strings.ts`: one Vietnamese string table, replacing `diaConsolePage` from `web/src/i18n/en.ts`. Category labels come from `label_vi` in the backend.
- `dia-grouping.ts`, `dia-form-values.ts`, `dia-newest-fetch.ts`, `dia-store.ts`: ported as they are, with the core imports swapped out.
- Components:
  - `health-card.tsx`
  - `module-grid.tsx`
  - `module-panel.tsx`
  - `tool-form.tsx`
  - `field-inputs.tsx`
  - `run-result.tsx`
  - `run-sources.tsx`
  - `recent-runs.tsx`
  - `monitoring.tsx`
  - `refresh-bar.tsx`
- `dia-tabs.ts`: maps sub-tab slugs to and from `?tab=`. It reads `location.search` and writes with `history.replaceState`, so the host route is kept. The `tong-quan` default and unknown-slug fallback live here. Categories with zero modules, including `shared`, get no tab.
- `DiaConsole.tsx` and `index.tsx`: the page root, which calls `registerPlugin("bkt-dia-common", DiaConsole)`.
- `styles.css`: the spinner and timeline styles that used to come from core components.

## Substitutions for things the SDK does not expose
| Core import | Plugin replacement |
|---|---|
| `Segmented` | SDK `Tabs`, `TabsList`, `TabsTrigger` |
| `Spinner` | A small CSS spinner in `styles.css` |
| `Switch` (boolean fields) | SDK `Checkbox` |
| `lucide-react` icons | Inline SVG or the existing `StatusDot`. Do not add a dependency. |
| `react-router` `Link` | A button or anchor calling `navigateTo("/bkt-modules")` or the session route |
| `usePageHeader` | An in-page `<h1>` header |
| core `Markdown` | `MarkdownView` |
| `useI18n` | `dia-strings.ts` |
| `api.getCronJobs` / `api.getPluginsHub` | Direct fetches in `dia-api.ts` |

## Steps
1. Port the pure modules first (api, grouping, form-values, newest-fetch, store, tabs).
2. Port the components one at a time, swapping imports as in the table above.
3. Assemble `DiaConsole`: a header, then Tabs. Tổng quan holds health, grid, recent runs and monitoring. Each category tab holds the module panels for that category.
4. Run `cd bkt && npm run typecheck && node scripts/build.mjs --only dia`, and keep the bundle under 450 KiB.

## Validation
- Typecheck is clean, and the dist builds within the size budget.
- In a manual run of `hermes dashboard`, `/dia` renders and a run against the stub or a real endpoint shows the timeline and answer.

## Risk
- The profile scoping of plugin API calls has to match core `fetchJSON`. Otherwise runs and run logs land in the wrong profile. Phase 03 covers this with a test.
- The Vietnamese text has no external source. Draft it from the existing en strings and vi category labels.
