"""Behaviour contract of the shared DIA query client (``plugins.bkt_dia_common.query_client``).

Every call runs against a real local HTTP stub with a temp profile home; failures must come back
as ``{"ok": False, "error", "hint"}`` without fabricated data and, where the request is refused
locally, without any request reaching the service.
"""

from __future__ import annotations

import socket

import pytest

from plugins.bkt_dia_common.query_client import query
from plugins.bkt_dia_common.settings import load_settings, query_url


def _assert_failure(result: dict) -> None:
    assert result["ok"] is False
    assert result["error"] and result["hint"]
    assert "answer" not in result and "sources" not in result


def test_success_posts_question_and_returns_answer(dia_stub, write_profile):
    write_profile(settings={"endpoint": dia_stub.base_url})

    result = query("Thông tin doanh nghiệp ACME")

    assert result["ok"] is True
    assert result["answer"].startswith("Công ty ACME")
    assert result["type"] == "search_entity"
    assert result["sources"] == [{"code": "0101234567", "name": "ACME"}]
    [request] = dia_stub.query_requests()
    assert request.method == "POST"
    assert request.body == {"question": "Thông tin doanh nghiệp ACME"}


@pytest.mark.parametrize("suffix", ["", "/", "/api/v1", "/api/v1/", "/api/v1/query"])
def test_endpoint_forms_all_reach_query_route(dia_stub, write_profile, suffix):
    write_profile(settings={"endpoint": dia_stub.base_url + suffix})

    assert query("q")["ok"] is True
    assert len(dia_stub.query_requests()) == 1


def test_query_url_keeps_proxy_prefix_and_rejects_non_http():
    assert query_url("https://gw.example/dia/") == "https://gw.example/dia/api/v1/query"
    with pytest.raises(ValueError):
        query_url("ftp://gw.example")
    with pytest.raises(ValueError):
        query_url("not a url")


def test_unset_endpoint_fails_closed_without_request(dia_stub, write_profile):
    write_profile(settings={})

    result = query("q")

    _assert_failure(result)
    assert result["error"] == "bkt-dia endpoint not configured"
    assert result["hint"] == "set plugins.entries.bkt-dia-common.settings.endpoint"
    assert dia_stub.requests == []


def test_disabled_common_plugin_refuses_without_request(dia_stub, write_profile):
    write_profile(enabled=("bkt-dia-enterprise-profile",), settings={"endpoint": dia_stub.base_url})

    result = query("q")

    assert result == {"ok": False, "error": "bkt-dia-common plugin is disabled",
                      "hint": "enable bkt-dia-common in config or dashboard"}
    assert dia_stub.requests == []


def test_common_listed_in_disabled_wins(dia_stub, write_profile):
    write_profile(disabled=("bkt-dia-common",), settings={"endpoint": dia_stub.base_url})

    assert query("q")["error"] == "bkt-dia-common plugin is disabled"
    assert dia_stub.requests == []


@pytest.mark.parametrize("status", [500, 502, 503, 504])
def test_5xx_fails_closed(dia_stub, write_profile, status):
    write_profile(settings={"endpoint": dia_stub.base_url})
    dia_stub.status = status

    result = query("q")

    _assert_failure(result)
    assert f"HTTP {status}" in result["error"]


def test_redirect_is_not_followed(dia_stub, write_profile):
    """A redirect must never be followed: it would reach a target the SSRF check never saw."""
    write_profile(settings={"endpoint": dia_stub.base_url})
    dia_stub.redirect_to = "http://169.254.169.254/latest/meta-data/"

    result = query("q")

    _assert_failure(result)
    assert "HTTP 302" in result["error"]
    assert len(dia_stub.requests) == 1


def test_auth_rejection_points_at_api_key(dia_stub, write_profile):
    write_profile(settings={"endpoint": dia_stub.base_url})
    dia_stub.status = 401

    result = query("q")

    _assert_failure(result)
    assert "BKT_DIA_QUERY_API_KEY" in result["hint"]


def test_timeout_fails_closed(dia_stub, write_profile):
    write_profile(settings={"endpoint": dia_stub.base_url, "timeout_seconds": 0.5})
    dia_stub.hang = True

    result = query("q")

    _assert_failure(result)
    assert "did not answer within 0.5s" in result["error"]


def test_connection_refused_fails_closed(write_profile):
    with socket.socket() as probe:  # reserve a free loopback port, then release it: nothing listens there
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    write_profile(settings={"endpoint": f"http://127.0.0.1:{port}"})

    result = query("q")

    _assert_failure(result)
    assert result["error"] == "bkt-dia query service is unreachable"


def test_invalid_json_fails_closed(dia_stub, write_profile):
    write_profile(settings={"endpoint": dia_stub.base_url})
    dia_stub.raw_body = b"<html>not json</html>"

    result = query("q")

    _assert_failure(result)
    assert "invalid JSON" in result["error"]


def test_unexpected_shape_fails_closed(dia_stub, write_profile):
    write_profile(settings={"endpoint": dia_stub.base_url})
    dia_stub.payload = {"detail": "something else"}

    _assert_failure(query("q"))


def test_sources_truncated_to_max_sources(dia_stub, write_profile):
    write_profile(settings={"endpoint": dia_stub.base_url, "max_sources": 3})
    dia_stub.payload = {"answer": "many", "type": "list", "sources": [{"code": str(i)} for i in range(10)]}

    result = query("q")

    assert result["ok"] is True
    assert [s["code"] for s in result["sources"]] == ["0", "1", "2"]
    assert result["sources_omitted"] == 7


@pytest.mark.parametrize("endpoint", ["http://169.254.169.254", "http://metadata.google.internal"])
def test_cloud_metadata_refused_even_with_private_urls_allowed(write_profile, endpoint):
    write_profile(settings={"endpoint": endpoint}, allow_private_urls=True)

    result = query("q")

    _assert_failure(result)
    assert "URL safety" in result["error"]


def test_private_address_refused_without_opt_in(dia_stub, write_profile):
    write_profile(settings={"endpoint": dia_stub.base_url}, allow_private_urls=False)

    result = query("q")

    _assert_failure(result)
    assert "allow_private_urls" in result["hint"]
    assert dia_stub.requests == []


def test_bearer_header_sent_only_when_key_set(dia_stub, write_profile):
    write_profile(settings={"endpoint": dia_stub.base_url})
    assert query("q")["ok"] is True
    assert "Authorization" not in dia_stub.query_requests()[-1].headers

    write_profile(settings={"endpoint": dia_stub.base_url}, env={"BKT_DIA_QUERY_API_KEY": "s3cret-key"})
    assert query("q")["ok"] is True
    assert dia_stub.query_requests()[-1].headers["Authorization"] == "Bearer s3cret-key"


def test_settings_defaults_and_clamps(write_profile):
    write_profile(settings={"endpoint": " http://x ", "timeout_seconds": 600, "max_sources": "junk"})
    settings = load_settings()
    assert settings.endpoint == "http://x"
    assert settings.timeout_seconds == 60.0
    assert settings.max_sources == 20

    write_profile(settings={"endpoint": "http://x"})
    settings = load_settings()
    assert settings.timeout_seconds == 15.0
    assert settings.api_key is None


@pytest.mark.parametrize("question", ["", "   ", "x" * 4001])
def test_bad_question_rejected_before_any_request(dia_stub, write_profile, question):
    write_profile(settings={"endpoint": dia_stub.base_url})

    _assert_failure(query(question))
    assert dia_stub.requests == []
