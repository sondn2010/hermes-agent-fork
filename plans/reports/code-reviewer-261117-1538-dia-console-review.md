# Code Review: DIA Console + unified UI visibility (uncommitted, feature/bktech)

## Scope
- Backend: `plugins/bkt_dia_common/{dashboard/plugin_api.py, dashboard/manifest.json, module_catalog.py, run_log.py, query_client.py, settings.py, tool_factory.py, plugin.yaml}`, `hermes_cli/web_server_dashboard.py` (orphan `user_hidden`)
- Frontend: `web/src/lib/dia-console-api.ts`, `App.tsx`, `pages/DiaConsolePage.tsx`, `pages/dia-console/**`, `pages/bkt-modules/**`
- Tests: `tests/plugins/bkt_dia/**`, `tests/hermes_cli/test_plugins_hub_tags.py`, web tests
- Spec: `plans/261117-1315-dia-console-and-unified-ui-visibility/plan.md`
- Not read: `plugins/bkt_dia_common/dashboard/dist/index.js` (blocked by local scout hook)

## Verification run
- `scripts/run_tests.sh tests/plugins/bkt_dia tests/hermes_cli/test_plugins_hub_tags.py`: run 1 = **1 failed** (`test_module_catalog.py::test_changed_module_file_is_reloaded`, `'F099' == 'F098'`); run 2 = 340 passed / 0 failed. Catalog file alone passed 2/2 more runs. **Flaky** (see M1).
- Web typecheck / vitest: could not run (`MODULE_NOT_FOUND` from pnpm in `web/`; tooling not installed in this checkout). Unverified.
- `python scripts/check`, `boundary_lint --check`: not run.
- `web/src/lib/api.ts`: unchanged (2670 lines). No plan IDs/phase labels found in code or tests.

## Overall
Security core of `/run` is sound. Token dependency on the router covers all 4 routes; disabled module refused before any HTTP (tested); 8 KB argument cap; userinfo rejected before `is_always_blocked_url` (polarity correct: True = blocked); metadata by IP and hostname tested; `follow_redirects=False`; DNS + sqlite + config work all go through `asyncio.to_thread` (contextvars copied, so the `?profile=` scope from `_plugin_route_secret_scope` holds); no key/endpoint in responses (tested). Agent tool result shape unchanged except `stage` (tested). Frontend newest-fetch-wins correct; hidden modules filtered before render; Markdown component drops non-http(s)/mailto hrefs; sources rendered as text. Issues below are robustness/contract gaps, no blockers on trust boundaries.

## Critical
None.

## High
None.

## Medium

### M1. Catalog reload uses stale bytecode -> flaky test and stale catalog
`module_catalog.py:155-164` loads via `spec_from_file_location(...).loader.exec_module`, i.e. `SourceFileLoader`, which validates `__pycache__/__init__.*.pyc` by **integer-second source mtime + source size**. `_signature` (`:189-190`) uses `st_mtime_ns`, so the catalog decides "changed" and re-execs, but the loader reuses the old pyc when the edit lands in the same second with the same byte size.
- Repro: observed failure 1 of 3 runs, `test_module_catalog.py:113-122` (F099 -> F098 is same size, mtime bumped 10 ms).
- Prod impact: an edit to a module spec within the same second (same size) keeps serving the old `MODULE` until the next edit; catalog and `find_tool` (used by `/run`) disagree with disk.
- Fix: bypass the pyc: `code = compile(path.read_bytes(), str(path), "exec"); exec(code, loaded.__dict__)` after `module_from_spec`, or wrap the load in `sys.dont_write_bytecode`-equivalent by using `importlib.machinery.SourceFileLoader` subclass with `get_code` that never reads cache. Test then becomes deterministic.

### M2. `run_log.record` can break the tool call it must never break
Docstring `run_log.py:63-66` promises "A storage failure is logged and swallowed". Only `sqlite3.Error` is caught (`:77`). `plugin_db` -> `plugin_data_dir` does `root.mkdir(parents=True, exist_ok=True)` (`plugins/plugin_storage.py:31`) and `open_db` does `path.parent.mkdir(...)`: a read-only/ACL-locked `HERMES_HOME/plugin-data` or disk-full raises `OSError` (`PermissionError`), which propagates out of `run_query_tool` (`tool_factory.py:224`).
- Failure: agent `bkt_dia_*` tool call raises after the DIA answer was already obtained (answer lost); console `/run` returns 500.
- Fix: `except (sqlite3.Error, OSError)` in `record` (and `recent`). Same in `recent()` so `/runs` returns `[]` instead of 500.
- Related (Low): `_open()` (`:48-51`) runs `CREATE TABLE` outside `closing()`; if it raises (corrupt file "file is not a database", locked), the connection is not closed before GC — on Windows that can hold the file handle. Pass schema creation into the `with closing(...)` block or close in `_open` on failure.

## Low

### L1. `plugin.yaml` parse/read error fails the whole catalog
`module_catalog.py:169` reads/parses `plugin.yaml` **outside** the try at `:177`. Malformed YAML in one bundled module -> `/modules` 500 and every `/run` 500 (via `find_tool` -> `_cached`). Contradicts module docstring (`:9`, "A module that fails to load is listed with error instead of failing the whole catalog") and plan Risks. Move the manifest read into the guarded block (falling back to `directory.name`). Same for `_signature` `stat()` racing a removed dir (rare).

