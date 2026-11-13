---
phase: 1
title: "Workspace foundation and merge guard"
status: completed
priority: P1
effort: "1.5d"
dependencies: []
---

# Phase 1: Workspace foundation and merge guard

## Goal

Create the `bkt/` build workspace, the shared helper library, the theme installer, and the checks
that keep every change additive and every committed bundle fresh. All later plugin phases build on
these.

## Context

- Plugin contract: `website/docs/user-guide/features/extending-the-dashboard.md`.
  - The bundle is an IIFE.
  - React, the components, `fetchJSON`, `authedFetch`, `buildWsUrl` and `buildWsAuthParam` come
    from `window.__HERMES_PLUGIN_SDK__` (`web/src/plugins/sdk.d.ts:140-159`).
  - Bundles call `register` and `registerSlot`.
  - The nav icon must be a name in `ICON_MAP` (`web/src/App.tsx:228`).
  - A manifest with a backend must declare `"api": "plugin_api.py"`. Discovery only sets
    `has_api` when that field is present (`hermes_cli/web_server_dashboard.py:534-562`;
    reference: `plugins/kanban/dashboard/manifest.json`).
- Bundled discovery scans `<repo>/plugins/<name>/dashboard/manifest.json` in sorted name order,
  using `plugins/kanban` as the reference layout.
- Settled: bundled dashboard plugins do not need `plugins.enabled`. Only an explicit
  `plugins.disabled` entry stops them (`hermes_cli/web_server_dashboard.py:807-811`).
  <!-- Red Team: open item resolved from source -->
- Plugin asset URLs carry the base path and a profile segment:
  `${HERMES_BASE_PATH}/dashboard-plugins/@<profile>/<name>/<file>`
  (`web/src/plugins/usePlugins.ts:80-86`). Runtime asset URLs are therefore derived from the
  bundle's own `document.currentScript.src`, captured synchronously when the bundle is
  evaluated, and never hardcoded.
- The blob-size guard fails any newly added text file over 500 KiB
  (`scripts/ci/check_blob_size.py:14,40`). Its only exemption is a tracked file
  (`.github/blob-size-allowlist.txt`), which BKT must not edit.
- `@hermes/shared` (`apps/shared`) is a private package of the root npm workspace and exports
  raw `.ts` files. `bkt/` is not a member of that workspace and must not become one, because that
  would edit the root `package.json` and `package-lock.json`.
- Themes load from the dashboard process's launch home, `get_process_hermes_home()`
  (`hermes_cli/web_server_dashboard.py:431-437`), and are re-read on every request. A new theme
  needs no rescan.

## Files to create

- `bkt/package.json` declares every package entry and every dependency for phases 2 to 7 up
  front: esbuild, typescript, vitest, `react-markdown`, `remark-gfm`, and `mermaid` pinned
  exactly to the desktop's version (`11.16.1`, `apps/desktop/package.json:134`). Every other
  dependency has an upper bound. There is no `fflate`, because every zip operation runs in Python.
  <!-- Red Team: fflate unused; mermaid pinned like desktop; deps declared up front -->
- `bkt/package-lock.json` is committed, because `npm ci` requires it.
- `bkt/tsconfig.json` has a `paths` entry mapping `@hermes/shared/*` to `../apps/shared/src/*`.
- `bkt/vitest.config.ts` has a matching `resolve.alias`.
- `bkt/scripts/build.mjs`:
  - Builds each `bkt/packages/<name>/src/index.tsx` into
    `plugins/bkt-<name>/dashboard/dist/index.js`.
  - Output is an IIFE with `jsx: automatic` mapped to `window.__HERMES_PLUGIN_SDK__.React`
    through a small shim, and React is never bundled.
  - Aliases `@hermes/shared` to `../apps/shared/src` as a read-only import.
  - Marks `mermaid` as external in every plugin bundle.
  - The build is deterministic: no timestamps, and stable output ordering.
  - Fails when any emitted `dist/` file is over 450 KiB, which keeps a margin under the 500 KiB
    gate.
  - With `--vendor`, it also builds mermaid once as a standalone IIFE at
    `plugins/bkt-brand/dashboard/dist/vendor/mermaid.js`. That directory holds a committed
    `.gitignore` that ignores everything in it except itself. The vendor file is never committed.
  <!-- Red Team: IIFE cannot code-split; mermaid built at install time, never committed -->
  <!-- Updated: Validation Session 1 - user confirmed install-time mermaid build -->
  <!-- Updated: Validation Session 1 - upstream remote is NousResearch/hermes-agent (used in phase 8) -->
