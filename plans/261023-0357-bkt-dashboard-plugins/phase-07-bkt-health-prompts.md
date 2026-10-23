---
phase: 7
title: "bkt-health and bkt-prompts"
status: pending
priority: P2
effort: "1d"
dependencies: [1, 3]
---

# Phase 7: bkt-health and bkt-prompts

## Goal

Add a live health view for the gateway, messaging platforms and API server, and a reusable
prompt library that can send prompts to bkt-chat.

## bkt-health

- `plugins/bkt-health/dashboard/manifest.json` declares the `/bkt-health` tab with icon `Zap`,
  plus a `header-right` slot showing a compact status dot.
- It reads data only from core endpoints: `SDK.api.getStatus()`, `/api/messaging/platforms`,
  and the bkt-profiles `/overview` route from phase 3 for the api_server status of each profile.
- `bkt/packages/health/src/`:
  - A grid with one row per profile and one column per service.
  - `StatusDot` is lime when healthy, grey when disabled and red when failing, with a "last
    checked" time.
  - Polling runs every 15 seconds and pauses while the tab is hidden.
  - A "test" button calls the core platform test endpoint.

## bkt-prompts

- `plugins/bkt-prompts/dashboard/manifest.json` declares the `/bkt-prompts` tab with icon
  `Sparkles`.
- `plugins/bkt-prompts/dashboard/plugin_api.py` provides CRUD routes at `GET`, `POST`, `PUT`
  and `DELETE` `/prompts`.
  - The data is stored in `plugins.plugin_storage.plugin_db("bkt-prompts")`, a SQLite store.
  - Each row holds `{id, title, body, tags[], variables[], profile|null, updated_at}`.
  - A null profile makes a prompt global. Otherwise the prompt is scoped to its profile.
  - Before relying on `plugin_storage`, confirm it is profile-aware. If it is not, store the
    data under the profile home through `get_hermes_home()`.
- `bkt/packages/prompts/src/`:
  - Lists prompts with search and tag filters.
  - The editor previews with `MarkdownView` and detects `{{variable}}` placeholders.
  - "Use" fills in the variables and opens `/bkt-chat` with the composer prefilled. The handoff
    goes through `sessionStorage` key `bkt-chat:prefill`, read once by bkt-chat. That is a
    single new line in phase 5's composer, owned by the phase 5 implementer.
  - Prompts can be imported and exported as JSON.
- `tests/plugins/bkt_prompts/test_crud.py` covers CRUD, profile scoping, and rejection of
  oversized bodies and invalid tags.

## Verification

- `scripts/run_tests.sh tests/plugins/bkt_prompts` is green.
- The health grid updates within one poll when a platform is disabled.
- A prompt with two variables fills in and appears in the bkt-chat composer.
