"""bkt-kanban-workflow backend, mounted at /api/plugins/bkt-kanban-workflow/.

``GET /flow`` aggregates how kanban work moves between profiles. The bundled kanban plugin
only exposes link pairs and reassignment events per task (``GET /tasks/{id}``), so drawing
the graph from it would cost one request per task on every refresh. This route reads the
board directly instead, in three bounded aggregate ``SELECT`` statements, and never writes.

The table and column names it reads are recorded in ``bkt/UPSTREAM-SEAMS.md``.
"""

from __future__ import annotations

import asyncio
import sqlite3
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

from hermes_cli import kanban_db
from hermes_cli.kanban_db_connect import connect_closing

router = APIRouter()

# Upper bounds on what one /flow read returns; a board past these is truncated, not slow.
MAX_PROFILES = 500
MAX_EDGES = 2000

# Archived cards are hidden from every default board view, so they stay out of the graph too.
_NODES_SQL = """
SELECT assignee AS profile,
       SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status = 'done' AND completed_at >= :since THEN 1 ELSE 0 END) AS recent_done
FROM tasks
WHERE assignee IS NOT NULL AND assignee != '' AND status != 'archived'
GROUP BY assignee
ORDER BY assignee
LIMIT :limit
"""

# A parent -> child link is a handoff from the parent's assignee to the child's. Links carry
# no timestamp, so the child's creation time places the handoff in the window.
_LINK_EDGES_SQL = """
SELECT p.assignee AS src, c.assignee AS dst, COUNT(*) AS n
FROM task_links l
JOIN tasks p ON p.id = l.parent_id
JOIN tasks c ON c.id = l.child_id
WHERE p.assignee IS NOT NULL AND p.assignee != ''
  AND c.assignee IS NOT NULL AND c.assignee != ''
  AND p.status != 'archived' AND c.status != 'archived'
  AND c.created_at >= :since
GROUP BY p.assignee, c.assignee
ORDER BY n DESC, src, dst
LIMIT :limit
"""

# ``assigned`` events record {"assignee": new, "from": old}; only a move between two
# profiles is a handoff (first assignment and unassignment are not). json_valid guards the
# extraction, which only runs on rows that passed WHERE.
_REASSIGN_EDGES_SQL = """
SELECT json_extract(e.payload, '$.from') AS src,
       json_extract(e.payload, '$.assignee') AS dst,
       COUNT(*) AS n
FROM task_events e
JOIN tasks t ON t.id = e.task_id
WHERE e.kind = 'assigned' AND e.created_at >= :since AND t.status != 'archived'
  AND json_valid(e.payload)
  AND json_type(e.payload, '$.from') = 'text'
  AND json_type(e.payload, '$.assignee') = 'text'
  AND json_extract(e.payload, '$.from') != ''
  AND json_extract(e.payload, '$.assignee') != ''
  AND json_extract(e.payload, '$.from') != json_extract(e.payload, '$.assignee')
GROUP BY src, dst
ORDER BY n DESC, src, dst
LIMIT :limit
"""


def _resolve_board(board: Optional[str]) -> Optional[str]:
    """Normalise ``board`` (400 malformed, 404 unknown or archived); ``None`` = active board."""
    if not board:
        return None
    try:
        slug = kanban_db._normalize_board_slug(board)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if slug and slug != kanban_db.DEFAULT_BOARD:
        if not kanban_db.board_exists(slug) or kanban_db.read_board_metadata(slug).get("archived"):
            raise HTTPException(status_code=404, detail=f"board {slug!r} does not exist")
    return slug


def _query_flow(conn: sqlite3.Connection, since: int) -> dict[str, Any]:
    nodes: dict[str, dict[str, Any]] = {}

    def node(profile: str) -> dict[str, Any]:
        return nodes.setdefault(profile, {"profile": profile, "active": 0, "recent_done": 0})

    for row in conn.execute(_NODES_SQL, {"since": since, "limit": MAX_PROFILES}):
        entry = node(row["profile"])
        entry["active"] = int(row["active"] or 0)
        entry["recent_done"] = int(row["recent_done"] or 0)

    edges: list[dict[str, Any]] = []
    for kind, sql in (("link", _LINK_EDGES_SQL), ("reassign", _REASSIGN_EDGES_SQL)):
        for row in conn.execute(sql, {"since": since, "limit": MAX_EDGES}):
            src, dst = str(row["src"]), str(row["dst"])
            # A profile that only appears in history still needs a node to draw its edge.
            node(src)
            node(dst)
            edges.append({"from": src, "to": dst, "count": int(row["n"]), "kind": kind})

    return {"nodes": sorted(nodes.values(), key=lambda n: n["profile"]), "edges": edges}


def read_flow(board: Optional[str], since: Optional[int]) -> dict[str, Any]:
    """Profile-to-profile flow of ``board`` since the unix time ``since`` (``None`` = all time)."""
    slug = _resolve_board(board)
    # Read-only: a board that has never been written to has no flow, and opening it would
    # create its database file.
    if not kanban_db.kanban_db_path(board=slug).exists():
        return {"nodes": [], "edges": []}
    with connect_closing(board=slug) as conn:
        return _query_flow(conn, since or 0)


@router.get("/flow")
async def get_flow(
    board: Optional[str] = Query(None, description="Kanban board slug (omit for the active board)"),
    since: Optional[int] = Query(None, ge=0, description="Only count work since this unix time"),
):
    return await asyncio.to_thread(read_flow, board, since)
