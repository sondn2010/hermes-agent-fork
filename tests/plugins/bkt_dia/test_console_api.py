"""The bkt-dia-common dashboard API (``/api/plugins/bkt-dia-common/*``) the core ``/dia`` page uses.

The plugin router runs in a FastAPI app with the session-token dependency overridden, against a
temp profile home and the local DIA stub. Every agent tool call and console run goes through the
same ``run_query_tool`` path, so these tests also pin the run log and the URL-safety contract.
"""

from __future__ import annotations

import importlib
import json
import socket

import pytest

from plugins.bkt_dia_common import module_catalog
from plugins.bkt_dia_common.tool_factory import make_handler

PREFIX = "/api/plugins/bkt-dia-common"
MODULE = "bkt-dia-enterprise-profile"
TOOL = "bkt_dia_enterprise_profile_lookup"
API_KEY = "s3cret-dia-key-0123456789"


@pytest.fixture
def plugin_api():
    return importlib.import_module("plugins.bkt_dia_common.dashboard.plugin_api")


@pytest.fixture
def client(plugin_api, hermes_home):
    from fastapi import FastAPI
    from starlette.testclient import TestClient

    app = FastAPI()
    app.include_router(plugin_api.router, prefix=PREFIX)
    app.dependency_overrides[plugin_api._require_token] = lambda: None
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def configured(dia_stub, write_profile):
    """Common and the enterprise-profile module enabled; private URLs NOT globally allowed."""
    write_profile(enabled=("bkt-dia-common", MODULE), settings={"endpoint": dia_stub.base_url},
                  allow_private_urls=False, env={"BKT_DIA_QUERY_API_KEY": API_KEY})
    return dia_stub


def _run(client, arguments=None, *, module=MODULE, tool=TOOL):
    return client.post(f"{PREFIX}/run", json={"module": module, "tool": tool,
                                              "arguments": {"enterprise": "ACME"} if arguments is None else arguments})


def _assert_no_secrets(response, stub) -> None:
    host_port = stub.base_url.removeprefix("http://")
    assert API_KEY not in response.text
    assert host_port not in response.text


# --- auth ---------------------------------------------------------------------------------------

def test_routes_require_the_dashboard_token(plugin_api, hermes_home):
    from fastapi import FastAPI
    from starlette.testclient import TestClient

    app = FastAPI()
    app.include_router(plugin_api.router, prefix=PREFIX)
    with TestClient(app) as anonymous:
        assert anonymous.get(f"{PREFIX}/modules").status_code == 401
        assert anonymous.post(f"{PREFIX}/run", json={"module": MODULE, "tool": TOOL}).status_code == 401


# --- modules ------------------------------------------------------------------------------------

def test_modules_lists_all_twenty_and_tracks_enabled(client, write_profile, dia_stub):
    write_profile(enabled=("bkt-dia-common",), settings={})
    body = client.get(f"{PREFIX}/modules").json()
    assert body["common_enabled"] is True and body["endpoint_configured"] is False
    assert len(body["modules"]) == 20 and not any(m["enabled"] for m in body["modules"])
    assert body["categories"][0]["slug"] == "shared"
    module = next(m for m in body["modules"] if m["name"] == MODULE)
    assert set(module) >= {"name", "function_code", "category", "title", "description", "emoji", "enabled", "tools"}
    assert set(module["tools"][0]) == {"name", "description", "parameters"}

    write_profile(enabled=("bkt-dia-common", MODULE), settings={"endpoint": dia_stub.base_url},
                  env={"BKT_DIA_QUERY_API_KEY": API_KEY})
    response = client.get(f"{PREFIX}/modules")
    body = response.json()
    assert body["endpoint_configured"] is True
    assert [m["name"] for m in body["modules"] if m["enabled"]] == [MODULE]
    _assert_no_secrets(response, dia_stub)


# --- health -------------------------------------------------------------------------------------

def test_health_ok_against_loopback_without_private_url_opt_in(client, configured):
    response = client.get(f"{PREFIX}/health")

    body = response.json()
    assert body["ok"] is True and body["status"] == "success" and body["total_documents"] == 1
    assert isinstance(body["latency_ms"], int)
    [request] = configured.requests
    assert request.path == "/api/v1/query/test"
    assert request.headers["Authorization"] == f"Bearer {API_KEY}"
    _assert_no_secrets(response, configured)


def _closed_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


@pytest.mark.parametrize("settings, stage", [
    ({}, "config"),
    ({"endpoint": "ftp://dia.example"}, "config"),
    ({"endpoint": "http://169.254.169.254"}, "url_safety"),
    ({"endpoint": "http://metadata.google.internal"}, "url_safety"),
    ({"endpoint": "http://user:pw@127.0.0.1:9"}, "url_safety"),
])
def test_health_refused_before_any_request(client, write_profile, dia_stub, settings, stage):
    write_profile(settings=settings, allow_private_urls=False)

    body = client.get(f"{PREFIX}/health").json()

    assert body["ok"] is False and body["stage"] == stage and body["error"] and body["hint"]
    assert dia_stub.requests == []


