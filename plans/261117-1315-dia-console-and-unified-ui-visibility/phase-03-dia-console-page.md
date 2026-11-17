---
phase: 3
title: "DIA Console page"
status: done
priority: P1
effort: "1d"
dependencies: [2]
---

# Phase 03: DIA Console page

## Goal

Build `/dia`: status overview, category views with a schema-driven form per tool, run results with a step timeline, recent runs, and monitoring jobs.

## Context

- Data:
  - `lib/dia-console-api.ts` (phase 02).
  - `api.getPluginsHub()`: `user_hidden` per module name.
  - `api.getCronJobs(getManagementProfile())` from `api.ts`, and `getCronJobRuns(id)` from `lib/dia-console-api.ts` (phase 02).
- Follow the local patterns in `web/src/pages/bkt-modules/`: a local store hook, small components, `@nous-research/ui`, and a `*-i18n.ts` file for vi/en labels.
- Render the answer with the existing `web/src/components/Markdown.tsx`.

## Files

Create, all under `web/src/pages/`:
- `DiaConsolePage.tsx`: replaces the phase-02 placeholder. It is a thin route root with tabs: Status, one tab per category that has visible modules, Recent runs, Monitoring.
  - When no category has visible modules (`visibleModules.length === 0`), render an informative empty state explaining that all DIA modules are currently hidden or none are enabled, with a direct link to `/bkt-modules`.
- `dia-console/dia-console-store.ts`:
  - Loads modules, hub visibility and health in parallel.
  - Exposes `visibleModules`, `refreshHealth`, `run(module, tool, args)` (keeps per-tool results) and `runs`.
  - Uses the same newest-fetch-wins guard as `bkt-modules-store.ts`.
- `dia-console/dia-console-health-card.tsx`: status, document count, latency, or the error and hint. The "endpoint configured" flag never shows the URL.
- `dia-console/dia-console-module-grid.tsx`: status-tab grid of category, enabled/disabled badge and last-run outcome from `runs`.
- `dia-console/dia-console-module-panel.tsx`:
  - The module header (emoji, function code, title, description).
  - Disabled: a badge plus a link to `/bkt-modules`, with no form.
  - Enabled: one `ToolForm` per tool.
- `dia-console/dia-console-tool-form.tsx`:
  - Inputs come from the JSON schema: string → text (textarea when the description says it is long), integer and number → number input, boolean → switch, `enum` → select.
  - Required fields are marked and block submit.
  - Run is disabled while pending.
<!-- Updated: Validation Session 2 - manual refresh with last-updated timestamp and active elapsed timer during pending runs -->
- `dia-console/dia-console-run-result.tsx`:
  - A step timeline: `validate → build_question → query → result`, each with an ok/error/skipped icon and ms. While query is pending, displays an active elapsed timer in the step spinner (inheriting the backend ~30s timeout).
  - The rendered question, the answer as markdown, the type, and a sources list (render known keys such as `name`/`title`/`code`/`score`, otherwise compact key/value).
  - The error and hint, with a stage-specific message from i18n.
- `dia-console/dia-console-recent-runs.tsx`: a table of time, module, tool, source, outcome/stage and duration. Manual refresh button with last-updated timestamp.
- `dia-console/dia-console-monitoring.tsx`:
  - Cron jobs whose `skills` include a name starting `bkt-dia-`.
  - Shows name, schedule, enabled/paused, last run status and time, and a link to that run's output in the existing Cron page or route. Refresh button with last-updated timestamp.
  - Empty state explains how to create a monitor (`hermes cron create` with the risk-monitor skill).
- `dia-console/dia-console-grouping.ts`: pure helpers (group by category in `categories` order, filter hidden, monitoring-job filter) with a unit test.
- `dia-console/dia-console-i18n.ts`: Vietnamese labels.
- Tests:
  - `DiaConsolePage.test.tsx`:
    - The page renders the categories.
    - A hidden module is absent.
    - A disabled module shows the link and no form.
    - A required field blocks submit.
    - A run shows the steps and the answer.
    - An `ok:false` run shows the hint.
    - The health error state renders.
  - `dia-console/dia-console-grouping.test.ts`.

## Steps

1. Grouping helpers and their test.
2. Store hook.
3. Components, from leaf to page.
4. Page tests with mocked `dia-console-api` and hub/cron calls.
5. Run `pnpm --dir web typecheck`, `lint` and `test`.

## Verification

- Web typecheck, lint and all tests are green, including the existing 512.
- Each new file stays under ~200 lines where practical. No component holds a condition ladder for field types; use a table that maps type → input.
- Do a manual check when a dashboard can run:
  1. `hermes dashboard` against a stub or real endpoint.
  2. Open `/dia`, run one module, and confirm the run appears in Recent runs.
  3. Stop any server you started.

## Risks / rollback

- Large source payloads: cap the rendered sources at the count the server returns (already capped by `max_sources`), and collapse them after 5.
- Rollback: delete `dia-console/` and restore the placeholder page.
