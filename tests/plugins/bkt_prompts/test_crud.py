"""bkt-prompts backend through the real dashboard app: CRUD, per-profile isolation, validation."""

from __future__ import annotations

import pytest


@pytest.fixture
def client(monkeypatch, _isolate_hermes_home):
    from starlette.testclient import TestClient

    import hermes_state
    from hermes_cli import profiles
    from hermes_cli.web_server import _SESSION_HEADER_NAME, _SESSION_TOKEN, app
    from hermes_constants import get_hermes_home

    home = get_hermes_home()
    monkeypatch.setattr(hermes_state, "DEFAULT_DB_PATH", home / "state.db")
    monkeypatch.setattr(profiles, "_get_default_hermes_home", lambda: home)
    monkeypatch.setattr(profiles, "_get_profiles_root", lambda: home / "profiles")
    for name in ("alpha", "beta"):
        (home / "profiles" / name).mkdir(parents=True)
        (home / "profiles" / name / "config.yaml").write_text("{}\n", encoding="utf-8")

    from agent.secret_scope import is_multiplex_active, set_multiplex_active
    previous = is_multiplex_active()
    with TestClient(app) as test_client:
        test_client.headers[_SESSION_HEADER_NAME] = _SESSION_TOKEN
        yield test_client
    set_multiplex_active(previous)


URL = "/api/plugins/bkt-prompts/prompts"


def _create(client, profile, **fields):
    body = {"title": "Summarise", "body": "Summarise {{topic}} for {{ audience }} about {{topic}}", "tags": ["work"]}
    body.update(fields)
    return client.post(URL, params={"profile": profile}, json=body)


def test_crud_round_trip(client):
    created = _create(client, "alpha")
    assert created.status_code == 200, created.text
    prompt = created.json()
    assert prompt["variables"] == ["topic", "audience"]
    assert prompt["tags"] == ["work"]

    listed = client.get(URL, params={"profile": "alpha"}).json()["prompts"]
    assert [p["id"] for p in listed] == [prompt["id"]]

    updated = client.put(f"{URL}/{prompt['id']}", params={"profile": "alpha"},
                         json={"title": "Renamed", "body": "Plain body", "tags": []})
    assert updated.status_code == 200, updated.text
    assert updated.json()["title"] == "Renamed"
    assert updated.json()["variables"] == []

    assert client.delete(f"{URL}/{prompt['id']}", params={"profile": "alpha"}).status_code == 200
    assert client.get(URL, params={"profile": "alpha"}).json()["prompts"] == []
    assert client.delete(f"{URL}/{prompt['id']}", params={"profile": "alpha"}).status_code == 404


def test_prompts_are_per_profile(client):
    prompt = _create(client, "alpha").json()
    assert client.get(URL, params={"profile": "beta"}).json()["prompts"] == []
    assert client.put(f"{URL}/{prompt['id']}", params={"profile": "beta"},
                      json={"title": "x", "body": "y"}).status_code == 404
    assert len(client.get(URL, params={"profile": "alpha"}).json()["prompts"]) == 1


def test_import_lands_in_the_requested_profile(client):
    payload = {"prompts": [{"title": "A", "body": "a {{x}}"}, {"title": "B", "body": "b", "tags": ["t"]}]}
    imported = client.post(f"{URL}/import", params={"profile": "beta"}, json=payload)
    assert imported.status_code == 200, imported.text
    assert {p["title"] for p in client.get(URL, params={"profile": "beta"}).json()["prompts"]} == {"A", "B"}
    assert client.get(URL, params={"profile": "alpha"}).json()["prompts"] == []


@pytest.mark.parametrize("fields", [
    {"body": "x" * (64 * 1024 + 1)},
    {"title": "   "},
    {"tags": ["has/slash"]},
    {"tags": [""]},
    {"tags": ["x" * 41]},
    {"tags": [f"t{i}" for i in range(21)]},
])
def test_rejects_invalid_prompts(client, fields):
    assert _create(client, "alpha", **fields).status_code == 422
    assert client.get(URL, params={"profile": "alpha"}).json()["prompts"] == []


def test_requires_the_session_token(client):
    from hermes_cli.web_server import _SESSION_HEADER_NAME
    response = client.get(URL, params={"profile": "alpha"}, headers={_SESSION_HEADER_NAME: "wrong"})
    assert response.status_code == 401
