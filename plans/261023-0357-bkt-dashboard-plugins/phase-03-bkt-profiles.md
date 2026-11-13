---
phase: 3
title: "bkt-profiles"
status: completed
priority: P1
effort: "1.75d"
dependencies: [1]
---

# Phase 3: bkt-profiles

## Goal

Add a profile workbench tab covering SOUL, messaging, pairing and API server keys, plus an
overview with clone, export, import, the model, and an endpoint card.

## Context

The tab reuses these core endpoints with no changes. The profile transport for each one is
recorded in the phase 1 `profileRequest` table:
- **Profiles** (`hermes_cli/web_routers/profiles.py:807-1144`): list, create (used for clone with
  `clone_from`, `profiles.py:815`), patch, delete, `soul` GET and PUT, description, model,
  describe-auto, export and import. `GET /api/profiles` already returns `model`, `skill_count`
  and `gateway_running` for every profile (`profiles.py:89-92,800`).
- **Status** (`hermes_cli/web_routers/status.py:482`): `GET /api/status?profile=`.
- **Pairing** (`hermes_cli/web_routers/ops.py:84-131`): `GET /api/pairing?profile=` and
  clear-pending take the profile in the query. Approve and revoke take it in the JSON body
  (`body.profile`, `ops.py:91-93,120-122`; `hermes_cli/web_models.py:371-380`).
  <!-- Red Team: pairing profile is in the body for approve and revoke -->
- **Messaging** (`hermes_cli/web_routers/messaging.py`): platform list and PUT (`:916`, `:975`),
  test (`:1181`), Telegram onboarding (`:804-906`) and WhatsApp onboarding (`:629-739`).
  <!-- Red Team: WhatsApp onboarding was in the brainstorm and had been dropped -->
- **Env** (`hermes_cli/web_routers/config_env.py`): `GET /api/env?profile=` already returns
  redacted values (`:259`), and `POST /api/env/reveal` is guarded by `_require_token`, a 5 per
  30 seconds rate limit and an audit log line (`:1085-1110`).

`API_SERVER_KEY` is a per-profile `.env` secret. Points to watch:
- Corrected during implementation: a usable `.env` `API_SERVER_KEY` overwrites
  `platforms.api_server.extra.key` (`gateway/config_env.py` `_api_server`). The `config.yaml` key
  is used only when `.env` holds no usable key, and a generated `.env` key would silently replace
  it, so generation is refused while `source` is `config`.
- Corrected during implementation: a named profile gets its own listener only when its config sets
  `gateway.standalone: true` (`hermes_cli.profiles.profile_is_standalone`); otherwise it is served
  at `/p/<profile>/` on the default profile's listener (`hermes_cli/web_routers/messaging.py:938`), and its key is read
  live per request (`api_server.py:1463-1474`). For secondaries the endpoint is
  `/p/<profile>/v1`, and a new key needs no restart.
- The strength rule is the public `hermes_cli.auth.has_usable_secret(value, min_length=16)`
  (`hermes_cli/auth.py:307`). The private `gateway/config.py:544` `_has_usable_api_server_key`
  only wraps it and is not imported.
- `.env` writes go through `hermes_cli.credential_lifecycle.save_provider_env_credential` and
  `remove_provider_env_credential` (`hermes_cli/credential_lifecycle.py:164,203`), which
  reconcile the `config.yaml` mirrors and the credential pool. Writing the file by hand would
  skip that.

## Files to create

- `plugins/bkt-profiles/dashboard/manifest.json` declares the `/bkt-profiles` tab with icon
  `Users`, `"api": "plugin_api.py"`, and position `end`. Plugin tabs are grouped separately from
  core tabs (`web/src/App.tsx:292-305`), so an `after:profiles` position would not place the tab
  next to the core Profiles page.
