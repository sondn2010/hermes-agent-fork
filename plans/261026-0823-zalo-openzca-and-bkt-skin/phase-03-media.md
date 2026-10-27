---
phase: 3
title: "Media both ways"
status: pending
priority: P2
effort: "0.5d"
dependencies: [1]
---

# Phase 3: Media both ways

## Goal

Inbound images, voice and files reach the agent as cached local files; the agent can send images
and files back.

## Context

- Inbound line fields: `mediaKind` (`image|video|audio|file`), `mediaPath(s)` (already downloaded by
  openzca), `mediaUrl(s)`, `mediaType(s)`. openzca prefixes `content` with
  `[media attached: ...]` lines (researcher report §3, §5).
- Hermes caches: `cache_image_from_bytes`, `cache_image_from_url`, `cache_audio_from_bytes`,
  `cache_audio_from_url`, `cache_document_from_bytes`, `cache_video_from_bytes`
  (`gateway/platforms/base.py:620-1484`), plus `cache_media_bytes_async` (`:1552-1566`) which
  classifies by MIME and extension and covers all kinds including video. `validate_inbound_media_size`
  (`base.py:501`), path containment pattern (`base.py:1476-1479`), SSRF-safe helpers (`base.py:639-645`
  and `ssrf_redirect_guard` `:466`). `MessageEvent.media_urls` / `media_types`
  (`gateway/platforms/event.py:73-74`).
- Outbound: `send_image(chat_id, image_url, caption, reply_to, metadata)` (`base.py:2988`),
  `send_document(chat_id, file_path, caption, file_name, ...)` (`base.py:3166`), `send_voice`
  (`base.py:3035`). openzca `msg image <thread> [file] [-m caption] [-g]`,
  `msg upload <file> <thread> [-g]` (goes through the listener IPC). `msg voice` with a local file
  and `msg video` disrupt or refuse the running listener, so they are not used.
  **Never use `msg image -u <url>`**: openzca fetches URLs with a bare `fetch()` that has no SSRF
  guard; download first via `gateway.media_fetch.fetch_remote_media` (`base.py:1159`), then pass
  the local path.

## Files to create / modify

- Create: `plugins/platforms/zalo/media.py`.
- Modify: `plugins/platforms/zalo/openzca_proc.py` — add `OPENZCA_LISTEN_MEDIA_DIR` to the child env,
  pointing at a Hermes-owned directory under `get_hermes_home()/cache/zalo-inbound`.
- Modify: `plugins/platforms/zalo/adapter.py` — inbound media hook; `send_image`, `send_document`,
  `send_voice`, `send_video` overrides.
- Create: `tests/plugins/platforms/zalo/test_media.py`.

## Tasks & Steps

1. [ ] `media.py::collect_inbound(line) -> (paths, types, message_type)`: called for **every
       parsed line** (routed or dropped) so unrouted-message media does not accumulate on disk.
       For each `mediaPath`: resolve the path, verify it is inside the Hermes-owned inbound dir
       (`<HERMES_HOME>/cache/zalo-inbound/`) and is not a symlink (containment pattern from
       `base.py:1476-1479`); `os.stat` to get size, call `validate_inbound_media_size` before
       reading; use `await asyncio.to_thread(path.read_bytes)` to avoid blocking the event loop;
       pass bytes through `cache_media_bytes_async` (`:1552-1566`) which classifies by extension
       and MIME and covers all kinds including video; delete the openzca copy in a `finally` block
       after the cache write succeeds (on failure log and still delete to prevent leaks). Fall back
       to `mediaUrl` using the SSRF-safe `*_from_url` helpers only — no bare `httpx` download.
       Skip stickers with no URL.
2. [ ] `strip_media_markers(content)`: drop the `[media attached...]` lines so the agent sees only
       the caption.
3. [ ] `send_image`: local path → `msg image <thread> <path> [-m caption] [-g]`; `http(s)` URL →
       download via `gateway.media_fetch.fetch_remote_media` (`base.py:1159`) through the
       SSRF-safe client to a temp file, then pass the local path to `msg image`. Never pass
       `-u <url>` to openzca (bypasses all SSRF guards).
4. [ ] `send_document`, `send_voice`, `send_video`: check that the listener is in a healthy state
       (not absent or in restart backoff) before spawning `msg upload`; if the listener is absent,
       return a retryable failure rather than spawning an upload that will open its own websocket
       and trigger a duplicate-connection kick (close code 3000). When healthy:
       `msg upload <path> <thread> [-g]`, then send the caption as text if present.
5. [ ] All media sends share the phase 1 send lock and gap.
6. [ ] Tests: image line with `mediaPath` produces a cached path in `media_urls` and removes the
       source file; URL-only fallback; file line maps to `DOCUMENT`; `send_image` with a path and
       with a URL builds the right argv; `send_voice` uses `msg upload`.

## Verification

- `scripts/run_tests.sh tests/plugins/platforms/zalo/`

## Risks / rollback

Zalo CDN URL expiry is unknown; the `mediaPath` path avoids depending on it.
