---
phase: 7
title: "bkt-health and bkt-prompts"
status: completed
priority: P2
effort: "1d"
dependencies: [1, 5]
---

# Phase 7: bkt-health and bkt-prompts

## Goal

Add a live health view for the gateway, messaging platforms and API server, and a reusable
prompt library that can send prompts to bkt-chat.

## bkt-health

- `plugins/bkt-health/dashboard/manifest.json` declares the `/bkt-health` tab with icon `Zap`
  and position `end`, plus a `header-right` slot showing a compact status dot.
- It reads data only from core endpoints. There is no bkt-profiles dependency.
  <!-- Red Team: one /api/profiles read per poll instead of N /overview calls -->
  - One `GET /api/profiles` per poll supplies every profile and its `gateway_running`
    (`hermes_cli/web_routers/profiles.py:89-92,800`).
  - `SDK.api.getStatus()` gives the machine-level status.
  - `GET /api/messaging/platforms?profile=` gives platform and api_server state. It is fetched
    only for expanded profile rows, plus the active profile for the header dot.
- `bkt/packages/health/src/`:
  - A grid with one row per profile and one column per service.
  - `StatusDot` is lime when healthy, grey when disabled and red when failing, with a "last
    checked" time.
  - Polling runs every 15 seconds and pauses while the tab is hidden.
  - A "test" button calls core `POST /api/messaging/platforms/{id}/test`.

## bkt-prompts

- `plugins/bkt-prompts/dashboard/manifest.json` declares the `/bkt-prompts` tab with icon
  `Sparkles`, `"api": "plugin_api.py"`, and position `end`.
- `plugins/bkt-prompts/dashboard/plugin_api.py` provides CRUD routes at `GET`, `POST`, `PUT`
  and `DELETE` `/prompts`.
  <!-- Red Team: plugin_db is per profile; no "global" rows; no module-level connection -->
  <!-- Updated: Validation Session 1 - user confirmed per-profile prompts; variables, JSON I/O and the health header dot stay -->
  - The data lives in `plugins.plugin_storage.plugin_db("bkt-prompts")`
    (`plugins/plugin_storage.py:36`). It resolves `get_hermes_home()` on every call, and the
    plugin route scope binds `?profile=` (`hermes_cli/web_server_dashboard.py:934-957`). Each
    profile therefore has its own prompt database.
  - Prompts are per profile. There is no `profile` column and no "global" prompt. Sharing a
    prompt with another profile uses JSON export and import.
  - Each row holds `{id, title, body, tags[], variables[], updated_at}`.
  - A connection is opened per request inside the route and closed with
    `contextlib.closing`. A module-level connection is forbidden, because it would bind the
    launch profile's database for the life of the process.
- `bkt/packages/prompts/src/`:
  - Lists prompts with search and tag filters.
  - The editor previews with `MarkdownView` and detects `{{variable}}` placeholders.
  - "Use" fills in the variables, writes the text through the phase 1 `bkt/shared/prefill.ts`
    writer, and opens `/bkt-chat`. bkt-chat reads it once on mount (phase 5). Phase 7 edits no
    phase 5 file.
  - Prompts can be imported and exported as JSON.
- `tests/plugins/bkt_prompts/test_crud.py` covers:
  - CRUD.
  - A prompt written under `?profile=a` is invisible under `?profile=b`.
  - Rejection of oversized bodies and invalid tags.

## Verification

- `scripts/run_tests.sh tests/plugins/bkt_prompts` is green.
- The health grid updates within one poll when a platform is disabled.
- A prompt with two variables fills in and appears in the bkt-chat composer.
