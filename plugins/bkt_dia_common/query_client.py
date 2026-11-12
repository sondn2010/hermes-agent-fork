"""Fail-closed client for the DIA ES query service (``POST {endpoint}/api/v1/query``).

``query(question)`` never raises and never fabricates data. It returns either
``{"ok": True, "answer", "type", "sources"[, "sources_omitted"]}`` or
``{"ok": False, "error", "hint"}``. The order of checks is load-bearing: the opt-in gate and the
configuration checks run before any network I/O, and the SSRF check runs before the request.
"""

from __future__ import annotations

import logging
from typing import Any, Mapping

import httpx

from plugins.bkt_dia_common.settings import API_KEY_ENV, PLUGIN_ID, is_common_enabled, load_settings, query_url

logger = logging.getLogger(__name__)

MAX_QUESTION_CHARS = 4000


def _fail(error: str, hint: str) -> dict[str, Any]:
    return {"ok": False, "error": error, "hint": hint}


def _status_failure(status: int) -> dict[str, Any]:
    if status == 504:
        return _fail("bkt-dia query service timed out (HTTP 504)",
                     "the question was too broad or the index is slow; narrow it and retry later")
    if status in (401, 403):
        return _fail(f"bkt-dia query service refused the request (HTTP {status})",
                     "check BKT_DIA_QUERY_API_KEY in this profile's .env")
    if status >= 500:
        return _fail(f"bkt-dia query service error (HTTP {status})",
                     "the DIA service failed; report the outage instead of guessing an answer")
    return _fail(f"bkt-dia query service rejected the request (HTTP {status})",
                 "check plugins.entries.bkt-dia-common.settings.endpoint points at the DIA query service")


def _parse_payload(response: httpx.Response, max_sources: int) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError:
        return _fail("bkt-dia query service returned invalid JSON",
                     "check the endpoint points at the DIA query service, not another web server")
    if not isinstance(payload, Mapping) or not isinstance(payload.get("answer"), str):
        return _fail("bkt-dia query service returned an unexpected response shape",
                     "expected {answer, question, type, sources}; check the service version")
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
        return _fail("question is empty", "pass a non-empty question")
    question = question.strip()
    if len(question) > MAX_QUESTION_CHARS:
        return _fail(f"question is longer than {MAX_QUESTION_CHARS} characters", "shorten the question")
    if not is_common_enabled():
        return _fail(f"{PLUGIN_ID} plugin is disabled", f"enable {PLUGIN_ID} in config or dashboard")
    from agent.secret_scope import UnscopedSecretError

    try:
        settings = load_settings()
    except UnscopedSecretError as exc:  # multiplexed process with no profile secret scope bound
        logger.debug("bkt-dia settings resolution failed: %s", exc)
        return _fail("bkt-dia settings could not be resolved for this profile",
                     f"check plugins.entries.{PLUGIN_ID}.settings and {API_KEY_ENV} in this profile's .env")
    if not settings.endpoint:
        return _fail("bkt-dia endpoint not configured",
                     f"set plugins.entries.{PLUGIN_ID}.settings.endpoint")
    try:
        url = query_url(settings.endpoint)
    except ValueError as exc:
        return _fail(f"bkt-dia endpoint is invalid: {exc}",
                     f"set plugins.entries.{PLUGIN_ID}.settings.endpoint to an http(s) base URL")

    from tools.url_safety import is_safe_url

    if not is_safe_url(url):
        return _fail("bkt-dia endpoint blocked by URL safety policy",
                     "the host did not resolve, carries credentials, or is a blocked address; cloud "
                     "metadata is always refused, and a private-network address needs "
                     "security.allow_private_urls: true")

    headers = {"Accept": "application/json"}
    if settings.api_key:
        headers["Authorization"] = f"Bearer {settings.api_key}"
    try:
        # follow_redirects=False: a redirect would bypass the SSRF check above.
        response = httpx.post(url, json={"question": question}, headers=headers,
                              timeout=settings.timeout_seconds, follow_redirects=False)
    except httpx.TimeoutException:
        return _fail(f"bkt-dia query service did not answer within {settings.timeout_seconds:g}s",
                     "the service is slow or down; report it instead of guessing, or retry later")
    except httpx.HTTPError as exc:
        logger.debug("bkt-dia query transport error: %s", exc)
        return _fail("bkt-dia query service is unreachable",
                     f"check plugins.entries.{PLUGIN_ID}.settings.endpoint and that the service is running")
    if not 200 <= response.status_code < 300:
        return _status_failure(response.status_code)
    return _parse_payload(response, settings.max_sources)
