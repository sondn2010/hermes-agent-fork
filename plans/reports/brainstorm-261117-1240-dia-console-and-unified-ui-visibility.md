# Brainstorm: DIA AI Console page + one place to show/hide all BKT and DIA UIs

Date: 2026-11-17. Branch: `feature/bktech`. Builds on plan `261112-1101-bkt-modules-page-and-diaai-plugins` (done, committed).

## Decisions taken (user, 2026-11-17)

1. **Data source:** use what exists now. That is the DIA query service (`POST /api/v1/query`, `GET /api/v1/query/test`) plus Hermes-side state. The DIA team is not asked for new endpoints.
2. **DIA UI shape:** a core web page in `web/src`, like `BktModulesPage`. An additive `bkt/packages` dashboard plugin was offered and declined.
3. **Show/hide view:** extend the existing BKT Modules page (`/bkt-modules`).

## Evidence

- The 8 existing BKT tabs (`bkt-author`, `bkt-brand`, `bkt-chat`, `bkt-files`, `bkt-health`, `bkt-kanban-workflow`, `bkt-profiles`, `bkt-prompts`) are dashboard-only plugins. They have no `plugin.yaml` and are built from `bkt/packages/*`. The plugins hub returns them under `orphan_dashboard_plugins`, so the BKT Modules page does not list them today. It reads only `plugins` rows.
- Hiding a UI already works. `POST /api/dashboard/plugins/{name}/visibility` (`hermes_cli/web_routers/dashboard_ui.py:363`) persists to `dashboard.hidden_plugins`. The endpoint accepts any valid plugin name, and the hub reports it per row as `user_hidden`. No new config key is needed.
- The DIA query service exposes only:
  - question → `{answer, question, type, sources}`;
  - a health check → `{status, total_documents}`.
- It has nothing for pipeline steps, document lists, stored forecasts or monitoring runs. Its source is not in `ironman-diaai-system` (that repo has only MCP and open-webui services).
- Backend routes without a core→plugin import: a dashboard manifest with an `api` field mounts `plugin_api.py` at `/api/plugins/<name>/*`, scoped per request by `?profile=` (`_plugin_route_secret_scope`). `bkt-files`, `bkt-prompts` and `bkt-kanban-workflow` already do this.
- Cron jobs and their run outputs already have core REST (`hermes_cli/web_routers/cron.py`).

## Contract

### Outcome

1. **DIA AI Console** is a new core web page at `/dia`. It has these parts:
   - **Status overview:**
     - Endpoint configured: yes/no. The URL itself is never shown, because it may carry userinfo.
     - Health from `/test`: status, document count and latency, with the same error and hint wording the tools use.
     - A per-module grid of category, enabled state, UI visibility and last run.
   - **Category views** follow the 7 categories in `categories.py`: shared, knowledge & RAG, assistants & channels, domain lookup, analysis & forecast, decision support, monitoring & personalization.
     - Each module is a panel with one **form per tool**, generated from its `MODULE` spec: the template fields, required or optional, and labels.
     - **Run** shows a step timeline: validate → build question → query DIA → result, or error with hint.
     - Then it shows the answer as markdown, the type, and the sources (title, snippet, score where present).
   - **Recent runs:** the latest `bkt_dia_*` tool calls for the active profile, with time, module, ok/error and a link to the session.
   - **Monitoring:** cron jobs that use bkt-dia skills or tools (for example risk-monitor), with schedule, last run status and last output.
2. **BKT Modules page** becomes the single show/hide place:
   - Each row has two independent switches: **Enabled** (agent tools; agent plugins only, existing behaviour) and **Show UI** (`dashboard.hidden_plugins`).
   - The 8 dashboard-only bkt tabs are listed with Show UI only.
   - A DIA module's Show UI hides its panel in the console.
   - A row for the console itself (keyed `bkt-dia-common`) hides the `/dia` nav entry.

### Constraints

- No core→plugin import. The page talks to `/api/plugins/bkt-dia-common/*` over HTTP.
  - `plugins/bkt_dia_common/dashboard/manifest.json` gets `tab.hidden: true` and `api: plugin_api.py`. The routes are: module specs, health, and run.
  - The run route reuses the tool path, `query_client.query` with the same template rendering. It gets URL safety, fail-closed checks and the profile scope for free.
  - `scripts/boundary_lint.py` stays at 843/20.