- `bkt/scripts/check-additive.mjs`:
  - Takes an optional base ref, which defaults to `main-bktech`, and diffs from
    `git merge-base <base> HEAD`.
  - Fails when `git diff --name-status <merge-base>...HEAD` shows any `M`, `D` or `R` entry
    outside `plans/`.
  - Also fails when it shows an `A` entry outside `plans/`, `bkt/`, `plugins/bkt-*/`,
    `tests/plugins/bkt_*/` and `docs/bkt/`.
  <!-- Red Team: base is main-bktech, not main; A entries checked too -->
- `bkt/scripts/check-dist-fresh.mjs` runs the build without `--vendor`, then fails if
  `git status --porcelain -- plugins/bkt-*/dashboard/dist` shows any change.
  <!-- Red Team: stale committed bundles -->
- `bkt/install.mjs`, with `.ps1` and `.sh` wrappers:
  - Runs `npm --prefix bkt ci` and `node bkt/scripts/build.mjs --vendor`.
  - Takes `--home <dir>`. By default it copies `bkt/theme/*.yaml` into the root home and into
    every profile home, because the dashboard reads themes from whichever home it was launched
    with.
  - Resolves the homes from Hermes itself and never hardcodes `~/.hermes`.
    `hermes config path` (`hermes_cli/subcommands/config.py:39`) gives the active home's
    `config.yaml`. If that home is `<root>/profiles/<name>`, the root is two levels up.
    Profile homes are the directories under `<root>/profiles/`. The installer does not parse
    `hermes profile list`, which prints a table for people and has no JSON mode
    (`hermes_cli/subcommands/profile.py:14`).
  - Prints every directory it wrote to.
  - Tells the user to restart the dashboard if it is running, because API routes mount at
    startup or on first request. It does not call a "rescan" step: the rescan endpoint needs a
    running, authenticated dashboard (`hermes_cli/web_routers/dashboard_ui.py:124`), and themes
    need no rescan.
  <!-- Red Team: theme dir is the launch home; no CLI rescan exists -->
- `bkt/shared/sdk.ts` gives typed access to `window.__HERMES_PLUGIN_SDK__` and
  `window.__HERMES_PLUGINS__`. It provides the `registerPlugin(name, Page, slots)` helper and
  `selfAssetUrl(file)`, which resolves a file next to the current bundle from the captured
  `currentScript.src`.
- `bkt/shared/api.ts`:
  - `bktFetch(path, init)` wraps `SDK.fetchJSON`. `bktUpload(path, body)` wraps
    `SDK.authedFetch` for multipart and streaming requests.
  - `profileRequest(endpoint, profile)` places the profile where the endpoint reads it, using a
    table of core endpoints. Query endpoints get `?profile=`, and JSON-body endpoints get a
    `profile` field. For example, `/api/pairing/approve` and `/revoke` read `body.profile`
    (`hermes_cli/web_routers/ops.py:91-93,120-122`), while `/api/pairing` and clear-pending read
    the query (`ops.py:84-85,131`). An endpoint missing from the table is a type error, not a
    silent query fallback.
  - It also exports the profile-list hook, which reads one `GET /api/profiles`.
  <!-- Red Team: profile transport differs per endpoint -->
