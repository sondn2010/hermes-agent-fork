---
phase: 1
title: "Console backend in bkt-dia-common"
status: done
priority: P1
effort: "1d"
dependencies: []
---

# Phase 01: Console backend in bkt-dia-common

## Goal

Serve the frozen plugin API contract in `plan.md` from `plugins/bkt_dia_common/dashboard/plugin_api.py`. Agent tools and console runs must share one run path that writes a per-profile run log.

## Context

- The manifest lives in `plugins/bkt_dia_common/dashboard/`. Discovery derives the dashboard name from manifest `name`, so `"name": "bkt-dia-common"` gives the route `/api/plugins/bkt-dia-common/*`. That is the same name as the agent plugin, so hub `user_hidden` and `plugins.disabled` line up.
- The API of a bundled plugin mounts unless the plugin is explicitly disabled (`_plugin_api_mount_skip_reason`, `hermes_cli/web_server_dashboard.py:880`). The run route therefore enforces its own gates: common enabled and module enabled.
- The profile is bound per request by `_plugin_route_secret_scope`. Never cache the home or config across requests.
- Precedent for auth and storage: `plugins/bkt-prompts/dashboard/plugin_api.py` (`_require_token` wrapper, `plugins.plugin_storage.plugin_db`).

## Files

Create:
- `plugins/bkt_dia_common/dashboard/manifest.json`:
  `{"name":"bkt-dia-common","label":"DIA AI Console","description":"Backend for the /dia console page.","icon":"Bot","version":"0.1.0","tab":{"path":"/dia","hidden":true},"entry":"dist/index.js","api":"plugin_api.py"}`
- `plugins/bkt_dia_common/dashboard/dist/index.js`: a hand-written few lines that call `window.__HERMES_PLUGINS__.register("bkt-dia-common", () => null)`. There is no build step. Check the `register` signature against `web/src/plugins/registry.ts` first.
- `plugins/bkt_dia_common/dashboard/plugin_api.py`: the FastAPI `router` with the four routes. These are thin handlers. Blocking work goes through `asyncio.to_thread`.
- `plugins/bkt_dia_common/module_catalog.py`:
  - `list_modules()` discovers sibling dirs `plugins/bkt-dia-*/`.
  - It reads `plugin.yaml` (name, description, `category:` tag) and loads `__init__.py` by file path with `importlib.util.spec_from_file_location` under the private name `_bkt_dia_catalog_<slug>`. It reads `MODULE` and checks it with `validate_module_spec`. It never calls `register()`.
  - The cache is keyed by directory and mtime. A broken module yields an entry with `"error"` instead of raising.
  - `find_tool(module, tool)` returns the spec or None.
- `plugins/bkt_dia_common/run_log.py`:
  - `record(entry)` and `recent(limit)` live in `plugin_db("bkt-dia-common", "runs.db")`.
  - Open via `contextlib.closing(plugin_db(...))` per call and close immediately; never hold module-level connections (prevents Windows file locks and handle leaks).
  - Table `runs(id INTEGER PK, at REAL, module, tool, source, ok INTEGER, stage, error, duration_ms INTEGER, question_preview)`.
  - `question_preview` is capped at 200 characters and sanitized with a basic credential/token redaction pass before insert.
  - Prune opportunistically (e.g. prune to 500 when count exceeds 550, or `id % 50 == 0`) rather than executing a `DELETE` subquery on every single insert, avoiding database lock contention.
  - Catch only `sqlite3.Error` (log at debug). A logging failure never breaks a tool call.
- `tests/plugins/bkt_dia/test_console_api.py`, `tests/plugins/bkt_dia/test_run_log.py`, `tests/plugins/bkt_dia/test_module_catalog.py`. Follow the `starlette.testclient.TestClient` pattern in `tests/plugins/bkt_prompts/test_crud.py`.

Modify:
- `hermes_cli/web_server_dashboard.py`:
  - In `_merged_plugins_hub()` (line 852), attach `"user_hidden": p["name"] in hidden_plugins` to each dictionary in `orphan_dashboard_plugins` so dashboard-only tabs report visibility to the frontend.
  - Add test in `tests/hermes_cli/test_plugins_hub_tags.py`.