- Every route needs `_require_token`. Profile comes from `?profile=`. Config and env are read at call time. The API key and the endpoint value never reach the browser.
- A run is refused when the module is disabled. This is the same gate as the agent tool, so the UI cannot reach DIA through a module the admin turned off.
- No new tools, so the prompt surface is unchanged. No new `HERMES_*` env var. The design reuses `dashboard.hidden_plugins`. If a new config key turns out to be needed, it ships with docs (`tests/ci/test_docs_drift.py`).
- Size caps: files ≤ 2000 lines, new functions CC ≤ 20. Web follows local patterns (hooks, `@nous-research/ui`, i18n en + vi blocks, optional `diaConsolePage?`).
- Tests use `scripts/run_tests.sh` and a temp `HERMES_HOME`, with the existing stub HTTP server in `tests/plugins/bkt_dia/conftest.py`. They are behaviour contracts.

### Non-goals

- DIA-side process steps, document or index listings, stored forecasts or monitoring records. There are no endpoints for them.
- "Steps" means the Hermes-side run steps of each request, not the DIA ingestion pipeline.
- Writing to DIA, or editing module specs or templates from the UI.
- Charts for forecasts. Answers are text and markdown.
- The private-endpoint URL-safety decision (finding M1), the Zalo adapter, and the business-analyst questions from the previous plan.
- Rebuilding the BKT Modules page as an additive plugin.

### Acceptance criteria

1. `/dia` shows all 20 modules grouped by the 7 categories.
   - A disabled module shows as disabled with a link to BKT Modules.
   - A UI-hidden module does not render.
2. The health card shows status and document count for a working stub. It shows the matching error and hint when the endpoint is:
   - unset;
   - invalid;
   - blocked by URL safety;
   - unreachable;
   - returning the wrong shape.
3. Every module form renders from its spec and blocks submit when a required field is empty. Run shows the step timeline, answer and sources. A disabled module's run is refused server-side, with a test proving it.
4. Recent runs and monitoring lists show data for the active profile only. Tests run with two profiles.
5. BKT Modules lists:
   - all `bkt-*` agent plugins;
   - the 8 dashboard-only tabs;
   - the console row.

   Show UI persists to `dashboard.hidden_plugins`. After a refresh, it hides the sidebar tab, the console panel or the `/dia` nav entry.
6. Gates:
   - bkt and web tests green;
   - web typecheck and lint clean;
   - boundary lint unchanged;
   - `scripts/check` has no new findings beyond the existing `apps/desktop/src/i18n/vi.ts` cap;
   - user and admin docs updated (`docs/bkt-dia-modules-user-guide.md`, `website/docs/user-guide/features/bkt-modules.md`).

### Trade-offs

- **Core web page (chosen) vs. additive DIA Console plugin.**
  - The core page depends on the fork tolerating more core web edits (`App.tsx`, `lib/api.ts`, i18n). There is precedent: `BktModulesPage`.
  - It fails first on upstream merges, where those files conflict.
  - The plugin route would have kept the `bkt/` additive rule. It would have failed first on build friction: a separate npm workspace, and no shared vitest setup with `web/`.
- **Existing data (chosen) vs. new DIA endpoints.**
  - Existing data depends on query answers being good enough for knowledge, forecast and monitoring views.
  - It fails first when users expect structured data such as document tables, time-series charts or real pipeline progress. That would need DIA endpoints and a second phase.

### Better approaches

None. The chosen directions follow the evidence. The additive plugin variant was offered and declined.

## Handoff

Next: `/ak-plan` with this report as the source contract. Then `/ak-cook`.

## Unresolved questions

1. Where recent runs come from. Tool-call history lives in the session DB. Reading it from `plugin_api.py` needs a private core import, which triggers the validate warning. The alternative is an existing core sessions REST call filtered in the browser. Decide in planning after checking the sessions/messages API.
2. Should a module panel also show the business process steps from its DIA function spec (`fNNN-*.md`) as static text? This is a cheap way to give "current steps" business meaning.
3. M1 is still open. Until it is decided, a private DIA endpoint needs the global `security.allow_private_urls` setting, and that applies to dashboard runs too.
