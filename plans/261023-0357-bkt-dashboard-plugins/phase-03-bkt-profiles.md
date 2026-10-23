---
phase: 3
title: "bkt-profiles"
status: pending
priority: P1
effort: "1.5d"
dependencies: [1]
---

# Phase 3: bkt-profiles

## Goal

Add a profile workbench tab covering SOUL, messaging, pairing and API server keys, plus an
overview with clone, export, import and model, and an endpoint card.

## Context

The tab reuses these core endpoints with no changes:
- **Profiles** (`hermes_cli/web_routers/profiles.py:807-1144`): list, create (used for clone),
  patch, delete, `soul` GET and PUT, description, model, describe-auto, export and import.
- **Pairing** (`hermes_cli/web_routers/ops.py:84-131`): `/api/pairing`, approve, revoke and
  clear-pending.
- **Messaging** (`hermes_cli/web_routers/messaging.py`): platform list and PUT, test, and the
  Telegram onboarding flow.

Before wiring the calls, confirm how each one takes a profile. Most core routes accept
`?profile=`.

`API_SERVER_KEY` is a per-profile `.env` secret that `gateway/platforms/api_server.py` reads.
The strength rule is in `gateway/config.py:545`, so reuse that function and do not copy it.

## Files to create

- `plugins/bkt-profiles/dashboard/manifest.json` declares the `/bkt-profiles` tab, placed
  `after:profiles`, with icon `Users`.
- `plugins/bkt-profiles/dashboard/plugin_api.py`:
  - `GET /api-key?profile=` returns `{present, masked, strong, endpoint}`. The masked value
    keeps the last 4 characters.
  - `POST /api-key/generate?profile=` creates a key with `secrets.token_urlsafe(32)` and writes
    it to that profile's `.env`. It returns the full value once in the response and never logs
    it. A body flag `{rotate: true}` is required when a key already exists.
  - `DELETE /api-key?profile=` removes the key.
  - `GET /overview?profile=` returns the gateway and api_server status, the model, the enabled
    platforms, and the skill and toolset counts.
  - Writes to `.env` go through the core env helper that the Keys page uses. Look it up in
    `hermes_cli/web_routers/config_env.py` and do not write the file by hand.
- `bkt/packages/profiles/src/` contains:
  - `index.tsx`: a profile list on the left and a tabbed workbench on the right.
  - `SoulTab.tsx`: an editor and `MarkdownView` preview, with a diff and confirmation before
    saving.
  - `MessagingTab.tsx`: platform cards with configure, test and status, plus a Telegram
    onboarding wizard.
  - `PairingTab.tsx`: pending codes, approved users, and approve, revoke and clear actions.
  - `ApiKeyTab.tsx`: shows the masked key. It has generate and rotate buttons with confirmation,
    a reveal-once dialog with copy, and a card showing the OpenAI-compatible base URL with
    curl and Python samples that use `$API_SERVER_KEY` and never the real value.
  - `OverviewTab.tsx`: clone (create from the source profile), export and import, the model
    picker and auto-describe.
- `tests/plugins/bkt_profiles/test_api_key.py` covers generation, rotation, the requirement for
  `rotate`, masking, profile isolation (writing to profile A leaves profile B unchanged) and the
  strength check. It uses a temporary `HERMES_HOME`.

## Steps

1. Trace the profile resolution used by `profiles.py` and `config_env.py`, and record the
   imported helpers in `bkt/UPSTREAM-SEAMS.md`.
2. Write the backend and its tests. Prove the tests fail before the implementation exists.
3. Build the UI tabs.
4. Restart the dashboard (API routes mount at startup) and test end to end on two profiles.

## Verification

- `scripts/run_tests.sh tests/plugins/bkt_profiles` is green.
- A key generated in the UI makes the api_server accept requests after a gateway restart.
- Responses and logs never contain the full key except in the single generate response.

## Risks

- Writing `.env` while the gateway is running only takes effect after a restart. The UI says so
  and offers the core restart action if one exists.
