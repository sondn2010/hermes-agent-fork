---
phase: 01
title: Shared foundation + pilot plugin (F015)
wave: A
status: done
depends_on: []
---

# Phase 01: Shared foundation + pilot plugin
<!-- Updated: Validation Session 1 - Confirmed single service identity, 15s SLA, fail-closed error handling -->

## Context
- Read: root `AGENTS.md`, `plugins/AGENTS.md`, `tools/AGENTS.md`, `tests/AGENTS.md`, `website/docs/developer-guide/plugins/index.md` (tools, skills, settings, doctor/validate).
- Plugin context API: `hermes_cli/plugins_context.py` (`register_tool` at line ~270, `get_config` at line ~73), `hermes_cli/plugins_content.py::register_skill`.
- Published imports allowed in plugins: `hermes_cli/data/plugin_api.json` (includes `hermes_cli.config`, `tools.registry`, `plugins.plugin_utils`).
- Boundary rule: `scripts/boundary_lint.py::module_to_core`. An import of another in-tree module (`plugins.bkt_dia_common.*`) is not a crossing.
- Spec: `DIAAI_SPECS/03-Function-Specs/f015-*.md`.

## Files owned
- `plugins/bkt_dia_common/` with `plugin.yaml`, `__init__.py`, `settings.py`, `query_client.py`, `tool_factory.py`, `categories.py`
- `plugins/bkt-dia-enterprise-profile/` with `plugin.yaml`, `__init__.py`, `skills/bkt-dia-enterprise-profile/SKILL.md`
- `tests/plugins/bkt_dia/__init__.py`, `tests/plugins/bkt_dia/conftest.py` (stub HTTP server fixture), `tests/plugins/bkt_dia/test_common_query_client.py`, `tests/plugins/bkt_dia/test_common_tool_factory.py`, `tests/plugins/bkt_dia/test_enterprise_profile.py`

## Requirements
1. `bkt-dia-common` manifest: `name: bkt-dia-common`, `tags: [bkt, category:shared]`, `provides_tools: []`, a description stating that every bkt-dia module needs it, and `config_keys`/settings documented. It registers no model tools. Its `register(ctx)` is a no-op apart from validating settings.
2. `settings.py` reads `plugins.entries.bkt-dia-common.settings` through `hermes_cli.config` **at call time**, with these keys: `endpoint` (base URL, required), `timeout_seconds` (default 15, max 60 to prevent turn loop freezes) and `max_sources` (default 20). The API key comes from `.env` as `BKT_DIA_QUERY_API_KEY`, resolved per-profile via `hermes_cli.env_loader.resolve_home_dotenv(get_hermes_home())` (never bare `os.environ.get()` which leaks across profiles). Validate `endpoint` with `tools.url_safety` against SSRF/cloud-metadata IPs unless `security.allow_private_urls` is enabled.
3. `query_client.py`: `query(question: str) -> dict` POSTs to `{endpoint}/api/v1/query` with `{"question": ...}` (normalizing base URL so it reliably reaches `/api/v1/query`, matching FastAPI's `API_V1_PREFIX`). First checks that `bkt-dia-common` is active in `plugins.enabled`; if disabled, returns `{"ok": False, "error": "bkt-dia-common plugin is disabled", "hint": "enable bkt-dia-common in config or dashboard"}`. Uses the HTTP library the repo already depends on (`httpx`/`requests`). Truncates `sources` to `max_sources` and maps 504, timeouts (15s SLA), connection errors, non-2xx responses and invalid JSON to `{"ok": False, "error", "hint"}`. With no endpoint it returns `{"ok": False, "error": "bkt-dia endpoint not configured", "hint": "set plugins.entries.bkt-dia-common.settings.endpoint"}` and makes no network call.
4. `tool_factory.py`: `register_query_tools(ctx, module: dict)` validates the module spec (`function_code`, `toolset`, `tools[]` with name/description/parameters JSON schema/question_template). Each plugin's `plugin.yaml` MUST explicitly list all tool names in `provides_tools: [...]` to pass `hermes plugins validate` and ensure toolsets unregister cleanly when disabled. Renders question templates using safe parameter substitution (handling missing optional args and unescaped curly braces without `KeyError`/`ValueError`). For each tool it registers a handler calling `query()` and returning a JSON string carrying `function_code`. Tools per plugin are strictly capped at **1-2 tools** to control prompt surface token cost. Use `check_fn` only for reachability or opt-in, never per session. Tool names follow `bkt_dia_<slug>_<verb>` (snake_case, globally unique).
5. `categories.py`: the slug→label map (vi/en) for the 7 category slugs in `plan.md`. This is the Python source of truth that phase 09 checks against.
6. Pilot F015 `bkt-dia-enterprise-profile` (tag `category:domain-lookup`, `provides_tools: [bkt_dia_enterprise_profile_lookup, bkt_dia_enterprise_profile_history]`). Read spec UCs (UC097, UC107) and define 1-2 focused tools (look up profile by name/tax code; profile history/similar). Its SKILL.md tells the agent when to use each tool, to cite `sources`, and to say plainly when data is missing.
7. **Freeze the module-spec contract**: write a short "How to add a bkt-dia module" docstring at the top of `tool_factory.py`. Phases 03–08 copy the pilot as a template, enforcing `provides_tools` declaration, 1-2 tool cap, and safe templating.

## Steps
1. Spike: confirm that an in-tree plugin can `import plugins.bkt_dia_common.tool_factory` when loaded by `hermes_cli/plugins_loader.py` (bundled discovery). If the import fails, stop and report `NEEDS_CONTEXT` with the error.
2. Confirm how a plugin toolset becomes visible to the agent once the plugin is enabled (`toolsets.py`, plugin toolset resolution). Record the finding in the `tool_factory.py` docstring.
3. Implement common, then the pilot, then the tests.
4. Tests (behaviour contracts, real imports, temp `HERMES_HOME`):
   - client: success, an unset endpoint (no request made), 5xx, timeout (15s SLA), SSRF refusal on cloud metadata/private IP, disabled `bkt-dia-common` refusal, invalid JSON, source truncation, bearer header sent only when the key is set; use a local `http.server` stub from conftest with `/api/v1/query` and `/api/v1/query/test`;
   - factory: an invalid spec raises at register; template rendering with optional args and braces; the registered tool returns `function_code`; max 2 tools enforced;
   - E2E: enable `bkt-dia-common` and `bkt-dia-enterprise-profile` in a temp home and load plugins; the tools are registered; with the pilot disabled they are not; toolset unregisters on disable;
5. Run `hermes plugins validate plugins/bkt_dia_common` and `plugins/bkt-dia-enterprise-profile` (confirm 0 undeclared tools), plus `hermes plugins doctor`.

## Validation
- `scripts/run_tests.sh tests/plugins/bkt_dia/`
- `python scripts/boundary_lint.py --check`
- `python scripts/check`

## Done means
- The template plugin works end to end against the stub, and the contract docstring is written. Wave B can start.

## Risks / rollback
- Importing the shared module may fail under the loader's module naming. The fallback is a `python_dependencies`-free relative path import inside the common module's package. Raise it with the controller before choosing, because it changes the template for 19 plugins.
- Rollback: delete the two plugin dirs and the tests. No core files are touched.
