---
phase: 8
title: "Verification, docs and sync rehearsal"
status: pending
priority: P1
effort: "0.5d"
dependencies: [2, 3, 4, 5, 6, 7]
---

# Phase 8: Verification, docs and sync rehearsal

## Goal

Prove the whole set works on both platforms and survives an upstream sync, and document how to
use and maintain it.

## Files to create

- `tests/plugins/bkt_common/test_discovery.py` is an end-to-end test against a temporary
  `HERMES_HOME`. It checks that the dashboard plugin discovery returns all nine `bkt-*` manifests
  and that each declared `entry` file exists.
- `tests/plugins/bkt_common/test_upstream_seams.py` imports every symbol listed in
  `bkt/UPSTREAM-SEAMS.md`, so a renamed internal fails loudly.
- `docs/bkt/README.md` is the user and maintainer guide. It covers:
  - Install: `npm --prefix bkt ci && npm --prefix bkt run build && node bkt/install.mjs`.
  - One screenshot-free paragraph per plugin.
  - The theme, the logo and the API-key safety notes.
  - The upstream sync checklist: fetch upstream, merge, run check-additive, run
    `npm --prefix bkt test`, run the `bkt_*` tests and rebuild.

## Steps

1. Run the full checks:
   - `npm --prefix bkt test`
   - `scripts/run_tests.sh tests/plugins/bkt_*`
   - `python scripts/check`, which must not add findings on BKT files.
   - `node bkt/scripts/check-additive.mjs main`
2. Rehearse a sync:
   - `git fetch upstream`
   - `git switch -c sync-trial`
   - `git merge upstream/main`
   - Expect no conflicts, then rebuild and retest.
   - Delete the trial branch.
3. Run the manual end-to-end matrix on native Windows and WSL. Cover every tab and slot under
   both the bkt theme and the default theme, and check the browser console for errors.
4. Use the code-review skill on all BKT files, focusing on the file operations and the secret
   handling.

## Acceptance

- All acceptance criteria in `plan.md` are checked.
- The review findings are resolved or explicitly accepted.
