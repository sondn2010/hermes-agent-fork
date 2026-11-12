"""Dashboard plugins-hub rows carry the manifest ``tags`` list.

Real discovery against a temp ``HERMES_HOME``: a user plugin on disk with ``tags`` in its
``plugin.yaml`` surfaces them on its hub row; a manifest without tags (or with a malformed
non-list value) yields ``[]`` so clients can rely on the field always being a list.
"""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from hermes_cli import plugin_catalog as pc
import hermes_cli.web_server_dashboard as _web_server_dashboard


@pytest.fixture
def plugins_root(tmp_path, monkeypatch) -> Path:
    home = tmp_path / ".hermes"
    root = home / "plugins"
    root.mkdir(parents=True)
    monkeypatch.setenv("HERMES_HOME", str(home))
    # Keep the kill-list resolution offline: no live-catalog fetch during the hub rebuild.
    monkeypatch.setattr(pc, "_live_cache_path", lambda: tmp_path / "cache" / "plugin-catalog.json")
    monkeypatch.setattr(pc, "_live_fetch_failed_until", time.time() + 3600, raising=False)
    _web_server_dashboard._invalidate_plugins_hub_cache()
    yield root
    _web_server_dashboard._invalidate_plugins_hub_cache()


def _write_plugin(root: Path, name: str, extra_yaml: str = "") -> None:
    plugin_dir = root / name
    plugin_dir.mkdir()
    (plugin_dir / "plugin.yaml").write_text(
        f"name: {name}\nversion: 0.1.0\ndescription: {name} test plugin\n{extra_yaml}",
        encoding="utf-8",
    )
    (plugin_dir / "__init__.py").write_text("def register(ctx):\n    pass\n", encoding="utf-8")


def _rows_by_name() -> dict:
    payload = _web_server_dashboard._merged_plugins_hub(force_refresh=True)
    return {row["name"]: row for row in payload["plugins"]}


def test_hub_row_exposes_manifest_tags(plugins_root):
    _write_plugin(plugins_root, "bkt-tagged", "tags:\n  - bkt\n  - category:domain-lookup\n")

    rows = _rows_by_name()

    assert rows["bkt-tagged"]["tags"] == ["bkt", "category:domain-lookup"]


def test_hub_row_tags_default_to_empty_list(plugins_root):
    _write_plugin(plugins_root, "untagged-plugin")
    _write_plugin(plugins_root, "bad-tags-plugin", "tags: not-a-list\n")

    rows = _rows_by_name()

    assert rows["untagged-plugin"]["tags"] == []
    assert rows["bad-tags-plugin"]["tags"] == []
    # Every row (bundled ones included) carries the field.
    assert all(isinstance(row["tags"], list) for row in rows.values())


def test_hub_cache_still_serves_the_memoized_payload(plugins_root):
    _write_plugin(plugins_root, "bkt-cached", "tags: [bkt, 'category:shared']\n")

    first = _web_server_dashboard._merged_plugins_hub(force_refresh=True)
    second = _web_server_dashboard._merged_plugins_hub()

    assert second is first
    row = next(r for r in second["plugins"] if r["name"] == "bkt-cached")
    assert row["tags"] == ["bkt", "category:shared"]
