# Phase 01 report: shared foundation and pilot plugin (F015)

Status: DONE. Plan: `plans/261112-1101-bkt-modules-page-and-diaai-plugins/`. No core files touched, nothing committed.

## Template structure (copy this for every bkt-dia module)

```
plugins/bkt_dia_common/            # manifest name bkt-dia-common, tag category:shared, provides_tools: []
  plugin.yaml                      # config_schema: endpoint (required), timeout_seconds (15, max 60), max_sources (20, max 100)
  __init__.py                      # register(): warns on a missing or invalid endpoint, registers nothing
  settings.py                      # call-time config + API key, query_url() normalization, is_common_enabled()
  query_client.py                  # query(question) -> {"ok": True, ...} | {"ok": False, "error", "hint"}
  tool_factory.py                  # "How to add a bkt-dia module" contract docstring + register_query_tools / register_module_skills
  categories.py                    # CATEGORIES: the 7 slugs with vi/en labels, category_tag(), category_label()
plugins/bkt-dia-enterprise-profile/ # pilot, tag category:domain-lookup, requires_plugins: bkt-dia-common
  plugin.yaml                      # provides_tools: [bkt_dia_enterprise_profile_lookup, bkt_dia_enterprise_profile_history]
  __init__.py                      # MODULE = {...}; register(ctx): register_query_tools + register_module_skills
  skills/bkt-dia-enterprise-profile/SKILL.md
tests/plugins/bkt_dia/
  conftest.py                      # dia_stub (127.0.0.1 http.server: POST /api/v1/query, GET /api/v1/query/test), hermes_home, write_profile
  test_common_query_client.py  test_common_tool_factory.py  test_enterprise_profile.py
```

## tool_factory contract (summary; the docstring is authoritative)

- `MODULE = {"function_code": "F0NN", "toolset": "bkt-dia-<slug>", "emoji"?: str, "tools": [...]}`, where each tool is `{"name", "description", "parameters" (JSON-schema object), "question_template"}`.
- `register_query_tools(ctx, MODULE)` raises `ModuleSpecError` (so the plugin fails to load) on any of these: more than 2 tools or none, a bad `function_code`, a bad `toolset`, a tool name that does not match `bkt_dia_<slug>_<verb>`, a `required` entry that is not a declared property, or a template placeholder that is not a declared property.
- Template syntax: `{param}` inserts a value. `[[ ... {param} ... ]]` is an optional segment that is dropped when the param is None, False, blank or an empty list. Rendering is a single regex pass, so any other braces stay literal, braces inside a value are never expanded again, and it never raises. Values are flattened to one line and capped at 500 characters.
- The handler returns a JSON string: `{"ok": true, "answer", "type", "sources"[, "sources_omitted"], "function_code"}` on success, or `{"ok": false, "error", "hint", "function_code"}` on failure. A missing required argument fails closed without a request.
- `query()` runs its checks in this order: the question is non-empty and at most 4000 characters, then `bkt-dia-common` is in `plugins.enabled` and not in `disabled`, then the endpoint is set, then the URL is http(s), then `tools.url_safety.is_safe_url` passes. Only then does it POST with `follow_redirects=False`. Timeouts, transport errors, 504, 401/403, other 5xx, other non-2xx, invalid JSON and a wrong response shape each map to a specific error and hint.
- `toolset == manifest name` and `provides_tools == tool names` are **not** checked at load. The capability probe in `hermes plugins validate` hands plugins a ctx with no `manifest` attribute, and `ctx.manifest` is not a documented surface. `hermes plugins validate` enforces the tool list ("declared tools"), and `validate_module_spec(MODULE, provides_tools=...)` is there for the phase 09 contract test.

## How a toolset becomes visible after enable

Bundled plugins are opt-in. `gate_manifest` loads one only when its manifest name is in `plugins.enabled`. `register()` then puts the tools in `tools.registry` with `toolset = MODULE["toolset"]`. `hermes_cli.tools_config._enabled_plugin_toolsets` switches a plugin toolset on for every platform by default, unless that platform already lists it in `known_plugin_toolsets` and the user left it unchecked in `hermes tools`. The tool list is frozen per session for prompt caching, so an enable or disable takes effect in the next session. Disabling unloads the plugin and its tools on the next forced discovery. `test_enabled_toolset_is_on_for_a_new_cli_session` checks this through `_get_platform_tools(load_config(), "cli")`.

