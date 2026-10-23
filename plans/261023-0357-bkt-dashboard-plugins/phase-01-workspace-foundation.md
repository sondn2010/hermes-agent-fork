---
phase: 1
title: "Workspace foundation and merge guard"
status: pending
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: Workspace foundation and merge guard

## Goal

Create the `bkt/` build workspace, the shared helper library, the theme installer and the
check that keeps every change additive. All later plugin phases build on these.

## Context

- Plugin contract: `website/docs/user-guide/features/extending-the-dashboard.md`.
  - The bundle is an IIFE.
  - React and the components come from `window.__HERMES_PLUGIN_SDK__`.
  - Bundles call `register` and `registerSlot`.
  - The nav icon must be a name in `ICON_MAP` (`web/src/App.tsx:228`).
- Bundled discovery scans `<repo>/plugins/<name>/dashboard/manifest.json`, using
  `plugins/kanban` as the reference layout.
- Open item: confirm whether bundled dashboard plugins need `plugins.enabled`. Check
  `hermes_cli/web_server_dashboard.py` and the plugin loader. If they do, `bkt/install` enables
  them with `hermes config set` and never by editing files.

## Files to create

- `bkt/package.json` defines the workspace, with esbuild, typescript, vitest,
  `react-markdown`, `remark-gfm`, `mermaid` and `fflate`. Every dependency has an upper bound.
- `bkt/tsconfig.json`.
- `bkt/scripts/build.mjs`:
  - Builds each `bkt/packages/<name>/src/index.tsx` into
    `plugins/bkt-<name>/dashboard/dist/index.js`.
  - Output is an IIFE with `jsx: automatic` mapped to `window.__HERMES_PLUGIN_SDK__.React`
    through a small shim, and React is never bundled.
  - Mermaid is emitted as a separate lazily loaded chunk file inside `dist/`.
- `bkt/scripts/check-additive.mjs` fails when `git diff --name-status --diff-filter=MDR
  <base>...HEAD` lists any path outside `plans/`.
- `bkt/install.mjs` (or `.ps1` and `.sh` wrappers):
  - Resolves `HERMES_HOME` with the same rules as `get_hermes_home()`, by calling
    `hermes config path` or similar rather than hardcoding `~/.hermes`.
  - Copies `bkt/theme/*.yaml` into `dashboard-themes/` and runs the plugin rescan.
- `bkt/shared/sdk.ts` gives typed access to `window.__HERMES_PLUGIN_SDK__` and
  `window.__HERMES_PLUGINS__`, plus the `registerPlugin(name, Page, slots)` helper.
- `bkt/shared/api.ts`:
  - `bktFetch(path, init)` wraps `SDK.fetchJSON`.
  - `withProfile(url, profile)` adds the `profile` query parameter.
  - It also exports the profile-list hook.
- `bkt/shared/brand.ts` holds the brand tokens as CSS variable names and hex values.
- `bkt/shared/components/MarkdownView.tsx` renders GFM and lazily renders mermaid code fences.
  It is used by profiles, files, chat and prompts.
- `bkt/shared/components/FolderPickerDialog.tsx` is a tree browser over core `/api/files`. It is
  used by files and profiles.
- `bkt/shared/components/StatusDot.tsx` is the lime/indigo/grey status indicator.
- `bkt/shared/styles.css` holds shared classes prefixed with `bkt-`. The build copies it into
  each plugin's `dist/style.css`.
- `bkt/UPSTREAM-SEAMS.md` lists every Hermes internal that BKT Python code imports, with the
  owning file.
- `bkt/README.md` is a short developer guide covering build, install and check-additive. Its
  location was requested in the plan scope.
- `bkt/shared/*.test.ts` holds vitest tests for `withProfile` and the mermaid fence detection.

## Steps

1. Read `plugins/kanban/dashboard/manifest.json` and the first 60 lines of its `dist/index.js`
   to copy the bundle conventions.
2. Scaffold the workspace and write the build script.
3. Build a throwaway `hello` package to prove the pipeline end to end, then delete it.
4. Write the shared helpers and their tests.
5. Write check-additive and the installer.
6. Settle the `plugins.enabled` question and record the answer in `bkt/README.md`.

## Verification

- `npm --prefix bkt run build` creates the expected `dist/` files.
- `npm --prefix bkt test` is green.
- `node bkt/scripts/check-additive.mjs main` passes.
- After `hermes dashboard --no-open`, `curl /api/dashboard/plugins` lists the hello plugin
  during the spike.

## Risks

- The JSX shim may resolve to a second copy of React, which breaks hooks. Mitigate by marking
  `react` as external and aliasing it to the SDK global.
- Mermaid is about 1 MB. Mitigate by loading it only when a mermaid fence is present.
