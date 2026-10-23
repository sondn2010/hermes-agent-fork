# Brainstorm: BKT dashboard extensions (plugins, theme, branding)

Date: 2026-10-23 · Branch: `feature/bktech` · Status: awaiting user decisions

## Evidence (what the fork already supports)

- The dashboard has an extension system that needs no core edits:
  `website/docs/user-guide/features/extending-the-dashboard.md`.
  - **Themes:** YAML in `<HERMES_HOME>/dashboard-themes/` with palette, typography,
    `colorOverrides`, `assets.logo`, `componentStyles` and `customCSS` (32 KiB cap). Themes load
    only from that directory (`hermes_cli/web_server_dashboard.py:437`); a plugin cannot add one.
  - **UI plugins:** `plugins/<name>/dashboard/manifest.json` plus an IIFE bundle using
    `window.__HERMES_PLUGIN_SDK__`. A plugin can add a tab, override a page, or fill slots.
  - **Backend plugins:** `dashboard/plugin_api.py` exports a FastAPI `router`, mounted at
    `/api/plugins/<name>/` behind the dashboard auth. API routes mount once at startup.
  - **Discovery:** `<repo>/plugins/<name>/dashboard/` is scanned as `bundled`, the same way
    `plugins/kanban` is. `~/.hermes/plugins/<name>/` wins on a name conflict.
- **Shell slots:** `header-left`, `header-right`, `header-banner`, `pre-main`, `post-main`,
  `footer-left`, `footer-right`, `overlay` and `backdrop` (`web/src/App.tsx:526-832`).
- **Page slots:** `files:top/bottom`, `chat:top/bottom`, `sessions`, `config`, `env`, `skills`,
  `cron`, `logs`, `models`, `plugins` and `analytics`. **`ProfilesPage`, `ChannelsPage` and
  `PairingPage` have no slots**, so bkt-profiles must be its own tab or override `/profiles`.
- Core endpoints the plugins can reuse without changes:
  - Profiles: list, create, patch, delete, active, `soul` GET/PUT, description, model,
    describe-auto, export and import (`hermes_cli/web_routers/profiles.py:807-1144`).
  - Pairing: `/api/pairing`, approve, revoke and clear-pending (`hermes_cli/web_routers/ops.py:84-131`).
  - Messaging: platform list and PUT, test, Telegram and WhatsApp onboarding
    (`hermes_cli/web_routers/messaging.py`).
  - Files: list, read, download, stream, upload, upload-stream, mkdir and delete, all under a
    `locked_root` policy (`hermes_cli/web_routers/files.py:515-770`). **Core has no
    move/rename/unzip/copy.**
  - Kanban: board, tasks, links, assignees, runs and stats under `/api/plugins/kanban/`.
- `API_SERVER_KEY` is a per-profile secret in `.env`, read by `gateway/platforms/api_server.py`,
  with a strength check in `gateway/config.py:545`. Nothing in the dashboard generates or rotates it.
- **Chat:** `/chat` embeds the real `hermes --tui` over a PTY, which **does not work on native
  Windows** (`web/AGENTS.md`). Upstream says not to rebuild the chat in React. A JSON-RPC
  `/api/ws` gateway sidecar exists (`hermes_cli/web_routers/chat_ws.py:702`), and the desktop app
  builds a React chat on the same JSON-RPC backend.
- The nav `ICON_MAP` is fixed (`web/src/App.tsx:228`). Plugins must pick from the mapped names.

## Contract

**Outcome:** A set of `bkt-*` dashboard plugins plus a `bkt` theme, with BKT branding and logo.
All of it is additive, so merging upstream `main` never conflicts.

**Constraints:**
- No edits to existing tracked files: no core, `web/src` or router changes. Only new directories
  and files.
- Plugins use the public SDK and REST endpoints. Backend code imports as few Hermes internals as
  possible, because internal paths are not an API and can change upstream.
- New file operations keep the core file policy: `locked_root`, path-traversal guards and the
  blocked trees. Secrets are never echoed in full. Profile scope is explicit on every route.
- Branding: primary `#00ADEF`, secondary `#3F51B5`, tertiary `#A2D149` (success only), neutral
  surfaces `#0E1012`, `#1A1C1E`, `#212428` and `#282B30`, text `#F0F4F8` and `#94A3B8`.

**Non-goals:**
- Changing upstream behaviour, adding new core tools, or contributing upstream.
- Touching the desktop app (it has a separate SDK).
- Replacing core pages unless a decision below chooses it.

**Acceptance criteria:**
- `git diff main --stat` shows only new paths, and a trial `git merge upstream/main` has no
  conflicts.
- Every plugin appears in `/api/dashboard/plugins`, and its tab or slot renders.
- The BKT theme is listed in the theme picker, and the logo shows in the header.
- Each feature is checked end to end against a temporary `HERMES_HOME`, and backend routes have
  pytest coverage through `scripts/run_tests.sh`.

## Placement options (the main design choice)

| | A. `plugins/bkt-*` in repo (recommended) | B. `bkt/` outside `plugins/`, installed into `~/.hermes/plugins` | C. Separate git repo |
|---|---|---|---|
| Install step | None. Discovered as bundled. | Script copies or symlinks the files. | Clone, then install. |
| Merge risk | Only a name clash. The `bkt-` prefix avoids it. | None | None |
| Depends on | The bundled scan of `plugins/<name>/dashboard/` staying the same | The user-plugin path staying stable | The same as B |
| Fails first when | Upstream `scripts/check` or the in-tree policy lints `plugins/` | Someone forgets to reinstall after a change | The two repos drift apart |

