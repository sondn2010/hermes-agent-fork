---
phase: 01
title: Build wiring and manifest
status: completed
depends_on: []
---

# Phase 01: Build wiring and manifest

## Context
- `bkt/scripts/build.mjs` defines `PACKAGES` and `distDir(name)`, which returns `plugins/bkt-<name>/dashboard/dist`. `check-dist-fresh.mjs` reuses both.
- The console's dashboard directory is `plugins/bkt_dia_common/dashboard/`, with an underscore, because the Python package import path needs it. Today `dist/index.js` is a 9-line stub, and the manifest has `tab.hidden: true`.

## Files (owned)
- `bkt/scripts/build.mjs`
- `bkt/scripts/check-dist-fresh.mjs`, only if it hard-codes the `bkt-<name>` path.
- `plugins/bkt_dia_common/dashboard/manifest.json`
- `bkt/packages/dia/src/index.tsx`: a placeholder that only calls `registerPlugin("bkt-dia-common", …)`. Phase 02 fills it in.

## Steps
1. Add `"dia"` to `PACKAGES`.
2. Give `build.mjs` an explicit out-dir override, for example `const DIST_OVERRIDES = { dia: "bkt_dia_common" }`, and use it in `distDir`. Banner text: `bkt-dia-common: generated from bkt/packages/dia`.
3. Update the manifest:
   - `"label": "Trung tâm DIA AI"`
   - `"description"`: a Vietnamese one-liner
   - `"tab": { "path": "/dia", "position": "end" }`, dropping `hidden`
   - add `"css": "dist/style.css"`
   - keep `"entry"` and `"api"`
   - bump `version` to `0.2.0`
4. Run `cd bkt && node scripts/build.mjs --only dia`. Confirm that `plugins/bkt_dia_common/dashboard/dist/{index.js,style.css}` are written and nothing appears under `plugins/bkt-dia/`.

## Validation
- `npm run check:dist` passes after the build.
- `GET /api/dashboard/plugins` lists `bkt-dia-common` with tab path `/dia` and no `hidden` flag. Check this with the existing `tests/hermes_cli` discovery tests, or a quick dashboard run.

## Risk / rollback
- The registered plugin name must equal the manifest `name` (`bkt-dia-common`), or the host reports NO_REGISTER.
- Rollback: revert the manifest and `build.mjs`, and restore the stub dist.