## Verification (exact outputs)

`scripts/run_tests.sh tests/plugins/bkt_dia/`
```
✓ tests\plugins\bkt_dia\test_common_tool_factory.py (23✓)
✓ tests\plugins\bkt_dia\test_enterprise_profile.py (7✓)
✓ tests\plugins\bkt_dia\test_common_query_client.py (28✓)
=== Summary: 3 files, 58 tests passed, 0 failed (100% complete) in 21.2s (20 workers) ===
```
`hermes plugins validate plugins/bkt_dia_common` and `plugins/bkt-dia-enterprise-profile`. Both runs used a scratch `HERMES_HOME`, launched through `scripts/run-in-hermes-env python <runner> ... plugins validate <dir>`, and both printed:
```
✓ capability probe — register() ran in isolation
✓ declared tools — matches registrations
Validation passed.      (rc=0, 0 undeclared tools)
```
Both runs also printed this warning: `⚠ private core imports (catalog rule 9) ... plugins.bkt_dia_common.*`. It is informational. Rule 9 applies to catalog plugins, and `scripts/boundary_lint.py` does not count module-to-module imports as crossings.

`hermes plugins doctor <dir> --ci`: "OK: runtime discovery, manifest parsing, import, and registration passed" (common: 0 tools; pilot: 2 tools), rc=0.

`python scripts/boundary_lint.py --check`: rc=0 (`module_to_core: 843`, `core_to_module: 20`, no rise).

`python scripts/check`: 16 checks, and only `health` fails, on `apps/desktop/src/i18n/vi.ts:1 FILE_LINES 3370 > 2000`. That file existed before this work and is not mine. Ruff (the RUF100 fix in conftest) and the Windows footgun check (`utf-8-sig` in tool_factory) are clean.

## Deviations from the phase file

- **API key resolution.** The plan says to use `hermes_cli.env_loader.resolve_home_dotenv(get_hermes_home())`, but `hermes_cli.env_loader` is not in `plugin_api.json`, so boundary lint and validate would flag it. I used the published `hermes_cli.config.get_env_value_prefer_dotenv("BKT_DIA_QUERY_API_KEY")` instead. It reads `<get_hermes_home()>/.env` first, then the profile-scoped secret (`agent.secret_scope.get_secret`), and never reads bare `os.environ` under multiplexing.
- **HTTP client.** It is sync `httpx.post`, checked first with `is_safe_url` and run with redirects disabled. The connect-time DNS-rebinding guard (`create_ssrf_safe_client`) is not published for sync use, and only the async variant is listed.

## Pitfalls for clone authors

1. Plugin dirs use hyphens and stay unimportable as `plugins.<dir>`, which is fine because the loader imports them as `hermes_plugins.<slug>`. Always import shared code as `from plugins.bkt_dia_common.tool_factory import ...`.
2. List every tool in `provides_tools`, or `hermes plugins validate` fails ("declared tools").
3. Do not read `ctx.manifest` or any non-`ctx.register_*` attribute in `register()`, because the validate probe ctx lacks them and the probe fails.
4. Keep 1-2 tools, and put optional wording in `[[ ]]` segments. Never use `str.format`.
5. The SKILL.md `description` must be at most 60 characters, one sentence, ending with a period. Prose names tools in backticks.
6. Tests: create the `manager` fixture after `hermes_home` (a `PluginManager` captures the home when it is constructed). Use `write_profile(...)`, which enables `security.allow_private_urls` because the stub is on loopback. Do not `time.sleep`; use `dia_stub.hang = True` with a small `timeout_seconds` for timeouts.
7. Deployment: an ES service on a private network needs `security.allow_private_urls: true`. Cloud metadata addresses are always refused.
8. Running `hermes` with a different `HERMES_HOME` on this dev install: run-in-hermes-env picks site-packages from `HERMES_HOME`. Set `HERMES_HOME` inside the Python process (as the runner script did), not in the shell, or imports fail with errors such as `No module named 'ruamel'`.

## Unresolved questions

- Should the controller accept the published `get_env_value_prefer_dotenv` in place of `resolve_home_dotenv`, or publish `hermes_cli.env_loader:resolve_home_dotenv` in a separate core PR?
