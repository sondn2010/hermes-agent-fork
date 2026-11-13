"""The fork's bundled bkt-* dashboard plugins are discovered exactly, with valid entries."""

from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parents[3]

EXPECTED = {
    "bkt-brand", "bkt-author", "bkt-profiles", "bkt-files", "bkt-chat",
    "bkt-kanban-workflow", "bkt-health", "bkt-prompts",
}


def _bkt_plugins():
    from hermes_cli.web_server_dashboard import _discover_dashboard_plugins
    plugins = _discover_dashboard_plugins([(REPO / "plugins", "bundled")])
    return {p["name"]: p for p in plugins if p["name"].startswith("bkt-")}


def test_discovers_exactly_the_eight_bkt_plugins(_isolate_hermes_home):
    assert set(_bkt_plugins()) == EXPECTED


def test_each_entry_and_stylesheet_exists(_isolate_hermes_home):
    for name, plugin in _bkt_plugins().items():
        dashboard = Path(plugin["_dir"])
        assert (dashboard / plugin["entry"]).is_file(), f"{name}: missing {plugin['entry']}"
        if plugin["css"]:
            assert (dashboard / plugin["css"]).is_file(), f"{name}: missing {plugin['css']}"


def test_backends_are_declared_and_mountable(_isolate_hermes_home):
    for name, plugin in _bkt_plugins().items():
        has_backend = (Path(plugin["_dir"]) / "plugin_api.py").is_file()
        assert plugin["has_api"] == has_backend, f"{name}: plugin_api.py and manifest 'api' disagree"


def test_bundled_plugins_need_no_enable_entry():
    from hermes_cli.web_server_dashboard import _plugin_api_mount_skip_reason
    for name in EXPECTED:
        assert _plugin_api_mount_skip_reason({"name": name, "source": "bundled"}, set(), set()) is None
        assert _plugin_api_mount_skip_reason({"name": name, "source": "bundled"}, set(), {name}) == "explicitly disabled"
