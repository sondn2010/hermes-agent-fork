"""Shared fixtures: the bkt-files router mounted like the dashboard mounts it, over a temp tree.

Layout (all under ``tmp_path``)::

    user/                 Path.home()
      .hermes/            HERMES_HOME, with credential files, a plugins/ dir and one profile
      ws/                 the workspace most tests operate in
"""

from __future__ import annotations

import importlib.util
import io
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

PREFIX = "/api/plugins/bkt-files"
PLUGIN_FILE = Path(__file__).resolve().parents[3] / "plugins" / "bkt-files" / "dashboard" / "plugin_api.py"


def load_plugin():
    spec = importlib.util.spec_from_file_location("hermes_dashboard_plugin_bkt_files_test", PLUGIN_FILE)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


@dataclass
class Tree:
    root: Path
    user: Path
    home: Path
    profile: Path
    ws: Path


@pytest.fixture
def tree(tmp_path, monkeypatch) -> Tree:
    root = tmp_path.resolve()
    user = root / "user"
    home = user / ".hermes"
    profile = home / "profiles" / "alpha"
    ws = user / "ws"
    for directory in (home / "mcp-tokens", home / "pairing", home / "plugins", profile, ws):
        directory.mkdir(parents=True)
    (home / ".env").write_text("OPENAI_API_KEY=secret\n", encoding="utf-8")
    (home / "auth.json").write_text('{"token": "secret"}', encoding="utf-8")
    (home / "config.yaml").write_text("model: x\n", encoding="utf-8")
    (home / "mcp-tokens" / "server.json").write_text("{}", encoding="utf-8")
    (home / "pairing" / "telegram.json").write_text("{}", encoding="utf-8")
    (home / "notes.txt").write_text("hello", encoding="utf-8")
    (profile / "config.yaml").write_text("{}\n", encoding="utf-8")
    (profile / ".env").write_text("X=1\n", encoding="utf-8")

    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.delenv("HERMES_DASHBOARD_FILES_ROOT", raising=False)
    monkeypatch.setattr(Path, "home", lambda: user)
    return Tree(root=root, user=user, home=home, profile=profile, ws=ws)


@pytest.fixture
def plugin():
    """The plugin module behind ``client`` (for tests that drive a helper directly)."""
    return load_plugin()


@pytest.fixture
def client(tree, plugin) -> TestClient:
    """The router mounted as the dashboard mounts it, sending the session token like the SPA."""
    from hermes_cli.web_server import _SESSION_HEADER_NAME, _SESSION_TOKEN
    from hermes_cli.web_server_dashboard import _plugin_route_secret_scope

    app = FastAPI()
    app.include_router(plugin.router, prefix=PREFIX, dependencies=[Depends(_plugin_route_secret_scope)])
    test_client = TestClient(app)
    test_client.headers[_SESSION_HEADER_NAME] = _SESSION_TOKEN
    return test_client


@pytest.fixture
def locked(tree, monkeypatch) -> Path:
    """Lock the managed files root to the workspace."""
    monkeypatch.setenv("HERMES_DASHBOARD_FILES_ROOT", str(tree.ws))
    return tree.ws


def make_zip(members: list[tuple[str, bytes]], *, symlink: str | None = None) -> bytes:
    """Build an archive in memory. ``symlink`` adds a member whose mode marks it as a link."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in members:
            archive.writestr(zipfile.ZipInfo(name), data, compress_type=zipfile.ZIP_DEFLATED)
        if symlink is not None:
            info = zipfile.ZipInfo(symlink)
            info.create_system = 3
            info.external_attr = (0o120777 << 16)
            archive.writestr(info, "../../etc/passwd")
    return buffer.getvalue()


def snapshot(directory: Path) -> set[str]:
    return {str(p.relative_to(directory)) for p in directory.rglob("*")}