def test_health_unreachable_is_a_network_failure(client, write_profile):
    write_profile(settings={"endpoint": f"http://127.0.0.1:{_closed_port()}"}, allow_private_urls=False)

    body = client.get(f"{PREFIX}/health").json()

    assert body["ok"] is False and body["stage"] == "network"


def test_health_non_2xx_is_an_http_failure(client, write_profile, dia_stub):
    write_profile(settings={"endpoint": dia_stub.base_url + "/not-dia"}, allow_private_urls=False)

    body = client.get(f"{PREFIX}/health").json()

    assert body["ok"] is False and body["stage"] == "http" and "HTTP 404" in body["error"]


@pytest.mark.parametrize("payload, fragment", [
    ({"status": "error", "message": "index down"}, "status 'error'"),
    (["not", "an", "object"], "unexpected response shape"),
    ({"total_documents": 3}, "unexpected response shape"),
])
def test_health_bad_body_is_a_response_failure(client, configured, payload, fragment):
    configured.health_payload = payload

    body = client.get(f"{PREFIX}/health").json()

    assert body["ok"] is False and body["stage"] == "response" and fragment in body["error"]


def test_health_refused_when_common_disabled(client, write_profile, dia_stub):
    write_profile(enabled=(MODULE,), settings={"endpoint": dia_stub.base_url})

    body = client.get(f"{PREFIX}/health").json()

    assert body["ok"] is False and body["stage"] == "disabled"
    assert dia_stub.requests == []


# --- run ----------------------------------------------------------------------------------------

def test_run_ok_returns_four_steps_answer_and_question(client, configured):
    response = _run(client)

    body = response.json()
    assert body["ok"] is True and body["function_code"] == "F015"
    assert body["answer"].startswith("Công ty ACME") and body["sources"]
    assert [(s["key"], s["status"]) for s in body["steps"]] == [
        ("validate", "ok"), ("build_question", "ok"), ("query", "ok"), ("result", "ok")]
    assert all(isinstance(s["ms"], int) for s in body["steps"])
    assert "ACME" in body["question"]
    assert configured.query_requests()[0].body == {"question": body["question"]}
    _assert_no_secrets(response, configured)


def test_run_missing_required_field_fails_validation_without_request(client, configured):
    body = _run(client, {}).json()

    assert body["ok"] is False and body["stage"] == "validate" and "enterprise" in body["error"]
    assert [s["status"] for s in body["steps"]] == ["error", "skipped", "skipped", "skipped"]
    assert "question" not in body
    assert configured.requests == []


def test_run_refused_for_disabled_module_without_request(client, write_profile, dia_stub):
    write_profile(enabled=("bkt-dia-common",), settings={"endpoint": dia_stub.base_url})

    response = _run(client)

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False and body["stage"] == "disabled" and body["function_code"] == "F015"
    assert [s["key"] for s in body["steps"]] == ["validate", "build_question", "query", "result"]
    assert dia_stub.requests == []


@pytest.mark.parametrize("module, tool", [
    (MODULE, "bkt_dia_enterprise_profile_nope"),
    ("bkt-dia-nope", TOOL),
    ("bkt-dia-common", TOOL),
])
def test_run_unknown_module_or_tool_is_404(client, configured, module, tool):
    assert _run(client, module=module, tool=tool).status_code == 404
    assert configured.requests == []


@pytest.mark.parametrize("arguments", [["not", "an", "object"], {"enterprise": "x" * (8 * 1024 + 1)}])
def test_run_rejects_non_object_or_oversized_arguments(client, configured, arguments):
    assert _run(client, arguments).status_code == 422
    assert configured.requests == []


def test_run_redirect_is_not_followed(client, configured):
    configured.redirect_to = "http://169.254.169.254/latest/meta-data/"

    body = _run(client).json()

    assert body["ok"] is False and body["stage"] == "http" and "HTTP 302" in body["error"]
    assert [s["status"] for s in body["steps"]][2:] == ["error", "skipped"]
    assert len(configured.requests) == 1


def test_run_bad_response_body_fails_the_result_step(client, configured):
    configured.payload = {"detail": "not an answer"}

    body = _run(client).json()

    assert body["stage"] == "response"
    assert [s["status"] for s in body["steps"]] == ["ok", "ok", "ok", "error"]


@pytest.mark.parametrize("endpoint", ["http://169.254.169.254", "http://metadata.google.internal/dia"])
def test_run_refuses_metadata_endpoint_with_url_safety(client, write_profile, dia_stub, endpoint):
    write_profile(enabled=("bkt-dia-common", MODULE), settings={"endpoint": endpoint}, allow_private_urls=False)

    body = _run(client).json()

    assert body["ok"] is False and body["stage"] == "url_safety"
    assert dia_stub.requests == []


