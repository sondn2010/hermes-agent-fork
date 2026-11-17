# Phase 01 report: console backend in bkt-dia-common

Status: done with concerns (boundary-lint expectation in the brief does not match the tree; see below).

## Files

Created:
- `plugins/bkt_dia_common/dashboard/manifest.json` (exact spec manifest; `tab.hidden: true`, `api: plugin_api.py`)
- `plugins/bkt_dia_common/dashboard/dist/index.js` (hand-written; `window.__HERMES_PLUGINS__.register("bkt-dia-common", () => null)`, matches `registerPlugin(name, component)` in `web/src/plugins/registry.ts`)
- `plugins/bkt_dia_common/dashboard/plugin_api.py` (93 lines; `/modules`, `/health`, `/run`, `/runs`; router-level `_require_token` dependency; all blocking work in `asyncio.to_thread`)
- `plugins/bkt_dia_common/module_catalog.py` (128 lines)
- `plugins/bkt_dia_common/run_log.py` (98 lines)
- `tests/plugins/bkt_dia/test_console_api.py` (33 tests), `test_run_log.py` (7), `test_module_catalog.py` (7)

Modified:
- `plugins/bkt_dia_common/query_client.py`: `stage` on every failure; `_resolve_target()` (gate, settings, endpoint, query_url, URL safety); shared `_send()` with `follow_redirects=False`; new `health()`; `query()` behaviour otherwise unchanged.
- `plugins/bkt_dia_common/settings.py`: `is_module_enabled(name)`; `is_common_enabled()` delegates to it.
- `plugins/bkt_dia_common/tool_factory.py`: `run_query_tool(...)` (steps + run log); `make_handler` uses it with `source="agent"` and strips `steps`/`question`.
- `plugins/bkt_dia_common/plugin.yaml`: endpoint description updated for the new private-endpoint rule.
- `hermes_cli/web_server_dashboard.py`: `orphan_dashboard_plugins` rows carry `user_hidden` (one statement).
- `tests/hermes_cli/test_plugins_hub_tags.py`: orphan `user_hidden` test.
- `tests/plugins/bkt_dia/conftest.py`: `health_payload` knob.
- `tests/plugins/bkt_dia/test_common_query_client.py`: stage assertions; private-endpoint-refused test replaced by loopback-allowed + userinfo + ambiguous-authority + metadata (both `allow_private_urls` values) tests (intentional contract change).

## Gates

- `scripts/run_tests.sh tests/plugins/bkt_dia tests/hermes_cli/test_plugins_hub_tags.py`: 14 files, 340 passed, 0 failed (289 bkt_dia before new files; 47 new bkt_dia tests; hub file 4).
- `python scripts/boundary_lint.py --check`: exit 1 BEFORE and AFTER this phase. Tree was already 859/20 with 19 un-baselined crossings (bkt-files, bkt-kanban-workflow, bkt-profiles, bkt-prompts, zalo). This phase adds 2 intended crossings -> 861/20:
  - `plugins/bkt_dia_common/query_client.py tools.url_safety.is_always_blocked_url` (plan-mandated floor check; only `is_safe_url` is published)
  - `plugins/bkt_dia_common/dashboard/plugin_api.py hermes_cli.web_server._require_token` (bkt-prompts/bkt-files precedent)
  Baseline not updated (`scripts/boundary_lint_baseline.json` is outside my ownership).
- `python scripts/check`: fails on pre-existing findings only (the health/ruff diff is vs upstream `c9b20d7`, so it lists the whole fork: `.claude/skills/*`, `bkt-profiles` HX016, `apps/desktop/src/i18n/vi.ts` FILE_LINES, shebangs, no-tmp, agents-md, blob-size). Zero findings in my files after fixing 4 (one utf-8-sig footgun, three ruff nits). One reviewed waiver: `module_catalog.py:81 BLE001 -- one broken module must not hide the other nineteen`. No findings reported for `web/src`.
- New functions all CC well under 20 (health check reported none).

## Deviations

- `run_query_tool(module, tool, args, *, source)` takes the MODULE mapping, not `function_code`: the run log needs the module name (`toolset`), and the mapping carries both. `make_handler(module, tool)` changed accordingly (only caller is `register_query_tools`).
- Console run result also includes `question` (rendered question, contract's optional field); agent handler strips it so the tool result shape is unchanged apart from `stage`.
- Disabled-module refusal returns all four steps as `skipped` and is not written to the run log (refused before `run_query_tool`). `bkt-dia-common` disabled is refused inside `run_query_tool` (stage `disabled`) and is logged.
- Step mapping: response-shape failure (`stage: response`) marks `query` ok and `result` error; any other query failure marks `query` error and `result` skipped.
- Run log prune: when the newest id passes 550, a cheap `COUNT(*)`; delete down to 500 only when the count exceeds 550. `recent()` clamps to 500, so the API never shows more than 500.
- Redaction uses the published `agent.redact:redact_sensitive_text(force=True, redact_url_credentials=True)` before the 200-char cut.
- Phase file not updated: the brief said not to touch plan files.
- Tests use FastAPI `TestClient` on the router with `dependency_overrides` for the token, plus one real-dashboard-app test proving the mount path and the 401 without a token.

## Unresolved questions

1. Boundary lint: should `scripts/boundary_lint.py --update` be run (by whoever owns the baseline) to record the 2 intended crossings? It would also baseline the 19 pre-existing bkt/zalo ones, which predates this plan. The brief's "unchanged 843/20" does not match the current tree (859/20 before this phase).
2. `hermes plugins validate` (via `cmd_validate`, temp `HERMES_HOME`): all 20 `bkt-dia-*` modules pass (capability probe, declared tools). `bkt_dia_common` fails the capability probe with `No module named 'ruamel'` (its `register()` reads config). This is pre-existing: the HEAD copy of `bkt_dia_common` fails identically. Should that probe failure be fixed in a later phase, or is it accepted?
