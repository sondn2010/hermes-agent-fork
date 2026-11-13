# Upstream seams

Every Hermes internal that BKT code depends on, so an upstream sync can recheck them. The
Python symbols in the tables are imported by `tests/plugins/bkt_common/test_upstream_seams.py`,
so a rename fails loudly. Each plugin phase appends its own section; keep one row per symbol.

Format: `module` | `symbol` | used by | how the profile reaches it.

## Foundation (phase 1)

| Module | Symbol | Used by | Profile |
|---|---|---|---|
| `apps/shared/src` (TypeScript, read-only alias `@hermes/shared/*`) | `json-rpc-channel`, `reconnect-backoff`, `gateway-events`, `gateway-contract.openrpc.json` | bkt-chat bundle and contract test | per-RPC `profile` param |
| `window.__HERMES_PLUGIN_SDK__` (`web/src/plugins/registry.ts`) | `React`, `components`, `fetchJSON`, `authedFetch`, `buildWsUrl`, `api.getSessions`, `api.getStatus` | every bundle | explicit `?profile=` per call (`bkt/shared/api.ts` `PROFILE_TRANSPORT`) |
| `window.__HERMES_PLUGINS__` | `register`, `registerSlot(plugin, slot, component)` | every bundle | the host drops calls from a bundle of another management profile |
| Plugin asset route (`hermes_cli/web_routers/dashboard_ui.py`) | `/dashboard-plugins/@<profile>/<name>/<file>` | `selfAssetUrl`, `pluginAssetUrl`, mermaid vendor | path segment |
| Dashboard plugin discovery (`hermes_cli/web_server_dashboard.py`) | `_discover_dashboard_plugins`, manifest `api` field, bundled plugins need no `plugins.enabled` | all plugins | launch profile; `?profile=` binds `_plugin_route_secret_scope` per request |
| Theme loader (`hermes_cli/web_server_dashboard.py`) | `_discover_user_themes` reads `<launch home>/dashboard-themes/*.yaml` | `bkt/theme/bkt.yaml` via `bkt/install.mjs` | launch home |
| `hermes config path` (`hermes_cli/subcommands/config.py`) | prints the active `config.yaml` | `bkt/install.mjs` | `HERMES_HOME` / active profile |

### Core REST endpoints and where they read the profile

Kept in code as `PROFILE_TRANSPORT` in `bkt/shared/api.ts`; every call also sends `?profile=`
so the host's automatic management-profile suffix never names a different profile.

| Endpoint | Transport | Source |
|---|---|---|
| `GET /api/status` | query | `hermes_cli/web_routers/status.py` `get_status` |
| `GET/PUT/DELETE /api/env`, `POST /api/env/reveal` | query; reveal also `body.profile` | `hermes_cli/web_routers/config_env.py` |
| `GET /api/pairing`, `POST /api/pairing/clear-pending` | query | `hermes_cli/web_routers/ops.py` |
| `POST /api/pairing/approve`, `POST /api/pairing/revoke` | `body.profile` | `hermes_cli/web_routers/ops.py`, `hermes_cli/web_models.py` `PairingApprove`/`PairingRevoke` |
| `/api/messaging/platforms[/{id}[/test]]`, telegram and whatsapp onboarding | query | `hermes_cli/web_routers/messaging.py` |
| `GET /api/sessions` | query | `hermes_cli/web_routers/sessions.py` |
| `POST /api/chat/image-upload` | query | `hermes_cli/web_routers/files.py` |
| `/api/files*` | not profile-scoped (managed files policy) | `hermes_cli/web_routers/files.py` |
| `/api/profiles*` | profile is the path parameter | `hermes_cli/web_routers/profiles.py` |

## bkt-prompts and bkt-health (phase 7)

