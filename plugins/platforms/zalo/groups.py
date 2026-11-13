"""Zalo group mention guard: pure functions over openzca ``listen --raw`` lines, no I/O."""

from __future__ import annotations

import re
from typing import Any, Iterable

# openzca derives ``mentionIds`` by scanning every ``uid``/``id`` key in the content object, so a
# sticker (``{id, catId, type}``) yields a bogus mention of the sticker id. Only text types are
# trusted.
_TRUTHY_MSG_TYPES = {"webchat", "chat.text"}
_FALSY = {"0", "false", "no"}
_MENTION_ALL_UID = "-1"


def parse_require_mention(raw: Any) -> bool:
    """YAML bool or env string -> bool; only an explicit false-y value disables the guard."""
    if isinstance(raw, bool):
        return raw
    return str(raw).strip().lower() not in _FALSY


def _line_mentions(line: dict) -> list:
    mentions = line.get("mentions")
    if mentions is None:
        mentions = (line.get("metadata") or {}).get("mentions")
    return mentions if isinstance(mentions, list) else []


def _mention_ids(line: dict) -> Iterable[str]:
    ids = line.get("mentionIds")
    if ids is None:
        ids = (line.get("metadata") or {}).get("mentionIds")
    return [str(uid) for uid in ids] if isinstance(ids, list) else []


def is_reply_to_self(line: dict, own_uid: str) -> bool:
    quote = line.get("quote")
    return bool(own_uid) and isinstance(quote, dict) and str(quote.get("ownerId", "")) == own_uid


def is_addressed(line: dict, own_uid: str) -> bool:
    """True when a group line @mentions the bot (text types only) or replies to one of its
    messages. ``@all`` (uid ``-1``) does not count, so a broadcast never wakes the agent."""
    if not own_uid:
        return False
    if is_reply_to_self(line, own_uid):
        return True
    msg_type = line.get("msgType") or (line.get("metadata") or {}).get("msgType")
    if msg_type not in _TRUTHY_MSG_TYPES:
        return False
    return own_uid != _MENTION_ALL_UID and own_uid in _mention_ids(line)


def strip_self_mention(content: str, mentions: list, own_uid: str) -> str:
    """Remove the bot's own mention span(s) by ``pos``/``len``, then trim."""
    spans = []
    for mention in mentions or []:
        if not isinstance(mention, dict) or str(mention.get("uid", "")) != own_uid:
            continue
        try:
            pos, length = int(mention["pos"]), int(mention["len"])
        except (KeyError, TypeError, ValueError):
            continue
        if 0 <= pos and length > 0 and pos + length <= len(content):
            spans.append((pos, pos + length))
    for start, end in sorted(spans, reverse=True):
        content = content[:start] + content[end:]
    # Removing a mid-sentence mention leaves a double space behind.
    return re.sub(r" {2,}", " ", content).strip() if spans else content.strip()


def group_text(line: dict, own_uid: str) -> str:
    """The group line's text with the bot's own mention removed."""
    return strip_self_mention(str(line.get("content") or ""), _line_mentions(line), own_uid)