### L2. Frontend `DiaModule` type does not match backend for broken modules
Backend can return `function_code: null`, `emoji: null`, `category: null` and an extra `error` string (`module_catalog.py:172-181`). `dia-console-api.ts:68-77` types them as non-null `string` and omits `error`. Runtime is safe (all reads are truthiness-guarded: `dia-console-module-panel.tsx:54-56`, `dia-console-grouping.ts:359-361`), but a broken-but-enabled module renders "No tools" with no explanation. Type as `string | null`, add `error?: string`, show it in the panel. Also `DiaRunResponse` lacks `sources_omitted?` that `_parse_payload` can emit.

### L3. Misleading comment: server does not type-validate arguments
`dia-console-form-values.ts:365-368`: "Leave an unparsable value as text so the server reports it at the validate stage." Server `validate` stage only checks required-non-empty (`tool_factory.py:179-181`); a non-numeric value for an integer field is rendered into the question and sent to DIA. Either drop the claim or block submit client-side on `NaN` for `number`/`integer` kinds.

### L4. Step timeline inconsistent when the rendered question fails validation
`query()` returns `stage: "validate"` for an empty/over-4000-char rendered question (`query_client.py:161-166`), but `run_query_tool` already marked `validate` ok and then reports `query: error` (`tool_factory.py:221-222`, `_query_steps`). Reachable for a tool whose template is all optional segments called with `{}`. Map `stage == "validate"` from `query()` to the validate/build_question step, or document it.

### L5. Disabled-module refusals are not in the run log
`plugin_api.py:68-72` returns before `run_query_tool`, so console refusals never reach Recent runs while every other failure stage does. Probably intentional; confirm against acceptance criterion 4.

### L6. Bulk toggle overlaps an in-flight single toggle
`bkt-modules-store.ts:181-203`: `toggleMany` does not skip names already in `state.pending`; its `finally` removes them from pending while the single request is still in flight, and both requests race on the server. Row switch is normally disabled while pending, so this needs a single click then a category click within the request window. Filter `names` by `!state.pending.has(name)`.

### L7. Run log cap is 550, not 500
`run_log.py:75,83-85`: prune only when count > 550, back to 500. `/runs` caps reads at 500, so UI is fine; acceptance criterion 4 says "capped at 500 rows". Document as "500 (+50 slack)" or adjust.

### L8. URL-safety TOCTOU (pre-existing pattern)
`is_always_blocked_url` resolves DNS, then `httpx.request` resolves again (`query_client.py:58-65,104-106`): a rebinding hostname could resolve to metadata on the second lookup. Endpoint is admin config under the same dashboard token, so impact is limited; same as the prior `is_safe_url` path. No change required for this plan; note in admin docs.

### L9. Minor dead/unbounded bits
- `run_log.SOURCES` (`run_log.py:29`) unused — dead code per AGENTS "no dead code".
- 8 KB cap is applied after the full JSON body is parsed (`plugin_api.py:46-51`); there is no pre-parse body size limit. Token holders only; acceptable.

## Edge cases checked (no issue)
- Token: router-level `Depends(_require_token)`; real-dashboard mount test asserts 401 then 200.
- Profile: no home/config caching (`settings` reads per call; `plugin_db` resolves home per call; catalog cache holds only bundled file content keyed by dir path, `enabled` read per call). Two-home test for runs passes. Pages are remounted per profile (`App.tsx:839-840` keys on profile), so console state does not leak across profile switches.
- Redaction before truncation: `question_preview` (`run_log.py:54-60`) correct; answers never stored (tested on raw db bytes).
- Nav: builtin `/dia` route wins over the hidden plugin tab (`App.tsx:360,371`); nav hidden while plugins load and when the `bkt-dia-common` manifest is absent.
- bkt-modules optimistic flow: reconcile gated by fetch seq + mutation epoch; hub cache invalidated server-side on visibility change (`web_routers/dashboard_ui.py:384`); bulk rollback correct because callers pass only rows whose state differs (`bkt-modules-category-section.tsx:135,148`).
- XSS: `Markdown` blocks `javascript:`/`data:` hrefs (`components/Markdown.tsx:329-332`); sources/questions rendered as React text.
- Run form: Run disabled while pending, so one result slot never has two in-flight runs.

## Recommended actions
1. M1: load module spec without the bytecode cache; rerun catalog test 10x.
2. M2: catch `OSError` in `run_log.record`/`recent`; close conn on schema failure.
3. L1: move manifest read under the per-module guard.
4. L2/L3: fix `DiaModule` nullability + surface `error`; fix or remove the server-validation comment.
5. Run web `typecheck`/`vitest`/`lint` and `python scripts/check` in an environment with tooling (not verified here).

## Plan follow-ups
- Phases 01-04 appear implemented per contract; phase 01 not fully green until M1 is fixed (flaky gate in acceptance 8).
- Phase 05 (docs) still in progress; include L7 cap wording and L8 note.

## Unresolved questions
- Is omitting disabled-refusals from the run log (L5) intended?
- Pre-existing: a non-ASCII `BKT_DIA_QUERY_API_KEY` likely raises `UnicodeEncodeError` in httpx header encoding (not an `httpx.HTTPError`), escaping `_send`'s "never raises". Not verified (venv access blocked by hook).
- `dashboard/dist/index.js` not reviewed (hook-blocked).