| Module | Symbol | Used by | Profile |
|---|---|---|---|
| `plugins.plugin_storage` | `plugin_db` | bkt-prompts `plugin_api.py` (connection opened per request) | `get_hermes_home()` per call, bound by the plugin route scope from `?profile=` |
| `hermes_cli.web_server` | `_require_token` | bkt-prompts `plugin_api.py` | n/a |
| `hermes_cli.web_server_dashboard` | `_plugin_route_secret_scope`, `_discover_dashboard_plugins`, `_plugin_api_mount_skip_reason` | route scope; phase 8 discovery test | binds `?profile=` |

bkt-health reads only core REST: `GET /api/profiles` (`gateway_running`), `GET /api/status`,
`GET /api/messaging/platforms?profile=` (`platforms[].{id,enabled,configured,state,error_message}`)
and `POST /api/messaging/platforms/{id}/test?profile=`.

## bkt-kanban-workflow (phase 6)

| Module | Symbol | Used by | Profile |
|---|---|---|---|
| `hermes_cli.kanban_db_connect` | `connect_closing` | `plugins/bkt-kanban-workflow/dashboard/plugin_api.py` `read_flow` | kanban root is shared across profiles by design (`kanban_home()`); `?profile=` bound by the route scope |
| `hermes_cli.kanban_db` | `_normalize_board_slug`, `board_exists`, `read_board_metadata`, `kanban_db_path`, `DEFAULT_BOARD` | `plugin_api.py` board validation, `read_flow` | same |
| kanban SQLite schema (`hermes_cli/kanban_db.py` `SCHEMA_SQL`) | `tasks(id, assignee, status, created_at, completed_at)`, `task_links(parent_id, child_id)`, `task_events(task_id, kind, payload, created_at)`; event kind `assigned` with payload `{"assignee", "from"}`; statuses `running`, `done`, `archived` | `plugin_api.py` SQL constants | same |
| Kanban plugin REST (`plugins/kanban/dashboard/plugin_api.py`) | `GET /api/plugins/kanban/boards`, `/workers/active`, `/board` | `bkt/packages/kanban-workflow/src/edges.ts`, `index.tsx` | explicit `?profile=` per call |
| Dashboard SPA route | `/kanban` tab path; the router follows `popstate` | `index.tsx` | n/a |

## bkt-chat (phase 5)

| Module | Symbol | Used by | Profile |
|---|---|---|---|
| `apps/shared/src/json-rpc-channel.ts` | `JsonRpcRequestChannel`, `wireFrameText`, `JSON_RPC_METHOD_NOT_FOUND`, types `ServerRequest`, `JsonRpcTransport`, `ServerRequestHandler` | `bkt/packages/chat/src/connection.ts`, `useGatewaySession.ts` | n/a (socket is host-scoped) |
| `apps/shared/src/reconnect-backoff.ts` | `reconnectBackoffDelayMs`, `isStableOpen`, type `ReconnectBackoffOptions` | `connection.ts` | n/a |
| `apps/shared/src/gateway-events.ts` (+ `gateway-contract.generated.ts`) | types `RpcMethods`, `ServerRequestMap`, `GatewayEventName`, `GatewayEventMap`, `GatewayEvent`, `ClarifyQuestion`, `PendingApproval`, `TranscriptMessage`; `BACKEND_EVENT_NAMES` (test only) | `protocol.ts`, `reducer.ts`, `contract.test.ts` | n/a |
| `apps/shared/src/gateway-contract.openrpc.json` | `methods`, `x-server-requests`, `x-notifications`, `components.schemas` | `contract.test.ts` | n/a |
| `/api/ws` RPC methods | `session.create`, `session.resume`, `prompt.submit`, `session.interrupt`, `approval.pending`, `approval.received`, `approval.respond`, `image.attach`, `file.attach`, `slash.exec`, `model.options`; channel-internal `client.capabilities`, `gateway.ping` | `useGatewaySession.ts`, `JsonRpcRequestChannel` | per-RPC `profile` param |
| `/api/ws` server requests | `approval`, `clarify` answered; anything else declined with JSON-RPC `-32601` | `useGatewaySession.ts` | the request's `session_id` |
| `/api/ws` events | `message.start/delta/complete`, `tool.generating/start/progress/complete`, `thinking.delta`, `status.update`, `notice`, `error`, `request.cancel`, `approval.cancelled`, `session.info`, `session.title`, `sessions.changed` | `reducer.ts` | event `session_id` |
| SDK (`web/src/plugins/registry.ts`) | `buildWsUrl('/api/ws')` (fresh ticket per dial), `api.getSessions(limit, offset, profile, order)`, `utils.timeAgo` | `connection.ts`, `SessionRail.tsx` | explicit `profile` argument |
| `POST /api/chat/image-upload` | `{data_url, filename}` returns `{path}` | `useGatewaySession.ts` | query |

