# Phase 02 report: web shared wiring (client, route, nav, i18n)

Status: completed. No commit.

## Files

| File | Change |
|---|---|
| `web/src/lib/dia-console-api.ts` | new, ~215 lines: types + calls for the frozen plugin contract, `getCronJobRuns`, nav predicate |
| `web/src/lib/dia-console-api.test.ts` | new: 9 tests (URL, method, body, profile scoping, 404 rejection) |
| `web/src/pages/DiaConsoleNav.test.ts` | new: 3 tests (manifest present -> shown; absent -> hidden; loading -> hidden) |
| `web/src/pages/DiaConsolePage.tsx` | new placeholder: heading only (`strings.title`), phase 03 replaces body |
| `web/src/App.tsx` | +11/-4: `Bot` icon import, lazy `DiaConsolePage`, route `"/dia"`, nav item after BKT Modules, nav filter |
| `web/src/i18n/types.ts` | `DiaConsolePageStrings` interface, optional `diaConsolePage?`, 17 new `BktModulesPageStrings` keys |
| `web/src/i18n/en.ts` | `enDiaConsolePage` (exported for fallback) + new bkt keys |

`web/src/lib/api.ts`: untouched (`git diff --stat` empty).

## Client exports (`@/lib/dia-console-api`)

```ts
const DIA_COMMON_PLUGIN = "bkt-dia-common";
const DIA_STEP_KEYS = ["validate","build_question","query","result"] as const;
const DIA_RUNS_DEFAULT_LIMIT = 50;

getDiaModules(): Promise<DiaModulesResponse>                       // GET  /api/plugins/bkt-dia-common/modules
getDiaHealth(): Promise<DiaHealthResponse>                         // GET  .../health
runDiaTool(module: string, tool: string, args: DiaToolArguments): Promise<DiaRunResponse> // POST .../run, JSON {module,tool,arguments}
getDiaRuns(limit = 50): Promise<DiaRunsResponse>                   // GET  .../runs?limit=N (floored, min 1)
getCronJobRuns(id: string, profile = getManagementProfile()): Promise<CronJobRunsResponse> // GET /api/cron/jobs/{id}/runs?profile=… (omitted when profile is "")
isDiaConsoleNavVisible(manifests: readonly Pick<PluginManifest,"name">[], pluginsLoading: boolean): boolean
```

Plugin calls carry no manual `?profile=`; `fetchJSON` appends it (tests assert exactly one `profile` param). A 404 (unknown module/tool) rejects with the `fetchJSON` ApiError.

Types: `DiaStage` (7 stage literals), `DiaStepKey`, `DiaStepStatus` (`ok|error|skipped`), `DiaStep {key,status,ms}`, `DiaSchemaType` (`string|integer|number|boolean|array|object`), `DiaSchemaProperty {type?,description?,enum?,default?,minimum?,maximum?}`, `DiaToolParameters {type?,properties?,required?}`, `DiaTool`, `DiaCategory {slug,label_vi,label_en}`, `DiaModule`, `DiaModulesResponse`, `DiaFailure {error,hint,stage}`, `DiaHealthOk {ok:true,status,total_documents:number|null,latency_ms}`, `DiaHealthError` (`ok:false` + DiaFailure), `DiaHealthResponse` (discriminated on `ok`), `DiaToolArguments = Record<string,string|number|boolean>`, `DiaRunRequest`, `DiaSource = Record<string,unknown>`, `DiaRunResponse {ok,steps,function_code,question?,answer?,type?:string|null,sources?} & Partial<DiaFailure>`, `DiaRunSource` (`agent|console`), `DiaRunLogEntry {id,at(epoch s),module,tool,source,ok,stage|null,error|null,duration_ms,question_preview|null}`, `DiaRunsResponse`, `CronJobRun {id,title?,preview?,source?,started_at,ended_at?,is_active?,archived?,profile?}`, `CronJobRunsResponse {runs,limit}`.

## Nav / route

