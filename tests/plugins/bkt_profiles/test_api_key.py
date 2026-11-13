"""bkt-profiles API server key routes (plugins/bkt-profiles/dashboard/plugin_api.py).

The router is mounted the way the dashboard mounts plugin routers, behind
``_plugin_route_secret_scope``, so ``?profile=`` binds the requested profile's home and secret
scope exactly as in production. Two profiles: the launch (default) home and ``work``.
"""

from __future__ import annotations

import importlib.util
import json
import logging
import os
import sys
from pathlib import Path

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

PLUGIN = "bkt-profiles"
PREFIX = f"/api/plugins/{PLUGIN}"
REPO = Path(__file__).resolve().parents[3]
API_FILE = REPO / "plugins" / PLUGIN / "dashboard" / "plugin_api.py"


def _load_router():
    assert API_FILE.exists(), f"plugin api file missing: {API_FILE}"
    spec = importlib.util.spec_from_file_location("hermes_dashboard_plugin_bkt_profiles_test", API_FILE)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod.router


@pytest.fixture
def homes(_isolate_hermes_home):
    from hermes_constants import get_hermes_home

    default = get_hermes_home()
    work = default / "profiles" / "work"
    work.mkdir(parents=True)
    (work / "config.yaml").write_text("{}\n")  # profile identity marker
    return {"default": default, "work": work}


@pytest.fixture
def client(homes):
    from hermes_cli.web_server import _SESSION_HEADER_NAME, _SESSION_TOKEN
    from hermes_cli.web_server_dashboard import _plugin_route_secret_scope

    app = FastAPI()
    app.include_router(_load_router(), prefix=PREFIX, dependencies=[Depends(_plugin_route_secret_scope)])
    c = TestClient(app)
    c.headers[_SESSION_HEADER_NAME] = _SESSION_TOKEN
    return c


def _env_key(home: Path) -> str | None:
    env = home / ".env"
    if not env.exists():
        return None
    for line in env.read_text().splitlines():
        if line.startswith("API_SERVER_KEY="):
            return line.split("=", 1)[1].strip().strip("'\"")
    return None


def _write_config(home: Path, data: dict) -> None:
    # JSON is valid YAML; keeps the test free of a YAML writer dependency.
    (home / "config.yaml").write_text(json.dumps(data))


def _url(path: str, profile: str | None = None) -> str:
    return f"{PREFIX}{path}" + (f"?profile={profile}" if profile else "")


def test_absent_key_reports_none(client):
    r = client.get(_url("/api-key", "work"))
    assert r.status_code == 200, r.text
    assert r.json() == {"present": False, "masked": "", "strong": False, "source": "none",
                        "endpoint": "/p/work/v1", "base_url": "http://127.0.0.1:8642/p/work/v1"}


def test_generate_persists_masks_and_requires_rotate(client, homes):
    r = client.post(_url("/api-key/generate", "work"), json={})
    assert r.status_code == 200, r.text
    key = r.json()["key"]
    assert len(key) >= 40
    assert _env_key(homes["work"]) == key

    info = client.get(_url("/api-key", "work")).json()
    assert info["present"] is True and info["strong"] is True and info["source"] == "env"
    assert info["masked"].endswith(key[-4:])
    assert key not in info["masked"] and key[:-4] not in info["masked"]

    again = client.post(_url("/api-key/generate", "work"), json={})
    assert again.status_code == 409
    assert _env_key(homes["work"]) == key

    rotated = client.post(_url("/api-key/generate", "work"), json={"rotate": True})
    assert rotated.status_code == 200, rotated.text
    new_key = rotated.json()["key"]
    assert new_key != key and _env_key(homes["work"]) == new_key


def test_config_key_in_effect_refuses_generation(client, homes):
    cfg_key = "cfg-" + "A" * 40
    _write_config(homes["work"], {"gateway": {"standalone": True},
                                  "platforms": {"api_server": {"enabled": True, "extra": {"key": cfg_key}}}})

    info = client.get(_url("/api-key", "work")).json()
    assert info["source"] == "config" and info["present"] is True and info["strong"] is True
    assert cfg_key not in str(info)

    r = client.post(_url("/api-key/generate", "work"), json={"rotate": True})
    assert r.status_code == 409
    assert "config.yaml" in r.json()["detail"]
    assert _env_key(homes["work"]) is None


