---
title: BKT dashboard plugins implemented
date: 2026-10-23
summary: "Eight bkt-* plugins, theme and logo built additively; security review fixed; Windows runs pending"
---

# BKT dashboard plugins implemented

## What happened
Phases 1 to 7 of `plans/261023-0357-bkt-dashboard-plugins/` are built. Phase 8 is done on macOS.

All eight `bkt-*` plugins pass on macOS:
- Discovery finds exactly the eight plugins.
- All 164 backend tests and 158 vitest tests pass.
- The repo's lint and complexity gates report nothing on BKT files.
- Every tab renders under both themes and on two profiles with no page errors.

A trial merge of NousResearch `main` (159 commits) produced 7 conflicts. All were in the fork's
pre-existing rebrand baseline, none in BKT paths. After the merge, the rebuilt bundles were
unchanged and every test still passed.

## What went wrong, and what we learned
- **The security review caught real bypasses in bkt-files.** Look-alike Unicode letters, such as
  `ſ` for `s` and the `ﬁ` ligature, opened `auth.json` and `config.yaml` on macOS. The cause was
  core `_is_sensitive_filename` comparing names with `str.lower()`. Other findings were Windows
  alias names, a quadratic unzip memory blow-up, and two data-loss paths. All are fixed, each
  with a test that failed first. Delegated guard code needs an adversarial review before it can
  be called done.
- **Two plan premises were wrong, and the source corrected them.** A usable `.env` API key wins
  over `config.yaml`. A named profile has its own listener only when it is standalone.
- **The host's `Button` takes `outlined` and `destructive` booleans, not `variant`.** Every
  plugin's button styles had been silently ignored.
- **The dashboard caches the plugin list at startup.** A newly installed plugin backend therefore
  needs a restart before `?profile=` requests reach it.

## Next steps
- Run the manual checks on native Windows and on WSL, including the four Windows-only tests.
- Commit the BKT files, then run `check-dist-fresh`.
- Decide on a private report of the core `_is_sensitive_filename` issue under `SECURITY.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