- Route `/dia` is in `BUILTIN_ROUTES_CORE`: renders on direct URL regardless of plugin state.
- Nav `{ path: "/dia", label: "DIA AI Console", icon: Bot }` right after BKT Modules; filtered out unless `isDiaConsoleNavVisible(manifests, pluginsLoading)` (plugins loaded AND `bkt-dia-common` manifest present). No optimistic show. Note: `usePlugins` seeds `loading=false` from the per-profile sessionStorage manifest cache, so after a refresh the entry follows the cached list until the fresh list lands (existing behaviour for all plugin tabs).

## i18n keys

Fallback pattern for pages: `t.diaConsolePage ?? enDiaConsolePage` (import `enDiaConsolePage` from `@/i18n/en`). Vietnamese stays in page folders.

`diaConsolePage` (`DiaConsolePageStrings`):
- `title`, `headline`
- `tabs.{status, recentRuns, monitoring}` (category tabs use module catalog labels)
- `status.{endpointConfigured, endpointNotConfigured, commonDisabled, enabled, disabled, lastRun, neverRun, runOk, runFailed}`
- `health.{title, status, documents, latency, ok, error, checking, hint}`
- `steps.{validate, build_question, query, result}` (keys equal `DiaStepKey`)
- `stepStatus.{ok, error, skipped, pending}`
- `stages.{validate, disabled, config, url_safety, network, http, response}` (keys equal `DiaStage`)
- `result.{question, answer, type, sources, showMoreSources(count), showFewerSources}`
- `form.{required, requiredMissing(field), selectPlaceholder}`
- `recentRuns.{time, module, tool, source, outcome, duration, sourceAgent, sourceConsole}`
- `monitoring.{name, schedule, state, lastRun, active, paused, viewOutput}`
- `empty.{allHidden, allHiddenHint, noRuns, noMonitors, noMonitorsHint, noTools, noSources}`
- `buttons.{run, running, refresh, reload, openBktModules}`
- `disabledModuleHint`, `loadFailed`, `runFailed(error)`, `lastUpdated(time)`, `elapsed(seconds: string)`, `durationMs(ms)`

`bktModulesPage` additions (`BktModulesPageStrings`, required in the interface; only `en.ts` implements it):
`showUi`, `uiShown`, `uiHidden`, `toggleShowUiLabel(name)`, `toggleCategoryShowUiLabel(category)`, `uiFilterLabel`, `uiFilterAll`, `uiFilterShown`, `uiFilterHidden`, `dashboardTabsGroup`, `dashboardTab`, `diaConsoleRow` ("DIA AI Console"), `headerLogoRow` ("Header logo"), `creditLineRow` ("Credit line"), `visibilityRefreshNotice`, `reloadDashboard` ("Reload Dashboard"), `showUiFailed(name, error)`.

## Gates

- `pnpm --dir web typecheck`: pass.
- `pnpm --dir web lint`: 0 errors, 29 warnings, all pre-existing; the only warnings in touched files are App.tsx:422 and :982 (`set-state-in-effect`, untouched code).
- `pnpm --dir web test -- dia-console`: the `--` arg ran the whole suite: 77 files / 524 tests pass. Targeted `vitest run dia-console DiaConsoleNav`: 2 files / 12 tests pass.
- `git diff --stat web/src/lib/api.ts`: empty.
- Tooling note: `pnpm` via corepack 12.14.0 is broken on this machine (missing `pnpm.cjs`); gates ran with corepack's cached pnpm 10.33.2 (`node .../pnpm/10.33.2/bin/pnpm.cjs`).

## Deviations

- Nav test is `web/src/pages/DiaConsoleNav.test.ts` (no JSX needed) and tests the pure predicate `isDiaConsoleNavVisible`, which App.tsx uses; no existing App/nav render test exists and rendering full `App` needs many providers.
- The nav predicate and `DIA_COMMON_PLUGIN` live in `dia-console-api.ts` (exporting non-components from App.tsx would trip `react-refresh/only-export-components`). Phase 04 can reuse `DIA_COMMON_PLUGIN`.
- `DiaHealthOk.total_documents` typed `number | null` (defensive vs. contract's bare field).
- Phase file status not edited (plan status is CLI-managed; left to orchestrator).

## Unresolved questions

- None blocking. Phase 01 should confirm `runs[].id` is numeric and `at` is epoch seconds (typed so, per the `runs` table schema in phase 01).
