"""Shared fixtures for the bkt-dia plugin tests: a temp profile home and a local DIA query stub.

``dia_stub`` serves the two routes of the real service (``POST /api/v1/query`` and
``GET /api/v1/query/test``) on 127.0.0.1 and records every request. ``write_profile`` writes the
temp home's ``config.yaml`` / ``.env``; it enables ``security.allow_private_urls`` by default because
the stub is a loopback address, which the SSRF guard otherwise refuses.
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Optional

import pytest

import hermes_yaml as yaml

QUERY_PATH = "/api/v1/query"
HEALTH_PATH = "/api/v1/query/test"


@dataclass
class StubRequest:
    method: str
    path: str
    headers: dict[str, str]
    body: Any


@dataclass
class DiaStub:
    """Behaviour knobs for the stub; tests mutate them before calling the client."""

    base_url: str = ""
    status: int = 200
    payload: Any = field(default_factory=lambda: {
        "answer": "Công ty ACME, MST 0101234567, đang hoạt động.",
        "question": "",
        "type": "search_entity",
        "sources": [{"code": "0101234567", "name": "ACME"}],
    })
    raw_body: Optional[bytes] = None  # sent verbatim instead of ``payload`` (invalid JSON tests)
    hang: bool = False  # hold the response until teardown (timeout tests)
    redirect_to: Optional[str] = None  # answer the query with a 302 to this URL (redirect tests)
    requests: list[StubRequest] = field(default_factory=list)
    release: threading.Event = field(default_factory=threading.Event)

    def query_requests(self) -> list[StubRequest]:
        return [r for r in self.requests if r.path == QUERY_PATH]


def _handler_for(stub: DiaStub) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args: Any) -> None:  # keep test output clean
            return

        def _send(self, status: int, body: bytes) -> None:
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            stub.requests.append(StubRequest("GET", self.path, dict(self.headers), None))
            if self.path == HEALTH_PATH:
                self._send(200, json.dumps({"status": "success", "total_documents": 1}).encode())
            else:
                self._send(404, b'{"detail": "Not Found"}')

        def do_POST(self) -> None:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b""
            try:
                body = json.loads(raw or b"null")
            except ValueError:
                body = raw
            stub.requests.append(StubRequest("POST", self.path, dict(self.headers), body))
            if self.path != QUERY_PATH:
                self._send(404, b'{"detail": "Not Found"}')
                return
            if stub.redirect_to:
                self.send_response(302)
                self.send_header("Location", stub.redirect_to)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if stub.hang:
                stub.release.wait(30)
                return
            if stub.raw_body is not None:
                self._send(stub.status, stub.raw_body)
                return
            payload = stub.payload
            if isinstance(payload, dict) and "question" in payload and isinstance(body, dict):
                payload = {**payload, "question": body.get("question", "")}
            self._send(stub.status, json.dumps(payload, ensure_ascii=False).encode("utf-8"))

    return Handler


@pytest.fixture
def dia_stub():
    stub = DiaStub()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _handler_for(stub))
    server.daemon_threads = True
    stub.base_url = f"http://127.0.0.1:{server.server_address[1]}"
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield stub
    finally:
        stub.release.set()
        server.shutdown()
        server.server_close()
        thread.join(5)


@pytest.fixture
def hermes_home(tmp_path, monkeypatch) -> Path:
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.delenv("HERMES_ALLOW_PRIVATE_URLS", raising=False)
    from tools.url_safety import _reset_allow_private_cache

    _reset_allow_private_cache()
    yield home
    _reset_allow_private_cache()


@pytest.fixture
def write_profile(hermes_home) -> Callable[..., Path]:
    """Write the temp profile: ``enabled`` plugins, common ``settings``, private-URL opt-in, ``.env``."""

    def _write(*, enabled: tuple[str, ...] = ("bkt-dia-common",), disabled: tuple[str, ...] = (),
               settings: Optional[dict[str, Any]] = None, allow_private_urls: bool = True,
               env: Optional[dict[str, str]] = None) -> Path:
        cfg: dict[str, Any] = {"plugins": {"enabled": list(enabled), "disabled": list(disabled)},
                               "security": {"allow_private_urls": allow_private_urls}}
        if settings is not None:
            cfg["plugins"]["entries"] = {"bkt-dia-common": {"settings": settings}}
        (hermes_home / "config.yaml").write_text(yaml.safe_dump(cfg), encoding="utf-8")
        if env is not None:
            (hermes_home / ".env").write_text("".join(f"{k}={v}\n" for k, v in env.items()), encoding="utf-8")
        from tools.url_safety import _reset_allow_private_cache

        _reset_allow_private_cache()
        return hermes_home

    return _write