**Recommendation:** use a hybrid of A and B.
- TypeScript source lives in `bkt/` (an esbuild workspace with a shared `bkt/shared/` folder for
  the markdown and mermaid viewer, the folder-picker dialog, the API helpers and the brand tokens).
- The build writes IIFE bundles into `plugins/bkt-*/dashboard/dist/`, and those bundles are
  committed.
- `bkt/install` copies only the theme YAML into `<HERMES_HOME>/dashboard-themes/`, because themes
  cannot be bundled.
- This solves DRY, since a plain IIFE cannot share code at runtime, and needs no install step for
  the plugins.

## Feature design

- **bkt-brand** (slot-only, new):
  - Renders the `header-left` logo from `/dashboard-plugins/bkt-brand/logo.png` and sets an
    optional page title and favicon from JS.
  - The logo is also exposed as `assets.logo` in the theme. This gives the logo with no core
    change.
- **bkt-theme:**
  - Written as YAML, where the 3-layer palette is background `#0E1012`, midground `#F0F4F8` and
    foreground `#00ADEF`.
  - `colorOverrides` set primary and ring to `#00ADEF`, secondary to `#3F51B5`, success to
    `#A2D149`, and card, popover and border to the surface steps.
  - `componentStyles` cover the header, cards and badges.
  - `customCSS` adds the indigo tool-invoke surfaces and the cyan live-generation pulse.
- **bkt-profiles** (new tab):
  - A per-profile workbench with tabs for SOUL editor, Messaging, Pairing, API server key and
    Overview.
  - **SOUL editor:** uses the core `soul` endpoints, with a markdown preview and a diff before
    saving.
  - **Messaging:** core platforms plus onboarding, with a test-connection button per platform.
  - **Pairing:** pending and approved users, with approve and revoke.
  - **API server key:** the plugin backend generates the key with the `secrets` module, rotates
    it, and shows it masked with a reveal-once option. It writes the key to the profile `.env` and
    checks its strength.
  - **Overview:** clone, export and import, and model.
  - Suggested extras: gateway and api_server status per profile, an "OpenAI-compatible endpoint"
    card with base URL and a curl sample, an enabled-skills and toolsets summary, and a memory
    viewer.
- **bkt-files** (new tab, or the `files:top` toolbar):
  - New backend routes for move, rename, copy, unzip with zip-slip and size guards, zip-download
    of a folder, and folder upload. Folder upload uses `webkitdirectory` with relative paths and
    calls core `upload-stream` with mkdir.
  - UI: drag-and-drop moves, a "Move to…" folder-picker dialog, multi-select, and a
    markdown/text/code viewer with mermaid (lazy-loaded) and syntax highlighting.
  - Suggested extras: search by name, an image and PDF preview, inline text edit using core
    `fs/write-text`, and a breadcrumb with recent folders.
- **bkt-chat** (new tab). This needs a decision, see Q2.
  - Recommended: a React chat over the `/api/ws` JSON-RPC sidecar, the same protocol the desktop
    app uses. It works on native Windows, where the PTY chat does not, and can render markdown,
    mermaid, tool-call cards in indigo, and a lime completion marker.
  - Risk: upstream calls this a second chat surface, and the JSON-RPC protocol is not a public
    contract, so it can break on a sync.
- **bkt-kanban-workflow** (new tab):
  - Reads `/api/plugins/kanban/board`, `/links` and `/assignees`, and draws a profile-to-profile
    flow graph with mermaid or SVG. Edges come from task links and reassignments, weighted by
    count.
  - Includes an active runs overlay and a board filter.
- **bkt-author** (slot-only): `footer-right` shows "Son Do · sondn2010@gmail.com". An optional
  `/bkt-about` tab adds version and links.
- **Other suggestions:**
  - **bkt-health:** lime status pings for the gateway, platforms and API server.
  - **bkt-usage:** tokens and cost per profile and model, using core analytics.
  - **bkt-prompts:** a reusable prompt and snippet library.
  - **bkt-sessions-export:** export sessions to markdown or PDF.

## Decisions (user, 2026-10-23)

1. Placement uses the hybrid. Source lives in `bkt/`, the built bundles are committed to
   `plugins/bkt-*/dashboard/dist`, and `bkt/install` installs the theme.
2. bkt-chat is a React chat over the `/api/ws` JSON-RPC sidecar. A protocol smoke test guards
   upstream syncs.
3. The dashboard must work on both native Windows and WSL or Linux. Backend tests cover the
   Windows path handling.
4. Extras in the first delivery are bkt-health and bkt-prompts. bkt-usage and
   bkt-sessions-export are deferred.
5. Default, not yet confirmed: bkt-profiles and bkt-files are new tabs next to the core pages,
   not `tab.override`. This keeps upstream improvements to the core pages.

Full plugin set: bkt-brand, bkt-theme, bkt-profiles, bkt-files, bkt-chat, bkt-kanban-workflow,
bkt-author, bkt-health and bkt-prompts.

## Unresolved questions

- The `/api/ws` JSON-RPC method set has to be confirmed against `tui_gateway/` and the desktop
  client before bkt-chat is planned in detail.
- Plugin storage is not decided. bkt-prompts could store data in a profile-scoped JSON file or in
  `plugins/plugin_storage.py`, and the choice will be made at planning time.
