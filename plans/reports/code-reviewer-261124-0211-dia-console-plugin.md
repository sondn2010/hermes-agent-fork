# Code review: DIA AI Console moved into the bkt-dia-common dashboard plugin

Scope: bkt/packages/dia/src/** (26 files, ~2.3k LOC), bkt/scripts/build.mjs, check-dist-fresh.mjs, manifest.json, web/src/App.tsx, i18n, bkt-modules-grouping.ts, docs. dist/ and node_modules not read (hook). Host component APIs were checked against the published `@nous-research/ui@0.19.1` sources on unpkg.

## Verdict
There are no critical or high-severity defects. Feature parity with `git show HEAD:` originals holds: form-values, grouping and newest-fetch are byte-equivalent apart from import changes, and the store, run flow, health, recent runs, monitoring, disabled and all-hidden states match. Profile scoping is correct at runtime. The open findings are about tests, performance, and following the existing pattern.

## Verified OK (no action)
- **Profile scoping.** `usePlugins` always passes a non-empty owner (`profile || dashboardServingProfile()`, web/src/plugins/usePlugins.ts:112). Each profile gets its own `<script data-hermes-profile>`, and on a switch the old scripts are removed and the registry is cleared. `registerPlugin` also ignores bundles from another profile (registry.ts:85-95). So `bundleProfile()` is fixed per bundle instance, and the component remounts on a switch. `useNewestFetch` bumps `seq` on unmount and `run()` checks `mounted`, so a late response cannot land in the next profile's view. An explicit `?profile=` beats the host's auto-suffix (api.ts:149). The empty-profile cron call `GET /api/cron/jobs?profile=` behaves the same as the original `api.getCronJobs(getManagementProfile())`, because the backend maps "" to "all" (cron.py:158). The management profile and the plugin profile come from the same `profile` (App.tsx:383).
- **Host component APIs.** `TabsTrigger` takes `active` and `value` and needs no `Tabs` root (`Tabs` is a render-prop wrapper). `Checkbox` is radix `Checkbox.Root`, so `onCheckedChange(boolean|"indeterminate")` is correct. `Select` is a custom combobox that takes `id`, `value` and `onValueChange`, with `SelectOption` as a marker. `Badge` tones are the same as the original's.
- **Registration name.** `registerPlugin("bkt-dia-common")` (index.tsx:6 via dia-api.ts:14) matches the manifest `name`.
- **build.mjs.** `DIST_OVERRIDES` writes to plugins/bkt_dia_common/dashboard/dist/{index.js,style.css}, and check-dist-fresh's pathspec covers that directory. The size budget applies. The tsconfig and vitest globs already include packages/*/src.
- **Markdown security.** `MarkdownView` is react-markdown with no rehype-raw, so the default urlTransform drops `javascript:` links, and links get `noopener noreferrer nofollow`. Sources render as escaped text, and the endpoint URL is never sent to the browser.
- **No DIA console code left in web/src.** The only remaining hit is the BKT Modules row label `diaConsoleRow`, which is intended.

## Medium

**M1. The profile-scoping requirement is never tested through the real default path.**
- Where: bkt/packages/dia/src/dia-api.test.ts:70-87 and DiaConsole.test.tsx (no assertion on `profile` anywhere).
- Problem: every API function defaults to `bundleProfile()`, which is `SELF_PROFILE`, captured from `document.currentScript` when the module is evaluated. In vitest that value is null. The tests only call `scopedUrl(..., "work")` and the cron helpers with an explicit argument.
- Failure scenario: a later edit drops `scopedUrl` from `runDiaTool` or `getHubPlugins`, or changes `loadMonitors` to pass `""`. All 191 tests still pass, and in a multi-profile host the hub flags or the cron list then follow the host default instead of the bundle's profile. This was the stated focus requirement.
- Fix: in DiaConsole.test.tsx, add `vi.mock("@bkt/shared/sdk", async (orig) => ({ ...(await orig()), bundleProfile: () => "work" }))`. Render the console, open a category, run a tool, then assert `sdk.calls.every(c => c.url.searchParams.get("profile") === "work")`. That covers modules, health, runs, hub, run, cron jobs and cron runs.

**M2. Monitoring now costs 1+N cron requests on every visit to /dia and on every return to Tổng quan.**
- Where: monitoring.tsx:22-35, mounted from DiaConsole.tsx:51 inside `OverviewView`. DiaConsole.tsx:98 unmounts the overview whenever a category tab is active.
- Problem: in the core console, monitoring was a separate tab and only fetched when that tab was opened. Now it sits on the default landing tab. `loadMonitors` makes one `/api/cron/jobs` call, then one `/runs` call per DIA job, and each `/runs` call reads that profile's session store.
- Failure scenario: a user moving back and forth between Tổng quan and a category to run tools triggers a full N+1 refetch every time. The same happens on every page open, even when the user only came to run a tool.
- Fix: move the monitors `useNewestFetch` into `useDiaConsole`, next to `runs`, and pass it down the same way `RecentRuns` gets its data. It then loads once per page and survives tab switches. Manual refresh stays.

