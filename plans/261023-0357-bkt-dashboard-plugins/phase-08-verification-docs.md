---
phase: 8
title: "Verification, docs and sync rehearsal"
status: in-progress
priority: P1
effort: "0.5d"
dependencies: [2, 3, 4, 5, 6, 7]
---

# Phase 8: Verification, docs and sync rehearsal

## Goal

Prove the whole set works on both platforms and adds no new conflicts on an upstream sync, and
document how to use and maintain it.

## Files to create

- `tests/plugins/bkt_common/test_discovery.py` is an end-to-end test against a temporary
  `HERMES_HOME`. It checks that dashboard plugin discovery returns exactly the eight manifests
  `bkt-brand`, `bkt-author`, `bkt-profiles`, `bkt-files`, `bkt-chat`, `bkt-kanban-workflow`,
  `bkt-health` and `bkt-prompts`. It also checks that each declared `entry` file exists, and that
  each plugin with a `plugin_api.py` declares `"api"`.
  <!-- Red Team: eight plugins plus one theme; assert the name set -->
- `tests/plugins/bkt_common/test_upstream_seams.py` imports every Python symbol listed in
  `bkt/UPSTREAM-SEAMS.md`, so a renamed internal fails loudly.
- `docs/bkt/README.md` is the user and maintainer guide. It covers:
  - Install: `node bkt/install.mjs`, which runs `npm --prefix bkt ci` and the vendor build, then
    installs the theme.
  - One screenshot-free paragraph per plugin.
  - The theme, the logo, the API-key safety notes and the file-operation guards.
  - The one-time upstream setup:
    `git remote add upstream https://github.com/NousResearch/hermes-agent.git`.
  - The upstream sync checklist:
    1. Fetch upstream.
    2. Merge.
    3. Run check-additive.
    4. Rebuild with `npm --prefix bkt run build` and run check-dist-fresh. Commit any rebuilt
       `dist/` that changed, because bkt-chat bundles `apps/shared`.
    5. Run `npm --prefix bkt test`.
    6. Run the `bkt_*` tests.
    7. Do a one-turn bkt-chat smoke test.
  - The baseline: the fork's existing rebrand changes to tracked files can conflict on a
    merge, and those conflicts are not BKT conflicts.

## Steps

1. Run the full checks:
   - `npm --prefix bkt test`
   - `scripts/run_tests.sh tests/plugins/bkt_*`
   - `python scripts/check`, which must not add findings on BKT files, including blob-size.
   - `node bkt/scripts/check-additive.mjs`
   - `node bkt/scripts/check-dist-fresh.mjs`
2. Rehearse a sync:
   - Add the `upstream` remote if it is missing, then `git fetch upstream`.
   - `git switch -c sync-trial`
   - `git merge upstream/main`
   - Record every conflict. Expect none in BKT-owned paths. Conflicts in the rebrand baseline
     are listed in the report, not fixed here.
   - Rebuild, run check-dist-fresh, and retest.
   - Abort or reset the merge, switch back, and delete the trial branch.
   <!-- Red Team: no upstream remote existed; criterion is no new BKT conflicts -->
3. Run the manual end-to-end matrix on native Windows and WSL:
   - Cover every tab and slot under both the bkt theme and the default theme, on the launch
     profile and one other profile.
   - Check the browser console for errors.
4. Use the code-review skill on all BKT files, focusing on the file operations, the secret
   handling and profile scoping.

## Acceptance

- All acceptance criteria in `plan.md` are checked.
- The review findings are resolved or explicitly accepted.