def test_usable_env_key_beats_config_key(client, homes):
    # gateway/config_env.py ``_api_server``: a usable API_SERVER_KEY overrides the YAML value.
    _write_config(homes["work"], {"gateway": {"standalone": True}, "platforms": {"api_server": {"key": "cfg-" + "A" * 40}}})
    env_key = "env-" + "B" * 40
    (homes["work"] / ".env").write_text(f"API_SERVER_KEY={env_key}\n")
    info = client.get(_url("/api-key", "work")).json()
    assert info["source"] == "env" and info["masked"].endswith("BBBB")


def test_named_profile_is_served_on_the_default_listener(client, homes):
    _write_config(homes["default"], {"platforms": {"api_server": {"extra": {"port": 9000}}}})
    # A secondary's own YAML key is never read on the shared listener.
    _write_config(homes["work"], {"platforms": {"api_server": {"extra": {"key": "cfg-" + "A" * 40}}}})

    work = client.get(_url("/api-key", "work")).json()
    assert work["endpoint"] == "/p/work/v1" and work["source"] == "none"
    assert work["base_url"] == "http://127.0.0.1:9000/p/work/v1"  # the default profile's listener
    assert client.get(_url("/api-key")).json()["endpoint"] == "/v1"
    assert client.post(_url("/api-key/generate", "work"), json={}).status_code == 200


def test_standalone_profile_uses_its_own_listener(client, homes):
    _write_config(homes["work"], {"gateway": {"standalone": True}})
    (homes["work"] / ".env").write_text("API_SERVER_PORT=8643\n")
    work = client.get(_url("/api-key", "work")).json()
    assert work["endpoint"] == "/v1" and work["base_url"] == "http://127.0.0.1:8643/v1"


def test_generate_rate_limited_per_profile(client):
    for _ in range(5):
        assert client.post(_url("/api-key/generate", "work"), json={"rotate": True}).status_code == 200
    assert client.post(_url("/api-key/generate", "work"), json={"rotate": True}).status_code == 429
    assert client.post(_url("/api-key/generate"), json={}).status_code == 200


def test_refused_generations_do_not_use_up_the_rate_limit(client):
    assert client.post(_url("/api-key/generate", "work"), json={}).status_code == 200
    for _ in range(6):
        assert client.post(_url("/api-key/generate", "work"), json={}).status_code == 409
    assert client.post(_url("/api-key/generate", "work"), json={"rotate": True}).status_code == 200


def test_requests_without_token_are_refused(client, homes):
    from hermes_cli.web_server import _SESSION_HEADER_NAME

    client.headers.pop(_SESSION_HEADER_NAME)
    assert client.get(_url("/api-key", "work")).status_code == 401
    assert client.post(_url("/api-key/generate", "work"), json={}).status_code == 401
    assert client.delete(_url("/api-key", "work")).status_code == 401
    assert _env_key(homes["work"]) is None


def test_write_to_one_profile_leaves_the_other_untouched(client, homes):
    (homes["default"] / ".env").write_text("API_SERVER_KEY=launch-" + "C" * 40 + "\n")
    key = client.post(_url("/api-key/generate", "work"), json={}).json()["key"]

    assert _env_key(homes["work"]) == key
    assert _env_key(homes["default"]) == "launch-" + "C" * 40
    assert os.environ.get("API_SERVER_KEY") != key

    assert client.delete(_url("/api-key", "work")).status_code == 200
    assert _env_key(homes["work"]) is None
    assert _env_key(homes["default"]) == "launch-" + "C" * 40


def test_weak_key_is_reported_and_fully_masked(client, homes):
    (homes["work"] / ".env").write_text("API_SERVER_KEY=short1\n")
    info = client.get(_url("/api-key", "work")).json()
    assert info["present"] is True and info["strong"] is False and info["source"] == "env"
    assert "short1" not in info["masked"] and "rt1" not in info["masked"]


def test_delete_removes_key_and_404s_when_absent(client, homes):
    client.post(_url("/api-key/generate", "work"), json={})
    assert client.delete(_url("/api-key", "work")).status_code == 200
    assert client.get(_url("/api-key", "work")).json()["present"] is False
    assert client.delete(_url("/api-key", "work")).status_code == 404


def test_unknown_profile_is_rejected(client):
    assert client.get(_url("/api-key", "ghost")).status_code == 404


def test_audit_lines_name_key_and_profile_but_never_the_value(client, caplog):
    caplog.set_level(logging.INFO)
    key = client.post(_url("/api-key/generate", "work"), json={}).json()["key"]
    client.delete(_url("/api-key", "work"))

    audit = [r.getMessage() for r in caplog.records if "bkt-profiles" in r.getMessage()]
    assert any("generate" in line and "API_SERVER_KEY" in line and "work" in line for line in audit)
    assert any("delete" in line and "work" in line for line in audit)
    assert all(key not in r.getMessage() for r in caplog.records)
