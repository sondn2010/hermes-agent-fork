"""GET /api/plugins/bkt-kanban-workflow/flow against a real kanban board in a temp HERMES_HOME.

The router is mounted the way the dashboard mounts every plugin router, behind
``_plugin_route_secret_scope``.
"""

from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from hermes_cli import kanban_db as kb
from hermes_cli.kanban_db_connect import connect_closing

PREFIX = "/api/plugins/bkt-kanban-workflow"


def _load_router():
    plugin_file = Path(__file__).resolve().parents[3] / "plugins" / "bkt-kanban-workflow" / "dashboard" / "plugin_api.py"
    spec = importlib.util.spec_from_file_location("hermes_dashboard_plugin_bkt_kanban_workflow_test", plugin_file)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod.router


@pytest.fixture
def kanban_home(tmp_path, monkeypatch):
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    kb.init_db()
    return home


@pytest.fixture
def client(kanban_home):
    from hermes_cli.web_server_dashboard import _plugin_route_secret_scope

    app = FastAPI()
    app.include_router(_load_router(), prefix=PREFIX, dependencies=[Depends(_plugin_route_secret_scope)])
    return TestClient(app)


def _task(title: str, assignee: str | None, parents: tuple[str, ...] = ()) -> str:
    with connect_closing() as conn:
        return kb.create_task(conn, title=title, assignee=assignee, parents=parents)


def _sql(statement: str, *params) -> None:
    with connect_closing() as conn:
        conn.execute(statement, params)
        conn.commit()


def _flow(client: TestClient, **params) -> dict:
    response = client.get(f"{PREFIX}/flow", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _edges(data: dict) -> set[tuple[str, str, int, str]]:
    return {(e["from"], e["to"], e["count"], e["kind"]) for e in data["edges"]}


def test_empty_board_has_no_flow(client):
    assert _flow(client) == {"nodes": [], "edges": []}


def test_linked_chain_becomes_profile_edges(client):
    a = _task("plan", "alice")
    b = _task("build", "bob", parents=(a,))
    _task("verify", "alice", parents=(b,))
    _task("docs", "bob", parents=(a,))

    data = _flow(client)

    assert _edges(data) == {("alice", "bob", 2, "link"), ("bob", "alice", 1, "link")}
    assert [n["profile"] for n in data["nodes"]] == ["alice", "bob"]


def test_reassignment_is_a_handoff_but_first_assignment_is_not(client):
    task = _task("triage", None)
    with connect_closing() as conn:
        kb.assign_task(conn, task, "alice")  # from nobody: not a handoff
        kb.assign_task(conn, task, "bob")
        kb.assign_task(conn, task, "bob")  # no-op re-assign: not a handoff

    assert _edges(_flow(client)) == {("alice", "bob", 1, "reassign")}


def test_self_loop_keeps_same_profile_edge(client):
    a = _task("draft", "alice")
    _task("polish", "alice", parents=(a,))

    data = _flow(client)

    assert _edges(data) == {("alice", "alice", 1, "link")}
    assert [n["profile"] for n in data["nodes"]] == ["alice"]


def test_unassigned_tasks_draw_no_edges_or_nodes(client):
    a = _task("inbox", None)
    b = _task("work", "bob", parents=(a,))
    _task("follow-up", None, parents=(b,))

    data = _flow(client)

    assert data["edges"] == []
    assert [n["profile"] for n in data["nodes"]] == ["bob"]


def test_node_counts_running_and_recently_done(client):
    now = int(time.time())
    running = _task("running", "alice")
    done_recent = _task("done recently", "alice")
    done_old = _task("done long ago", "alice")
    _sql("UPDATE tasks SET status = 'running' WHERE id = ?", running)
    _sql("UPDATE tasks SET status = 'done', completed_at = ? WHERE id = ?", now - 60, done_recent)
    _sql("UPDATE tasks SET status = 'done', completed_at = ? WHERE id = ?", now - 30 * 86400, done_old)

    windowed = _flow(client, since=now - 86400)["nodes"]
    all_time = _flow(client)["nodes"]

    assert windowed == [{"profile": "alice", "active": 1, "recent_done": 1}]
    assert all_time == [{"profile": "alice", "active": 1, "recent_done": 2}]


def test_since_window_drops_older_handoffs(client):
    now = int(time.time())
    old_parent = _task("old plan", "alice")
    old_child = _task("old build", "bob", parents=(old_parent,))
    new_parent = _task("new plan", "carol")
    _task("new build", "bob", parents=(new_parent,))
    moved = _task("moved", "alice")
    with connect_closing() as conn:
        kb.assign_task(conn, moved, "carol")
    _sql("UPDATE tasks SET created_at = ? WHERE id IN (?, ?)", now - 10 * 86400, old_parent, old_child)
    _sql("UPDATE task_events SET created_at = ? WHERE kind = 'assigned'", now - 10 * 86400)

    assert _edges(_flow(client, since=now - 86400)) == {("carol", "bob", 1, "link")}
    assert _edges(_flow(client)) == {
        ("alice", "bob", 1, "link"),
        ("carol", "bob", 1, "link"),
        ("alice", "carol", 1, "reassign"),
    }


def test_archived_tasks_are_left_out(client):
    a = _task("plan", "alice")
    b = _task("build", "bob", parents=(a,))
    _sql("UPDATE tasks SET status = 'archived' WHERE id = ?", b)

    assert _flow(client)["edges"] == []


def test_board_validation(client):
    assert client.get(f"{PREFIX}/flow", params={"board": "Not A Slug!"}).status_code == 400
    assert client.get(f"{PREFIX}/flow", params={"board": "missing-board"}).status_code == 404
    assert client.get(f"{PREFIX}/flow", params={"since": -1}).status_code == 422


def test_named_board_without_writes_is_not_created(client):
    kb.create_board("sprint")
    db_path = kb.kanban_db_path(board="sprint")
    existed = db_path.exists()

    assert _flow(client, board="sprint") == {"nodes": [], "edges": []}
    assert db_path.exists() == existed
