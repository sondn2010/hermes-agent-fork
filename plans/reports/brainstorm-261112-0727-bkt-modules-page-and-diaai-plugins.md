# Brainstorm: bkt-* module settings page + DIA AI Hermes plugins

Date: 2026-11-12 · Branch: feature/bktech · Status: accepted (user answered 4 decisions)

## Evidence (scouted)

- No `bkt-*` Hermes plugins exist anywhere (repo, `%LOCALAPPDATA%/hermes/plugins`, `~/.hermes`, ironman-all). Only `bkt-hermes-api-bridge` (separate REST/SSE bridge, not a plugin). The DIA modules will be the first `bkt-*` plugins.
- Web dashboard already has `web/src/pages/PluginsPage.tsx` (1394 lines, enable switch, catalog search, no category grouping) backed by `hermes_cli/web_routers/dashboard_ui.py` (`/plugins/hub`, enable/disable). Desktop has `apps/desktop/src/app/capabilities/plugins/plugins-tab.tsx`.
- Plugin manifest (`hermes_cli/plugins_manifest.py`) already accepts `tags: [..]` → category can be `category:<slug>` tag; no core manifest change needed.
- DIA spec: `ironman-diaai-system/docs/DIAAI_SPECS` — 27 functions; HERMES-tagged: F002, F005, F006, F007, F010, F011, F012, F015–F027 (20). Spec states Core API/MCP contracts are proposals, not existing endpoints.
- Only live data service: `ironman-mcp-api/cncns-mcp-chatbot-esquery` — FastAPI `POST /query` (natural-language → Elasticsearch, multi-entity), LLM-backed.

## User decisions

1. Page host: Hermes web dashboard (new page beside Plugins).
2. Show/hide = enable/disable plugin (tools/skills not offered to agent; effective next session — prompt-cache invariant).
3. Scope: all 20 HERMES-tagged functions.
4. Data backend: existing ES query service; endpoint in `config.yaml`, key in `.env`.

## Contract

**Outcome**
- Dashboard page "BKT Modules": lists every installed plugin whose name starts `bkt-`, grouped by category (collapsible), with filter by text, category, and status (enabled/disabled); per-module and per-category toggle; banner "changes apply to new sessions".
- 20 `bkt-dia-*` plugins (one per HERMES function), each registering its tools/skill against a shared ES query client, tagged with category.
- End-user doc (Vietnamese + English short) describing the page and each module.

**Proposed categories** (from spec source groups)
| Category | Modules |
|---|---|
| Knowledge & RAG | F002 doc/multimodal intake, F005 knowledge governance, F006 RAG retrieval, F007 knowledge analysis |
| Assistant & channels | F010 admin Q&A/LLM config, F011 voice/Zalo/embed channels, F012 conversational assistant |
| Domain lookup | F015 enterprise, F016 finance/tax/GDP, F017 import-export, F018 products/market, F019 workforce, F020 tech zones/projects/bids |
| Analysis & forecast | F021 enterprise finance forecast, F022 workforce/trade/GDP/bid forecast |
| Decision support | F023 policy advice, F024 strategy advice, F025 partner matchmaking |
| Monitoring & personalization | F026 risk monitoring/alerts, F027 behaviour personalization |

**Constraints**
- Plugins never touch core; use only `ctx`/published plugin API. Shared ES client lives in one shared module (e.g. `plugins/bkt-dia-common` lib or a `bkt_dia_common` package) — no duplication across 20 plugins.
- No new `HERMES_*` env vars; endpoint/timeouts in `config.yaml`, API key in `.env`.
- Toggle reuses existing enable/disable API; no mid-session toolset swap.
- Read-only tools only (spec: write tools need policy/confirm/audit, not available). Fail closed with clear error when ES service unreachable/unconfigured. No fake data.
- Core budget: new functions CC ≤ 20, files ≤ 2,000 lines; new page in its own file(s), not grown inside `PluginsPage.tsx`.
- Config keys + page ship with docs (`tests/ci/test_docs_drift.py`). Tests via `scripts/run_tests.sh`.
- Prompt-surface: bkt plugins are opt-in (disabled by default) so stock `tools[]` snapshot unchanged.

**Non-goals**
- Desktop native tab (desktop embeds dashboard).
- Building Core API, write/update MCP tools, ML forecasting models, Zalo/voice channel servers, fine-tuning/behaviour-learning automation (spec §7.5 says not default). Modules whose spec needs those expose the ES-backed read/analysis part and document the gap.
- Per-profile toggling beyond what the existing enable API already scopes.
- Upstream PR / plugin-catalog admission.

**Acceptance criteria**
- Page lists all `bkt-*` plugins, grouped by category; text/category/status filters work; toggling persists to config and survives reload; non-bkt plugins absent.
- Each of 20 plugins: valid manifest (`hermes plugins validate`), category tag, ≥1 tool or skill, behaviour test against a stub HTTP server (real client code), fail-closed test when unconfigured.
- Enabled plugin's tools appear in a new session; disabled ones don't.
- `python scripts/check` and relevant `scripts/run_tests.sh` suites pass; web build + tests pass.
- End-user doc in `docs/` (or `website/docs/user-guide/`) covering page usage, module list per category, config of ES endpoint.

## Trade-offs

- **One plugin per function (20) vs one plugin per category (6):** user asked show/hide per module and spec is per function → 20. Assumption: per-function granularity is wanted; fails first as maintenance noise if many modules are thin wrappers over the same `/query`. Mitigation: shared client + table-driven tool definitions so each plugin is mostly manifest + prompt/skill text.
- **ES `/query` backend:** real data today; assumption: NL query covers each domain's entities. Fails first for forecasting/matchmaking (F021, F022, F025) and governance (F005) which need computation or write paths — those modules ship retrieval + LLM-side analysis only, documented as partial.

## Better approaches
none — recommended direction is the requested one (existing PluginsPage/enable API and manifest `tags` cover the mechanics; only grouping UI and plugins are new).

## Parallel work shape (for planner)
- Wave 0 (serial, small): shared ES client + plugin template + category taxonomy + config keys.
- Wave 1 (parallel): A) dashboard page + backend filter endpoint if needed; B–G) one agent per category building its plugins (disjoint `plugins/bkt-dia-*` dirs).
- Wave 2: integration tests, docs (end-user + config), review.

## Unresolved questions
- Where shared code lives so all bkt plugins import it without a core crossing (sibling package inside a plugin dir vs. pip-installed lib) — planner to verify against plugin loader import rules.
- ES `/query` auth model and per-user data permissions (spec §7.2 unresolved) — modules run with a single service key for now.
- Language of end-user doc: Vietnamese primary assumed.
