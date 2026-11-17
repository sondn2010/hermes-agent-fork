# Phase 03 report: DIA Console page

Status: completed. No commit.

## Files (all new except the replaced placeholder)

| File | Lines | Role |
|---|---|---|
| `web/src/pages/DiaConsolePage.tsx` | 165 | route root: headline, load/error/empty states, Segmented tabs (Status, categories, Recent runs, Monitoring) via a view table |
| `web/src/pages/DiaConsolePage.test.tsx` | 345 | 9 page tests |
| `dia-console/dia-console-grouping.ts` | 76 | hidden filter, category grouping (catalog order, unknown slugs appended), latest run per module, `bkt-dia-` monitor filter |
| `dia-console/dia-console-form-values.ts` | 83 | schema type → field kind table, initial values, required check, typed argument conversion |
| `dia-console/dia-console-grouping.test.ts` | 104 | 7 unit tests (grouping + form values) |
| `dia-console/dia-console-newest-fetch.ts` | 60 | `useNewestFetch`: newest-fetch-wins + unmount guard, `updatedAt`, manual `reload` |
| `dia-console/dia-console-store.ts` | 101 | `useDiaConsole`: catalog (modules + hub in parallel), health, runs, per-tool `run` results |
| `dia-console/dia-console-health-card.tsx` | 95 | status/documents/latency or stage message + error + hint; endpoint flag only |
| `dia-console/dia-console-module-grid.tsx` | 71 | status grid: category, enabled badge, last-run outcome |
| `dia-console/dia-console-module-panel.tsx` | 67 | header; disabled -> hint + `/bkt-modules` link, no form |
| `dia-console/dia-console-tool-form.tsx` | 106 | schema form, required marks, blocks submit, Run disabled while pending |
| `dia-console/dia-console-field-inputs.tsx` | 103 | `DiaFieldInput`: kind -> component table (text, textarea, number, switch, select) |
| `dia-console/dia-console-run-result.tsx` | 124 | 4-step timeline with icons/ms, live elapsed timer on the query step while pending, answer (Markdown), type, failure stage + hint |
| `dia-console/dia-console-run-sources.tsx` | 74 | sources: title/name/code + score, other keys compact; collapse after 5 |
| `dia-console/dia-console-recent-runs.tsx` | 76 | run log table + refresh bar |
| `dia-console/dia-console-monitoring.tsx` | 131 | `bkt-dia-*` cron jobs, schedule, active/paused, last status/time, output link, empty-state hint |
| `dia-console/dia-console-refresh-bar.tsx` | 30 | manual Refresh + "Last updated" timestamp |
| `dia-console/dia-console-i18n.ts` | 43 | Vietnamese labels, `useDiaConsoleStrings` (`t.diaConsolePage ?? enDiaConsolePage`), category label, epoch formatter |

No shared file edited (App.tsx, i18n, api.ts, dia-console-api.ts, bkt-modules untouched by this phase). No new English i18n keys were needed.

## Tests

- Page: categories as tabs; hidden module and its now-empty category absent; disabled module has link, no form; required field blocks submit; run shows 4 steps, markdown answer, question, sources collapsed to 5 then expanded; pending run shows `N.Ns elapsed` and disabled Run; `ok:false` shows stage message + hint + error step; health error card (no URL, "Endpoint not configured"); all-hidden empty state with `/bkt-modules` link; monitoring filters to `bkt-dia-*`, links `/chat?resume=<run id>`, Refresh -> empty hint `hermes cron create` + "Last updated".
- Unit: grouping order/unknown slugs, hidden filter, latest run, monitor filter, field kinds, required check, argument conversion.

## Gates

- `pnpm --dir web typecheck`: pass.
- `pnpm --dir web lint`: 0 errors, 29 warnings, all pre-existing; none in phase-03 files.
- `pnpm --dir web test`: 80 files / 556 tests pass (full suite, includes the concurrent phase-04 tests at run time).
- Ran via `node .../pnpm/10.33.2/bin/pnpm.cjs` (corepack pnpm broken). No processes left running.

## Deviations / decisions

- Tabs use `Segmented` (`@nous-research/ui`), the same view switcher CronPage uses; tab state is local, falling back to Status if a category disappears.
- Catalog load requires both `/modules` and the hub; if the hub fails the page shows the load error + Retry instead of risking rendering hidden modules.
- "Link to that run's output": the web Cron page has no per-run deep link, so session runs link to `/chat?resume=<id>` (same route SessionsPage uses) and script-only runs (`source: "cron_output"`) link to `/cron`; the run preview (160 chars) is shown inline.
- Monitoring calls `getCronJobs(getManagementProfile())` and `getCronJobRuns(job.id, job.profile ?? profile)`; a history failure only drops the link/preview for that job.
- Recent runs are not auto-refreshed after a console run (per validation decision: manual refresh only); the Status grid's last-run outcome follows the same run log.
- Textarea chosen when the property description matches a "long / multi-line / free-form / detailed" (en/vi) hint.
- Manual `hermes dashboard` check not done: the backend plugin API is being built concurrently.

## Unresolved questions

- Should a console run refresh Recent runs automatically? Current behaviour follows the session-2 decision (manual only).
- Confirm `last_status` success value is `"ok"` for all cron paths (badge tone uses it; cron/jobs.py suggests so).