- `bkt/shared/prefill.ts` defines the `bkt-chat:prefill` sessionStorage key and its typed
  writer and read-once reader. Phase 5 consumes the reader and phase 7 the writer, so neither
  phase edits the other's files.
- `bkt/shared/brand.ts` holds the brand tokens as CSS variable names and hex values.
- `bkt/shared/components/MarkdownView.tsx`:
  - Renders GFM with `react-markdown` and `remark-gfm`, with no raw HTML (no `rehype-raw`) and
    with URL sanitizing.
  - For mermaid code fences, it lazily injects one `<script>` for the vendor mermaid file. That
    URL is resolved through `bkt-brand`'s asset path with the same base path and profile segment.
  - Initializes mermaid with `startOnLoad: false` and `securityLevel: 'strict'`.
  - When the vendor file is missing or fails to load, it shows the fence as a code block.
  - It is used by profiles, files, chat, prompts and kanban-workflow.
  <!-- Red Team: mermaid XSS hardening and single shared copy -->
- `bkt/shared/components/FolderPickerDialog.tsx` is a tree browser over core `/api/files`. It is
  used by files and profiles.
- `bkt/shared/components/StatusDot.tsx` is the lime/indigo/grey status indicator.
- `bkt/shared/styles.css` holds shared classes prefixed with `bkt-`. The build copies it into
  each plugin's `dist/style.css`.
- `bkt/UPSTREAM-SEAMS.md` lists every Hermes internal that BKT code imports, with the owning
  file and how the profile is passed. It includes the read-only `apps/shared/src` import. Later
  phases append their own sections.
- `bkt/README.md` is a short developer guide covering build, install, check-additive and
  check-dist-fresh. Its location was requested in the plan scope.
- `bkt/shared/*.test.ts` holds vitest tests:
  - `profileRequest` puts the profile in the query or the body for every endpoint in the table.
  - Mermaid fence detection.
  - `MarkdownView` leaves a `<script>` tag and a mermaid `click` directive inert.

## Steps

1. Read `plugins/kanban/dashboard/manifest.json` and the first 60 lines of its `dist/index.js`
   to copy the bundle conventions.
2. Scaffold the workspace, commit the lockfile, and write the build script with the alias, the
   size budget and the vendor mode.
3. Build a throwaway `hello` package to prove the pipeline end to end. The spike also proves
   that `document.currentScript.src` is set when a plugin bundle runs, and that a vendor script
   loads from `/dashboard-plugins/@<profile>/bkt-brand/dist/vendor/` under a base path. Then
   delete the package.
4. Write the shared helpers and their tests.
5. Write check-additive, check-dist-fresh and the installer. Test the installer with a
   temporary root home holding two profiles, and with the active profile set to a non-default
   one.
6. Record the answer to the `plugins.enabled` question (not needed) in `bkt/README.md`.

## Verification

- `npm --prefix bkt ci && npm --prefix bkt run build` creates the expected `dist/` files, each
  under 450 KiB.
- `npm --prefix bkt test` is green.
- `node bkt/scripts/check-additive.mjs` passes. As a negative check, a scratch edit to a tracked
  file outside the allowed roots makes it fail.
- `node bkt/scripts/check-dist-fresh.mjs` passes after a commit. As a negative check, an
  uncommitted source change makes it fail.
- After `hermes dashboard --no-open`, `curl /api/dashboard/plugins` lists the hello plugin during
  the spike.

## Risks

- The JSX shim may resolve to a second copy of React, which breaks hooks. Mitigate by marking
  `react` as external and aliasing it to the SDK global.
- `currentScript` may be null if the shell ever loads bundles as modules. The spike proves the
  current behaviour, and `selfAssetUrl` falls back to `pluginAssetUrl`-style construction from
  `__HERMES_BASE_PATH__` and the active profile.
- `react-markdown` and `remark-gfm` are bundled once per plugin that renders markdown. The
  450 KiB budget catches growth.