@pytest.mark.parametrize("endpoint_of", [
    lambda base: base.replace("http://", "http://user:pw@"),
    lambda base: base + "\\evil.example",
])
def test_run_refuses_userinfo_or_ambiguous_endpoint(client, write_profile, dia_stub, endpoint_of):
    write_profile(enabled=("bkt-dia-common", MODULE), settings={"endpoint": endpoint_of(dia_stub.base_url)},
                  allow_private_urls=False)

    body = _run(client).json()

    assert body["ok"] is False and body["stage"] == "url_safety"
    assert dia_stub.requests == []


# --- runs ---------------------------------------------------------------------------------------

def _agent_call(arguments: dict) -> dict:
    module, tool = module_catalog.find_tool(MODULE, TOOL)
    return json.loads(make_handler(module, tool)(arguments, task_id="t1"))


def test_agent_tool_result_shape_is_unchanged_apart_from_stage(client, configured):
    ok = _agent_call({"enterprise": "ACME"})
    assert set(ok) == {"ok", "answer", "type", "sources", "function_code"}

    failed = _agent_call({})
    assert set(failed) == {"ok", "error", "hint", "stage", "function_code"}
    assert failed["stage"] == "validate"


def test_runs_lists_agent_and_console_runs_newest_first(client, configured):
    _agent_call({"enterprise": "Agent Co"})
    _run(client, {"enterprise": "Console Co"})
    _run(client, {})

    response = client.get(f"{PREFIX}/runs", params={"limit": 50})

    runs = response.json()["runs"]
    assert [(r["source"], r["ok"], r["stage"]) for r in runs] == [
        ("console", False, "validate"), ("console", True, None), ("agent", True, None)]
    assert all(r["module"] == MODULE and r["tool"] == TOOL for r in runs)
    assert "Console Co" in runs[1]["question_preview"] and "Agent Co" in runs[2]["question_preview"]
    assert set(runs[0]) == {"id", "at", "module", "tool", "source", "ok", "stage", "error", "duration_ms",
                            "question_preview"}
    # The answer is never stored, so it never comes back.
    assert "Công ty ACME" not in response.text
    _assert_no_secrets(response, configured)
    assert len(client.get(f"{PREFIX}/runs", params={"limit": 1}).json()["runs"]) == 1
    assert client.get(f"{PREFIX}/runs", params={"limit": 0}).status_code == 422


def test_runs_are_per_profile_home(client, configured, write_profile, hermes_home, tmp_path, monkeypatch):
    _run(client)
    other = tmp_path / "second-home"
    other.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(other))
    from tools.url_safety import _reset_allow_private_cache

    _reset_allow_private_cache()

    assert client.get(f"{PREFIX}/runs").json()["runs"] == []
    _agent_call({"enterprise": "ACME"})
    assert [r["source"] for r in client.get(f"{PREFIX}/runs").json()["runs"]] == ["agent"]

    monkeypatch.setenv("HERMES_HOME", str(hermes_home))
    assert [r["source"] for r in client.get(f"{PREFIX}/runs").json()["runs"]] == ["console"]


def test_answer_text_is_absent_from_the_run_log_file(client, configured, hermes_home):
    _run(client)

    log_file = hermes_home / "plugin-data" / "bkt-dia-common" / "runs.db"
    assert log_file.is_file()
    assert "Công ty ACME".encode() not in log_file.read_bytes()


# --- mounted by the real dashboard --------------------------------------------------------------

def test_real_dashboard_mounts_the_api_under_the_manifest_name(monkeypatch, _isolate_hermes_home):
    """Discovery derives the route from the manifest ``name``, and the session token is enforced."""
    from starlette.testclient import TestClient

    import hermes_state
    from hermes_cli import profiles
    from hermes_cli.web_server import _SESSION_HEADER_NAME, _SESSION_TOKEN, app
    from hermes_constants import get_hermes_home

    home = get_hermes_home()
    monkeypatch.setattr(hermes_state, "DEFAULT_DB_PATH", home / "state.db")
    monkeypatch.setattr(profiles, "_get_default_hermes_home", lambda: home)
    monkeypatch.setattr(profiles, "_get_profiles_root", lambda: home / "profiles")
    from agent.secret_scope import is_multiplex_active, set_multiplex_active

    previous = is_multiplex_active()
    try:
        with TestClient(app) as real:
            assert real.get(f"{PREFIX}/modules").status_code == 401
            real.headers[_SESSION_HEADER_NAME] = _SESSION_TOKEN
            response = real.get(f"{PREFIX}/modules")
    finally:
        set_multiplex_active(previous)

    assert response.status_code == 200, response.text
    assert len(response.json()["modules"]) == 20