- `plugins/bkt-profiles/dashboard/plugin_api.py` keeps key generation on the backend, as the
  brainstorm decided:
  <!-- Red Team: backend keeps generation; persistence and guards reuse core -->
  - Every route calls `_require_token(request)` (`hermes_cli/web_server.py:318`) and runs inside
    the plugin route's profile scope.
  - `GET /api-key?profile=` returns `{present, masked, strong, source, endpoint}`:
    - `masked` keeps the last 4 characters.
    - `source` is `env`, `config` or `none`, depending on which value the adapter would use.
    - `endpoint` is `/v1` on the profile's own listener, or `/p/<profile>/v1` when the profile is
      a multiplexed secondary.
  - `POST /api-key/generate?profile=`:
    - Creates a key with `secrets.token_urlsafe(32)`.
    - Refuses with 409 when `source` is `config`, explaining that the `config.yaml` key wins.
    - Requires the body flag `{rotate: true}` when a key already exists.
    - Does the presence check and the write under one per-profile lock, so two clicks cannot both
      pass the check.
    - Persists through `save_provider_env_credential`.
    - Allows 5 calls per 30 seconds per profile.
    - Writes an audit log line that names the key and profile but never the value.
    - Returns the full value once in the response.
  - `DELETE /api-key?profile=` removes the key through `remove_provider_env_credential`, with the
    same token, lock and audit rules.
  - There is no `/overview` route. The overview comes from core `GET /api/profiles`,
    `GET /api/status?profile=` and `GET /api/messaging/platforms?profile=`.
  <!-- Red Team: /overview duplicated core endpoints -->
- `bkt/packages/profiles/src/` contains:
  - `index.tsx`: a profile list on the left and a tabbed workbench on the right.
  - `SoulTab.tsx`: an editor and `MarkdownView` preview, with a diff and confirmation before
    saving.
  - `MessagingTab.tsx`: platform cards with configure, test and status, plus Telegram and
    WhatsApp onboarding wizards.
  - `PairingTab.tsx`: pending codes, approved users, and approve, revoke and clear actions. Every
    call goes through `profileRequest`.
  - `ApiKeyTab.tsx`:
    - Shows the masked key and its source.
    - Has generate and rotate buttons with confirmation, and a reveal-once dialog with copy.
    - Shows a card with the OpenAI-compatible base URL from `endpoint`, plus curl and Python
      samples that use `$API_SERVER_KEY` and never the real value.
    - Shows a warning and disables generate when the `config.yaml` key overrides `.env`.
    - States whether a gateway restart is needed: yes for a profile's own listener, no for a
      multiplexed secondary.
  - `OverviewTab.tsx`:
    - Covers clone (create from the source profile), export and import, the model picker,
      auto-describe, gateway and api_server status, and skill and toolset counts.
    - Export and import paths come from a `FolderPickerDialog` or a server-chosen default and
      are never free text.
- `tests/plugins/bkt_profiles/test_api_key.py` uses a temporary `HERMES_HOME` with two
  profiles. It covers:
  - Generation, rotation, the requirement for `rotate`, and masking.
  - Refusal when a `config.yaml` key shadows `.env`.
  - The endpoint for a multiplexed secondary.
  - The rate limit.
  - Requests without a token are refused.
  - Profile isolation: writing to profile A leaves profile B unchanged.
  - The strength check.
  - The audit line holds no key value.
- `tests/plugins/bkt_profiles/test_pairing_profile.py` approves a pending code on a non-launch
  profile through the same request shape the UI sends. It asserts that the launch profile's
  pairing store is unchanged.

## Steps

1. Trace how `profiles.py`, `ops.py`, `config_env.py` and `credential_lifecycle.py` resolve the
   profile. Confirm that `save_provider_env_credential` writes the scoped profile's `.env` when
   it is called inside the plugin route scope. Fill in the `profileRequest` table and record the
   imported helpers in `bkt/UPSTREAM-SEAMS.md`.
2. Write the backend and its tests. Prove the tests fail before the implementation exists.
3. Build the UI tabs.
4. Restart the dashboard (API routes mount at startup or on first request) and test end to end
   on two profiles, one of them a multiplexed secondary if multiplexing is available.

## Verification

- `scripts/run_tests.sh tests/plugins/bkt_profiles` is green.
- A key generated in the UI makes the api_server accept requests at the shown endpoint, after a
  gateway restart where the UI says one is needed.
- Responses and logs never contain the full key except in the single generate response.
- A pairing approval on profile B lands in B's store.

## Risks

- Writing `.env` while a profile's own gateway is running only takes effect after a restart. The
  UI says so, and offers the core restart action if one exists.
- `credential_lifecycle` is an internal module. It is listed in seams, and the phase 8 import
  test catches a rename.
