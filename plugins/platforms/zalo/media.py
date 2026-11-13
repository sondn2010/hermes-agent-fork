"""Zalo inbound media: move openzca's downloaded copies into the Hermes media cache.

openzca downloads attachments into ``OPENZCA_LISTEN_MEDIA_DIR`` before it emits the line and never
prunes them, so every parsed line goes through ``collect_inbound`` (routed) or ``discard_inbound``
(dropped), and both always delete the copy they were handed. Only files that resolve inside that Hermes-owned directory are
read; a ``mediaPath`` pointing anywhere else is ignored, never read or deleted.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import re
from pathlib import Path
from typing import Any, Optional

import httpx

from gateway.platforms.base import (
    CachedMedia, cache_audio_from_url, cache_image_from_url, cache_media_bytes_async,
    validate_inbound_media_size,
)
from gateway.platforms.event import MessageType

logger = logging.getLogger(__name__)

_MEDIA_MARKER_RE = re.compile(r"^\s*\[media attached\b[^\n]*$", re.MULTILINE)
# openzca ``mediaKind`` -> cache_media_bytes ``default_kind`` hint.
_KIND_HINT = {"image": "image", "video": "video", "audio": "audio", "file": None}
_MESSAGE_TYPE = {"image": MessageType.PHOTO, "video": MessageType.VIDEO,
                 "audio": MessageType.VOICE, "document": MessageType.DOCUMENT}
# URL fallback exists only where Hermes has an SSRF-guarded, size-capped downloader.
_URL_CACHERS = {"image": (".jpg", "image/jpeg"), "audio": (".m4a", "audio/mp4")}


def _as_list(line: dict, plural: str, singular: str) -> list[str]:
    values = line.get(plural)
    if isinstance(values, list):
        return [str(v) for v in values if v]
    value = line.get(singular)
    return [str(value)] if value else []


def _contained_file(raw: str, inbound_dir: Path) -> Optional[Path]:
    """``raw`` as a regular, non-symlink file inside ``inbound_dir``, else None."""
    path = Path(raw)
    if not path.is_absolute() or path.is_symlink():
        return None
    try:
        resolved = path.resolve(strict=True)
    except (OSError, RuntimeError):
        return None
    if not resolved.is_relative_to(inbound_dir.resolve()) or not resolved.is_file():
        return None
    return resolved


async def _cache_local(path: Path, mime: str, kind_hint: Optional[str]) -> Optional[CachedMedia]:
    validate_inbound_media_size(os.stat(path).st_size, media_type=kind_hint or "document")
    data = await asyncio.to_thread(path.read_bytes)
    return await cache_media_bytes_async(data, filename=path.name, mime_type=mime, default_kind=kind_hint)


async def _collect_paths(line: dict, inbound_dir: Path, kind_hint: Optional[str]) -> list[CachedMedia]:
    cached: list[CachedMedia] = []
    mimes = _as_list(line, "mediaTypes", "mediaType")
    for index, raw in enumerate(_as_list(line, "mediaPaths", "mediaPath")):
        path = _contained_file(raw, inbound_dir)
        if path is None:
            logger.warning("Zalo: ignoring inbound media path outside the inbound directory")
            continue
        try:
            item = await _cache_local(path, mimes[index] if index < len(mimes) else "", kind_hint)
            if item is not None:
                cached.append(item)
        except (OSError, ValueError) as exc:
            logger.warning("Zalo: dropped inbound attachment: %s", exc)
        finally:
            with contextlib.suppress(OSError):
                path.unlink()
    return cached


async def _collect_urls(line: dict, kind: str) -> list[tuple[str, str, str]]:
    cacher = _URL_CACHERS.get(kind)
    if cacher is None:
        return []
    ext, mime = cacher
    # Resolved per call (not bound into the table) so the module-level helper stays the one seam.
    fetch = cache_image_from_url if kind == "image" else cache_audio_from_url
    out: list[tuple[str, str, str]] = []
    for url in _as_list(line, "mediaUrls", "mediaUrl"):
        try:
            out.append((await fetch(url, ext), mime, kind))
        except (ValueError, OSError, httpx.HTTPError) as exc:  # SSRF refusal, size cap, network
            logger.warning("Zalo: inbound %s URL fallback failed: %s", kind, type(exc).__name__)
    return out


async def collect_inbound(line: dict[str, Any], inbound_dir: Path) -> tuple[list[str], list[str], MessageType]:
    """Cache a line's attachments -> ``(paths, mime_types, message_type)``.

    Downloaded copies (``mediaPath``) win; when none could be read, ``mediaUrl`` is fetched through
    the SSRF-safe cache helpers (images and audio only). Stickers carry no URL and yield nothing.
    """
    kind = str(line.get("mediaKind") or "")
    has_paths = bool(_as_list(line, "mediaPaths", "mediaPath"))
    if not kind and not has_paths:
        return [], [], MessageType.TEXT
    cached = [(c.path, c.media_type, c.kind)
              for c in await _collect_paths(line, inbound_dir, _KIND_HINT.get(kind))]
    if not cached and kind:
        cached = await _collect_urls(line, kind)
    if not cached:
        return [], [], MessageType.TEXT
    return ([p for p, _, _ in cached], [m for _, m, _ in cached],
            _MESSAGE_TYPE.get(cached[0][2], MessageType.DOCUMENT))


def discard_inbound(line: dict[str, Any], inbound_dir: Path) -> None:
    """Delete a dropped line's downloaded copies (self, unaddressed or unroutable lines)."""
    for raw in _as_list(line, "mediaPaths", "mediaPath"):
        path = _contained_file(raw, inbound_dir)
        if path is not None:
            with contextlib.suppress(OSError):
                path.unlink()


def strip_media_markers(content: str) -> str:
    """Drop openzca's ``[media attached...]`` lines so the agent sees only the caption."""
    return _MEDIA_MARKER_RE.sub("", content or "").strip()
