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
  `cache_audio_from_url`, `cache_document_from_bytes` (`gateway/platforms/base.py:620-1484`),
  `validate_inbound_media_size` (`base.py:501`). `MessageEvent.media_urls` / `media_types`
  (`gateway/platforms/event.py:73-74`).
- Outbound: `send_image(chat_id, image_url, caption, reply_to, metadata)` (`base.py:2988`),
  `send_document(chat_id, file_path, caption, file_name, ...)` (`base.py:3166`), `send_voice`
  (`base.py:3035`). openzca `msg image <thread> [file] [-u URL] [-m caption] [-g]`,
  `msg upload <file> <thread> [-g]` (goes through the listener IPC). `msg voice` with a local file
  and `msg video` disrupt or refuse the running listener, so they are not used.

## Files to create / modify

- Create: `plugins/platforms/zalo/media.py`.
- Modify: `plugins/platforms/zalo/openzca_proc.py` — add `OPENZCA_LISTEN_MEDIA_DIR` to the child env,
  pointing at a Hermes-owned directory under `get_hermes_home()/cache/zalo-inbound`.
- Modify: `plugins/platforms/zalo/adapter.py` — inbound media hook; `send_image`, `send_document`,
  `send_voice`, `send_video` overrides.
- Create: `tests/plugins/platforms/zalo/test_media.py`.

## Tasks & Steps

1. [ ] `media.py::collect_inbound(line) -> (paths, types, message_type)`: for each `mediaPath`, read
       bytes, check size, copy into the matching Hermes cache, then delete the openzca copy (the
       directory is Hermes-owned now); fall back to `mediaUrl` through the `*_from_url` helpers, or
       an `httpx` download plus `cache_document_from_bytes` for files. Map `image→PHOTO`,
       `audio→VOICE`, `video→VIDEO`, `file→DOCUMENT`. Skip stickers with no URL.
2. [ ] `strip_media_markers(content)`: drop the `[media attached...]` lines so the agent sees only
       the caption.
3. [ ] `send_image`: local path → `msg image <thread> <path> [-m caption] [-g]`; `http(s)` URL →
       `msg image <thread> -u <url> ...`.
4. [ ] `send_document`, `send_voice`, `send_video`: `msg upload <path> <thread> [-g]`, then send the
       caption as text if present.
5. [ ] All media sends share the phase 1 send lock and gap.
6. [ ] Tests: image line with `mediaPath` produces a cached path in `media_urls` and removes the
       source file; URL-only fallback; file line maps to `DOCUMENT`; `send_image` with a path and
       with a URL builds the right argv; `send_voice` uses `msg upload`.

## Verification

- `scripts/run_tests.sh tests/plugins/platforms/zalo/`

## Risks / rollback

Zalo CDN URL expiry is unknown; the `mediaPath` path avoids depending on it.
