"""bkt-dia-enterprise-profile (F015) through real plugin discovery in a temp profile home.

Loading goes through ``PluginManager.discover_and_load`` exactly as a session does: enabled
modules register their tools and skill, a disabled module registers nothing, and disabling a
loaded module removes its toolset on the next (forced) discovery.
"""

from __future__ import annotations

import json

import pytest

PLUGIN = "bkt-dia-enterprise-profile"
TOOLS = ("bkt_dia_enterprise_profile_lookup", "bkt_dia_enterprise_profile_history")
BOTH = ("bkt-dia-common", PLUGIN)


@pytest.fixture
def manager(hermes_home):
    """A fresh manager bound to the temp profile home (it captures the home at construction)."""
    from hermes_cli import plugins as pmod

    mgr = pmod.PluginManager()
    yield mgr
    mgr.unload()


def _entry(mgr, name):
    from tools.registry import registry

    return registry.get_entry(name, scope=mgr.scope_key)


def _call(mgr, name, args):
    return json.loads(_entry(mgr, name).handler(args))


def test_enabled_module_registers_tools_toolset_and_skill(manager, write_profile):
    write_profile(enabled=BOTH, settings={})

    manager.discover_and_load()

    loaded = manager._plugins[PLUGIN]
    assert loaded.enabled and loaded.error is None, loaded.error
    assert set(loaded.tools_registered) == set(TOOLS)
    assert set(loaded.manifest.provides_tools) == set(TOOLS)
    assert "category:domain-lookup" in loaded.manifest.tags
    assert {_entry(manager, t).toolset for t in TOOLS} == {PLUGIN}
    assert manager.find_plugin_skill(f"{PLUGIN}:{PLUGIN}") is not None
    common = manager._plugins["bkt-dia-common"]
    assert common.enabled and common.tools_registered == []


def test_lookup_and_history_answer_from_stub(manager, dia_stub, write_profile):
    write_profile(enabled=BOTH, settings={"endpoint": dia_stub.base_url})
    manager.discover_and_load()

    lookup = _call(manager, TOOLS[0], {"enterprise": "0101234567", "focus": "doanh nghiệp tương tự"})
    history = _call(manager, TOOLS[1], {"enterprise": "ACME", "from_year": 2020, "to_year": 2024})

    for result in (lookup, history):
        assert result["ok"] is True
        assert result["function_code"] == "F015"
        assert result["sources"] == [{"code": "0101234567", "name": "ACME"}]
    questions = [r.body["question"] for r in dia_stub.query_requests()]
    assert questions == [
        "Tra cứu hồ sơ và thông tin tổng quan của doanh nghiệp 0101234567, tập trung vào doanh nghiệp tương tự.",
        "Hồ sơ lịch sử của doanh nghiệp ACME qua các năm từ năm 2020 đến năm 2024.",
    ]


def test_unset_endpoint_and_5xx_fail_closed(manager, dia_stub, write_profile):
    write_profile(enabled=BOTH, settings={})
    manager.discover_and_load()
    unset = _call(manager, TOOLS[0], {"enterprise": "ACME"})
    assert unset["ok"] is False and unset["error"] == "bkt-dia endpoint not configured"

    write_profile(enabled=BOTH, settings={"endpoint": dia_stub.base_url})
    dia_stub.status = 503
    failed = _call(manager, TOOLS[1], {"enterprise": "ACME"})
    assert failed["ok"] is False and "HTTP 503" in failed["error"]
    assert "answer" not in failed


def test_module_without_common_enabled_refuses_to_query(manager, dia_stub, write_profile):
    write_profile(enabled=(PLUGIN,), settings={"endpoint": dia_stub.base_url})
    manager.discover_and_load()

    result = _call(manager, TOOLS[0], {"enterprise": "ACME"})

    assert result["ok"] is False and result["error"] == "bkt-dia-common plugin is disabled"
    assert dia_stub.requests == []


def test_disabled_module_registers_nothing(manager, write_profile):
    write_profile(enabled=("bkt-dia-common",), settings={})

    manager.discover_and_load()

    assert not manager._plugins[PLUGIN].enabled
    assert all(_entry(manager, t) is None for t in TOOLS)


def test_toolset_unregisters_when_module_is_disabled(manager, write_profile):
    write_profile(enabled=BOTH, settings={})
    manager.discover_and_load()
    assert all(_entry(manager, t) is not None for t in TOOLS)

    write_profile(enabled=("bkt-dia-common",), disabled=(PLUGIN,), settings={})
    manager.discover_and_load(force=True)

    assert not manager._plugins[PLUGIN].enabled
    assert all(_entry(manager, t) is None for t in TOOLS)


def test_enabled_toolset_is_on_for_a_new_cli_session(write_profile):
    """A new session resolves its tool list from discovery: an enabled module's toolset is on by default."""
    from hermes_cli.config import load_config
    from hermes_cli.plugins import discover_plugins
    from hermes_cli.tools_config import _get_platform_tools

    write_profile(enabled=BOTH, settings={})
    discover_plugins(force=True)
    assert PLUGIN in _get_platform_tools(load_config(), "cli")

    write_profile(enabled=("bkt-dia-common",), settings={})
    discover_plugins(force=True)
    assert PLUGIN not in _get_platform_tools(load_config(), "cli")