- `plugins/bkt_dia_common/query_client.py`:
  - Add `"stage"` to every `_fail` (`validate`, `disabled`, `config`, `url_safety`, `network`, `http`, `response`).
  - Extract the shared preflight (gate → settings → endpoint → `query_url` → `is_safe_url`) into `_resolve_target()`.
  - Add `health()`. It does `GET <query_url>/test` with the same safety rules, `follow_redirects=False` and the timeout. It parses `{status, total_documents}` and returns `latency_ms`. That endpoint answers HTTP 200 even on error, so read `status`.
  - <!-- Updated: Red Team Review Session - private endpoint uses the floor-only check with explicit userinfo and polarity guard -->
    Inside `_resolve_target()`, replace `is_safe_url(url)` with explicit userinfo rejection + `tools.url_safety.is_always_blocked_url(url)`:
    - Check userinfo first: `if "@" in urlsplit(url).netloc: return _fail("bkt-dia endpoint contains user credentials", "remove username/password from endpoint URL", stage="url_safety")` because `is_always_blocked_url` bypasses userinfo ambiguity checks on floor mode.
    - Note polarity inversion: `is_always_blocked_url(url)` returns `True` when BLOCKED (in contrast to `is_safe_url` which returns `True` when safe). The guard is `if is_always_blocked_url(url): return _fail(..., stage="url_safety")`.
    - A private or loopback DIA endpoint then works without the global `security.allow_private_urls`.
    - Cloud-metadata targets (both by IP and by hostname resolving to metadata IP via `_getaddrinfo`) and ambiguous authorities stay blocked, with stage `url_safety`.
    - Keep `follow_redirects=False`, so a trusted host cannot bounce a request to another target.
    - Because `_resolve_target()` executes socket DNS calls synchronously, FastAPI async handlers must execute it inside `asyncio.to_thread`.
- `plugins/bkt_dia_common/settings.py`: add `is_module_enabled(name)`. It reads `plugins.enabled` / `plugins.disabled` at call time, with the same semantics as `is_common_enabled`.
- `plugins/bkt_dia_common/tool_factory.py`:
  - Extract `run_query_tool(function_code, tool, args, *, source) -> dict`, which returns the result dict plus `steps`.
  - `make_handler` calls it with `source="agent"` and JSON-dumps it without `steps`, so the tool result shape stays unchanged.
  - Every run, successful or not, calls `run_log.record`.
- `tests/plugins/bkt_dia/conftest.py`: add a `health_payload` knob so tests can return a `status != "success"` body.

## Steps

1. Refactor `query_client` (stages, `_resolve_target`, `health`) with no behaviour change to `query()`. Existing tests must stay green.
2. Add `is_module_enabled`, then `run_query_tool` and `run_log`. The handler output stays byte-compatible apart from the new `stage` key on failures.
3. Add `module_catalog`. It reports `enabled` per module through `is_module_enabled`, and `category` from the `category:` tag, falling back to `categories.py` order.
4. Add the manifest, the stub `dist/index.js` and `plugin_api.py`. The run route refuses in this order:
   - unknown module or tool → 404;
   - module disabled → `ok:false, stage:"disabled"`;
   - otherwise → `run_query_tool(..., source="console")`.

   Arguments must be a JSON object, at most 8 KB.
5. Write the tests: temp `HERMES_HOME`, the existing `dia_stub`, and FastAPI `TestClient` on `router` with the token check patched in the same way bkt-prompts tests do it.
   - `modules` lists all 20, and `enabled` flips with `plugins.enabled`.
   - `health` covers ok, unset, invalid, blocked, unreachable, non-2xx, `status != success`, and wrong shape.
   - `run` covers ok with four steps, a missing required field (`stage validate`, no HTTP request sent), a disabled module refused with no HTTP request sent, an unknown tool returning 404, and a redirect not followed.
   - `runs` returns agent and console entries newest first. Two temp homes do not see each other's runs. The log prunes at 500 and never stores the answer.
   - No response contains the API key or the endpoint value.
   - URL safety (query and health), with `allow_private_urls: false`:
     - a loopback stub endpoint succeeds;
     - `http://169.254.169.254/...` and `http://metadata.google.internal/...` are refused with stage `url_safety` and no request sent;
     - a userinfo or ambiguous-authority endpoint is refused.

     Update any existing test that asserted a private endpoint is blocked. That contract changes on purpose.
6. Run `scripts/run_tests.sh tests/plugins/bkt_dia`, `python scripts/boundary_lint.py --check` and `python scripts/check`.

## Verification

- `scripts/run_tests.sh tests/plugins/bkt_dia` passes. That includes the existing 288 tests and the new ones.
- Boundary lint is unchanged at 843/20. No new `scripts/check` findings. New functions have CC ≤ 20.
- `hermes plugins validate` still passes for all `bkt-dia-*` modules. Use the scratchpad runner if `httpx` is missing from the bare interpreter.

## Risks / rollback

- Loading `MODULE` by path could double-import `tool_factory` under a different name. Import it as `plugins.bkt_dia_common.tool_factory` (an absolute import already used by modules), so that only the module file itself loads privately.
- Rollback: delete `dashboard/`, `module_catalog.py`, `run_log.py`, and revert the three modified files.
