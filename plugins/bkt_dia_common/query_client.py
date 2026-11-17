"""Fail-closed client for the DIA ES query service (``POST {endpoint}/api/v1/query``).

``query(question)`` and ``health()`` never raise and never fabricate data. A failure is
``{"ok": False, "error", "hint", "stage"}`` where ``stage`` names the check that refused it:
``validate``, ``disabled``, ``config``, ``url_safety``, ``network``, ``http`` or ``response``. The
order of checks is load-bearing: the opt-in gate and the configuration checks run before any
network I/O, and the SSRF check runs before the request. ``_resolve_target`` resolves DNS for the
SSRF check, so async callers run these functions in a worker thread.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Mapping
from urllib.parse import urlsplit

import httpx

from plugins.bkt_dia_common.settings import (
    API_KEY_ENV,
    PLUGIN_ID,
    DiaSettings,
    is_common_enabled,
    load_settings,
    query_url,
)

logger = logging.getLogger(__name__)

MAX_QUESTION_CHARS = 4000
HEALTH_SUFFIX = "/test"  # GET {query_url}/test: the service's own health route
_ENDPOINT_HINT = f"check plugins.entries.{PLUGIN_ID}.settings.endpoint and that the service is running"


def _fail(error: str, hint: str, stage: str) -> dict[str, Any]:
    return {"ok": False, "error": error, "hint": hint, "stage": stage}


@dataclass(frozen=True)
class _Target:
    url: str
    settings: DiaSettings

    def headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.settings.api_key:
            headers["Authorization"] = f"Bearer {self.settings.api_key}"
        return headers


def _endpoint_refused_by_url_safety(url: str) -> bool:
    """True when the configured endpoint must not be dialed.

    The endpoint is operator configuration, so a private or loopback service is allowed without
    the global ``security.allow_private_urls``; only the always-blocked floor applies (cloud
    metadata by IP or by resolved hostname, and authorities another client could read differently).
    The floor check ignores userinfo, which is refused here first. ``is_always_blocked_url``
    returns True when the URL is BLOCKED (the opposite polarity of ``is_safe_url``).
    """
    from tools.url_safety import is_always_blocked_url

    return "@" in urlsplit(url).netloc or is_always_blocked_url(url)


def _resolve_target() -> _Target | dict[str, Any]:
    """Gate, settings, endpoint and URL safety for the active profile: a target or a failure."""
    if not is_common_enabled():
        return _fail(f"{PLUGIN_ID} plugin is disabled", f"enable {PLUGIN_ID} in config or dashboard", "disabled")
    from agent.secret_scope import UnscopedSecretError

    try:
        settings = load_settings()
    except UnscopedSecretError as exc:  # multiplexed process with no profile secret scope bound
        logger.debug("bkt-dia settings resolution failed: %s", exc)
        return _fail("bkt-dia settings could not be resolved for this profile",
                     f"check plugins.entries.{PLUGIN_ID}.settings and {API_KEY_ENV} in this profile's .env",
                     "config")
    if not settings.endpoint:
        return _fail("bkt-dia endpoint not configured",
                     f"set plugins.entries.{PLUGIN_ID}.settings.endpoint", "config")
    try:
        url = query_url(settings.endpoint)
    except ValueError as exc:
        return _fail(f"bkt-dia endpoint is invalid: {exc}",
                     f"set plugins.entries.{PLUGIN_ID}.settings.endpoint to an http(s) base URL", "config")
    if _endpoint_refused_by_url_safety(url):
        return _fail("bkt-dia endpoint blocked by URL safety policy",
                     "the endpoint carries credentials, has an ambiguous host, or targets cloud metadata; "
                     "point it at the DIA query service host without a username or password",
                     "url_safety")
    return _Target(url, settings)


def _status_failure(status: int) -> dict[str, Any]:
    if status == 504:
        return _fail("bkt-dia query service timed out (HTTP 504)",
                     "the question was too broad or the index is slow; narrow it and retry later", "http")
    if status in (401, 403):
        return _fail(f"bkt-dia query service refused the request (HTTP {status})",
                     "check BKT_DIA_QUERY_API_KEY in this profile's .env", "http")
    if status >= 500:
        return _fail(f"bkt-dia query service error (HTTP {status})",
                     "the DIA service failed; report the outage instead of guessing an answer", "http")
    return _fail(f"bkt-dia query service rejected the request (HTTP {status})",
                 "check plugins.entries.bkt-dia-common.settings.endpoint points at the DIA query service", "http")


def _send(target: _Target, method: str, url: str, **kwargs: Any) -> httpx.Response | dict[str, Any]:
    """One request without redirects (a redirect would bypass the SSRF check): a response or a failure."""
    timeout = target.settings.timeout_seconds
    try:
        return httpx.request(method, url, headers=target.headers(), timeout=timeout,
                             follow_redirects=False, **kwargs)
    except httpx.TimeoutException:
        return _fail(f"bkt-dia query service did not answer within {timeout:g}s",
                     "the service is slow or down; report it instead of guessing, or retry later", "network")
    except httpx.HTTPError as exc:
        logger.debug("bkt-dia transport error: %s", exc)
        return _fail("bkt-dia query service is unreachable", _ENDPOINT_HINT, "network")


_INVALID_JSON = object()


def _json_body(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return _INVALID_JSON


def _invalid_json() -> dict[str, Any]:
    return _fail("bkt-dia query service returned invalid JSON",
                 "check the endpoint points at the DIA query service, not another web server", "response")


def _parse_payload(response: httpx.Response, max_sources: int) -> dict[str, Any]:
    payload = _json_body(response)
    if payload is _INVALID_JSON:
        return _invalid_json()
    if not isinstance(payload, Mapping) or not isinstance(payload.get("answer"), str):
        return _fail("bkt-dia query service returned an unexpected response shape",
                     "expected {answer, question, type, sources}; check the service version", "response")
    raw_sources = payload.get("sources")
    sources = [s for s in raw_sources if isinstance(s, Mapping)] if isinstance(raw_sources, list) else []
    result: dict[str, Any] = {
        "ok": True,
        "answer": payload["answer"],
        "type": payload.get("type") if isinstance(payload.get("type"), str) else None,
        "sources": sources[:max_sources],
    }
    if len(sources) > max_sources:
        result["sources_omitted"] = len(sources) - max_sources
    return result


def query(question: str) -> dict[str, Any]:
    """Ask the DIA query service one natural-language question for the active profile."""
    if not isinstance(question, str) or not question.strip():
        return _fail("question is empty", "pass a non-empty question", "validate")
    question = question.strip()
    if len(question) > MAX_QUESTION_CHARS:
        return _fail(f"question is longer than {MAX_QUESTION_CHARS} characters", "shorten the question", "validate")
    target = _resolve_target()
    if isinstance(target, dict):
        return target
    response = _send(target, "POST", target.url, json={"question": question})
    if isinstance(response, dict):
        return response
    if not 200 <= response.status_code < 300:
        return _status_failure(response.status_code)
    return _parse_payload(response, target.settings.max_sources)


def _parse_health(response: httpx.Response) -> dict[str, Any]:
    payload = _json_body(response)
    if payload is _INVALID_JSON:
        return _invalid_json()
    if not isinstance(payload, Mapping) or not isinstance(payload.get("status"), str):
        return _fail("bkt-dia health check returned an unexpected response shape",
                     "expected {status, total_documents}; check the service version", "response")
    if payload["status"] != "success":
        # The service answers HTTP 200 even when its index is down; the body's status decides.
        return _fail(f"bkt-dia query service reported status {payload['status'][:80]!r}",
                     "the DIA service or its index is unhealthy; check the service logs", "response")
    documents = payload.get("total_documents")
    valid_count = isinstance(documents, int) and not isinstance(documents, bool)
    return {"ok": True, "status": payload["status"], "total_documents": documents if valid_count else None}


def health() -> dict[str, Any]:
    """``GET {query_url}/test`` for the active profile, with the same gates and SSRF rules as ``query``.

    Returns ``{"ok": True, "status", "total_documents", "latency_ms"}`` or a failure.
    """
    target = _resolve_target()
    if isinstance(target, dict):
        return target
    started = time.monotonic()
    response = _send(target, "GET", target.url + HEALTH_SUFFIX)
    if isinstance(response, dict):
        return response
    latency_ms = int((time.monotonic() - started) * 1000)
    if not 200 <= response.status_code < 300:
        return _status_failure(response.status_code)
    result = _parse_health(response)
    return {**result, "latency_ms": latency_ms} if result["ok"] else result
