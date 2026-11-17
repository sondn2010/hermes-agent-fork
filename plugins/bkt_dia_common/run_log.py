"""Per-profile log of bkt-dia tool runs, from the agent and from the dashboard console.

Rows live in ``plugin_db("bkt-dia-common", "runs.db")``, which resolves ``get_hermes_home()`` on
every call, so each profile keeps its own log. A connection is opened per call and closed before
returning: a module-level one would pin the launch profile's file and hold a Windows file lock.

A row stores what ran and how it ended, plus a redacted 200-character preview of the question.
It never stores the answer, sources, the endpoint or the API key. The log is pruned to the newest
:data:`MAX_ROWS` rows once it grows :data:`PRUNE_SLACK` past that, so most inserts never delete.
"""

from __future__ import annotations

import logging
import sqlite3
import time
from contextlib import closing
from typing import Any, Mapping, Optional

from plugins.plugin_storage import plugin_db
from plugins.bkt_dia_common.settings import PLUGIN_ID

logger = logging.getLogger(__name__)

DB_FILENAME = "runs.db"
MAX_ROWS = 500
PRUNE_SLACK = 50
PREVIEW_CHARS = 200

_SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY,
    at REAL NOT NULL,
    module TEXT NOT NULL,
    tool TEXT NOT NULL,
    source TEXT NOT NULL,
    ok INTEGER NOT NULL,
    stage TEXT,
    error TEXT,
    duration_ms INTEGER NOT NULL,
    question_preview TEXT
)
"""
_COLUMNS = ("id", "at", "module", "tool", "source", "ok", "stage", "error", "duration_ms", "question_preview")


def _open() -> sqlite3.Connection:
    conn = plugin_db(PLUGIN_ID, DB_FILENAME)
    try:
        conn.execute(_SCHEMA)
    except sqlite3.Error:
        conn.close()
        raise
    return conn


def question_preview(question: Optional[str]) -> Optional[str]:
    """The stored form of a question: secrets redacted first, then cut to :data:`PREVIEW_CHARS`."""
    if not question:
        return None
    from agent.redact import redact_sensitive_text

    return redact_sensitive_text(question, force=True, redact_url_credentials=True)[:PREVIEW_CHARS]


def record(entry: Mapping[str, Any]) -> None:
    """Append one run. ``entry`` keys: ``module``, ``tool``, ``source``, ``ok``, ``stage``, ``error``,
    ``duration_ms``, ``question``. A storage failure is logged and swallowed: the log must never
    break the tool call it describes."""
    row = (time.time(), str(entry["module"]), str(entry["tool"]), str(entry["source"]),
           1 if entry.get("ok") else 0, entry.get("stage"), entry.get("error"),
           int(entry.get("duration_ms") or 0), question_preview(entry.get("question")))
    try:
        with closing(_open()) as conn, conn:
            cursor = conn.execute(
                "INSERT INTO runs (at, module, tool, source, ok, stage, error, duration_ms, question_preview)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", row)
            if cursor.lastrowid is not None and cursor.lastrowid > MAX_ROWS + PRUNE_SLACK:
                _prune(conn)
    except (sqlite3.Error, OSError) as exc:
        logger.debug("bkt-dia run log write failed: %s", exc)


def _prune(conn: sqlite3.Connection) -> None:
    (count,) = conn.execute("SELECT COUNT(*) FROM runs").fetchone()
    if count > MAX_ROWS + PRUNE_SLACK:
        conn.execute("DELETE FROM runs WHERE id NOT IN (SELECT id FROM runs ORDER BY id DESC LIMIT ?)",
                     (MAX_ROWS,))


def recent(limit: int = 50) -> list[dict[str, Any]]:
    """The newest runs first, at most *limit* (clamped to 1..:data:`MAX_ROWS`)."""
    limit = max(1, min(int(limit), MAX_ROWS))
    try:
        with closing(_open()) as conn:
            rows = conn.execute(f"SELECT {', '.join(_COLUMNS)} FROM runs ORDER BY id DESC LIMIT ?",
                                (limit,)).fetchall()
    except (sqlite3.Error, OSError) as exc:
        logger.debug("bkt-dia run log read failed: %s", exc)
        return []
    return [{**dict(zip(_COLUMNS, row)), "ok": bool(row[5])} for row in rows]