**M3. Profile scoping reimplements the shared helper instead of using it.**
- Where: dia-api.ts:166-205 (`scopedUrl` plus a hand-built cron URL).
- Problem: the other bkt packages (prompts, kanban-workflow, profiles) declare their endpoints in `PROFILE_TRANSPORT` and call `profileFetch` (bkt/shared/api.ts:28-103). The DIA endpoints are not in that table, so the "every profile-scoped endpoint and its transport" record is now incomplete. There are also two code paths for building `?profile=`. This is the AI-risk pattern of a parallel utility.
- Fix: add `/api/plugins/bkt-dia-common/{modules,health,run,runs}`, `/api/dashboard/plugins/hub`, `/api/cron/jobs` and `/api/cron/jobs/:id/runs` (all `query`) to `PROFILE_TRANSPORT`, call `profileFetch(endpoint, bundleProfile(), { query, params, body })`, and delete `scopedUrl`. Keep the one cron special case, where an empty profile lets the backend find the job's owner, as a single commented branch.

## Low

- **L1. `?tab=` state is read once and never re-synced** (dia-tabs.ts:29-35).
  - Scenario: on `/dia?tab=domain-lookup` the user clicks the sidebar "Trung tâm DIA AI" link, or the host router navigates to `/dia`. The route doesn't change, so the component isn't remounted. The URL loses `tab` but the category stays open, so the URL and UI disagree, and a reload lands on a different tab.
  - Related case: when a category disappears after a reload, the fallback to the overview leaves the stale `?tab=` in the URL.
  - Fix: derive the active tab from `window.location.search` each render, subscribed to `popstate` with `useSyncExternalStore`, and call `writeTabParam(OVERVIEW_TAB)` when `resolveTab` falls back.
- **L2. Two unenforced sources for the plugin name** (build.mjs:38-42 vs dia-api.ts:14).
  - The comment says `PLUGIN_NAMES` "must equal the manifest name", but nothing checks it, and it only affects the banner.
  - Fix: either have build.mjs read `manifest.json` `name` for override directories and fail on a mismatch, or drop `PLUGIN_NAMES` and use the directory name in the banner.
- **L3. Base-path logic is duplicated** (dia-primitives.tsx:6-10 copies the private `basePath()` from shared/sdk.ts:26-30). Fix: export a `routeHref` or `basePath` from shared/sdk.ts.
- **L4. Tab accessibility.** `role="tab"` buttons have no `aria-controls` and no arrow-key roving focus, and `role="tabpanel"` has no `aria-labelledby` (DiaConsole.tsx:90-98). Either add them or drop the ARIA tab roles so screen readers aren't told the widget supports keyboard tab navigation.
- **L5. Markdown behaviour change.** DIA answers now go through `MarkdownView`, which renders ```` ```mermaid ```` fences by loading the bkt-brand vendor mermaid. Mermaid runs in strict mode with DOMPurify, so this is acceptable, but it differs from the core `Markdown` component. Confirm it's intended for untrusted service output.
- **L6. Sidebar position changed.** The tab used to sit right after "BKT Modules"; with `"position": "end"` it now joins the other bkt tabs at the end. This is a UX change; confirm it's accepted.
- **L7. Working tree hygiene.** `.claude/hooks/.logs/hook-log.jsonl` is modified (1,173 lines). Don't include it in the commit.

## Tests
The behaviour tests are good: tab default and fallback, reload restoring the tab, required-field block, pending timer, failure stage and hint, hidden or all-hidden modules, cron filtering, and refresh. None are change-detectors. The gaps are M1 (profile) and the enum and boolean fields, which have no test against the real host contract (the stub models the radix Checkbox correctly).

## Plan follow-ups
Phases 1-4 appear complete in code. Phase 5's browser verification (7 sub-tabs, `?tab=` surviving a reload in the real host) can't be proven from the repo and should be confirmed manually.

## Unresolved questions
1. Is the sidebar position at the end (L6) accepted?
2. Is mermaid rendering of DIA answers (L5) wanted?

Status: DONE_WITH_CONCERNS
Summary: The port has feature parity and profile scoping is correct at runtime; component APIs were checked against the @nous-research/ui 0.19.1 sources. The main concerns are an untested profile-default path (M1), an N+1 cron fetch on the landing tab (M2), and a parallel reimplementation of profileFetch (M3).