## bkt-profiles (phase 3)

| Module | Symbol | Used by | Profile |
|---|---|---|---|
| `hermes_cli.web_server` | `_require_token` | every route of bkt-profiles, bkt-prompts and bkt-files `plugin_api.py` | n/a (auth) |
| `hermes_cli.credential_lifecycle` | `save_provider_env_credential`, `remove_provider_env_credential` | `plugin_api.py` generate and delete | the route scope binds the `?profile=` home and secret scope |
| `hermes_cli.auth` | `has_usable_secret` | `plugin_api.py` key strength and the env-over-config rule | n/a |
| `hermes_cli.config` | `load_env`, `load_config` | `plugin_api.py` key source, listener host and port | scoped home |
| `hermes_cli.profiles` | `profile_is_standalone` | `plugin_api.py` endpoint (own listener or `/p/<name>/v1`) | explicit profile home |
| `hermes_constants` | `get_hermes_home`, `profile_name_for_home`, `get_default_hermes_root`, `set_hermes_home_override`, `reset_hermes_home_override` | `plugin_api.py` profile identity and the default listener's config | request scope; nested override for the default listener read |

Gateway behaviour mirrored, not imported:
- `gateway/config_env.py` `_api_server`: a usable `.env` `API_SERVER_KEY` overwrites the
  `config.yaml` `platforms.api_server.extra.key`.
- `gateway/platforms/api_server.py` reads a secondary profile's key live on `/p/<name>/`.
- `hermes_cli/gateway.py` starts a named profile's own gateway only when it is standalone.

Core REST used by the UI: `/api/profiles` and `/api/profiles/{name}/soul|model|describe-auto|export`
and `/api/profiles/import` (profile in the path); `GET /api/model/options`, `GET /api/tools/toolsets`
and `POST /api/gateway/restart` (query, in `PROFILE_TRANSPORT`).

## bkt-files (phase 4)

| Module | Symbol | Used by | Profile |
|---|---|---|---|
| `hermes_cli.web_server_files` | `_resolve_managed_path`, `_managed_files_policy`, `_path_is_under` | `plugins/bkt-files/dashboard/plugin_api.py` `_guard` and `_context` (every route) | not profile-scoped (managed policy from env and home) |
| `hermes_cli.web_routers.files` | `_is_sensitive_path`, `_refuse_live_database`, `_serve_offline` | `_check`, tree walks, archive members, search; live-DB admission and reads | sensitive check is pure; SQLite registry is process-wide |
| `hermes_cli.archive_safe` | `normalize_archive_parts` | `/unzip` | n/a (pure) |
| `hermes_constants` | `get_default_hermes_root`, `get_hermes_home`, `get_process_hermes_home` | protected homes and plugins directories | request scope; root, launch home and every `profiles/*` stay protected regardless |
| `hermes_cli.web_server_dashboard` | `_dashboard_plugin_search_dirs` | refusal of writes into plugin directories | launch home, root, bundled (+ project when enabled) |

Core REST reused by the UI (not profile-scoped): `GET/DELETE /api/files`, `POST /api/files/mkdir`,
`POST /api/files/upload-stream`, `GET /api/files/download`, `GET /api/files/stream`.
