"""Cross-module contract for every ``plugins/bkt-dia-*`` plugin, through real plugin discovery.

These tests assert relationships that must hold across the 20 DIA AI function modules and the
shared ``bkt-dia-common`` module, not a snapshot of their current content: each manifest carries one
category tag that the shared map knows, tool names are unique and prefixed, each manifest's
``provides_tools`` equals the tools the module registers, each function code maps to exactly one
plugin, and disabling one module removes only that module's tools.
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

import pytest

import hermes_yaml as yaml
from plugins.bkt_dia_common.categories import CATEGORIES, CATEGORY_TAG_PREFIX
from plugins.bkt_dia_common.tool_factory import validate_module_spec

REPO_ROOT = Path(__file__).resolve().parents[3]
PLUGINS_DIR = REPO_ROOT / "plugins"
COMMON = "bkt-dia-common"
FUNCTION_CODES = frozenset({"F002", "F005", "F006", "F007", "F010", "F011", "F012"}
                           | {f"F{n:03d}" for n in range(15, 28)})
FUNCTION_PLUGINS = tuple(sorted(p.name for p in PLUGINS_DIR.glob("bkt-dia-*") if p.is_dir()))
FUNCTION_TAG = re.compile(r"f\d{3}")


def _manifest(plugin: str) -> dict:
    """The parsed ``plugin.yaml`` of a plugin named by its manifest name (the shared module's dir has underscores)."""
    directory = "bkt_dia_common" if plugin == COMMON else plugin
    return yaml.safe_load((PLUGINS_DIR / directory / "plugin.yaml").read_text(encoding="utf-8"))


def _entry(mgr, name: str):
    from tools.registry import registry

    return registry.get_entry(name, scope=mgr.scope_key)


@pytest.fixture
def all_enabled(hermes_home, write_profile):
    """Every function module and the shared module enabled, loaded through a fresh manager."""
    write_profile(enabled=(COMMON, *FUNCTION_PLUGINS), settings={})
    from hermes_cli import plugins as pmod

    mgr = pmod.PluginManager()
    mgr.discover_and_load()
    yield mgr
    mgr.unload()


def test_discovery_finds_the_twenty_function_modules():
    assert len(FUNCTION_PLUGINS) == len(FUNCTION_CODES) == 20


@pytest.mark.parametrize("plugin", FUNCTION_PLUGINS)
def test_manifest_has_one_known_category_and_the_common_tags(plugin):
    manifest = _manifest(plugin)
    tags = manifest["tags"]

    assert manifest["name"] == plugin
    categories = [t for t in tags if t.startswith(CATEGORY_TAG_PREFIX)]
    assert len(categories) == 1, categories
    slug = categories[0][len(CATEGORY_TAG_PREFIX):]
    assert slug in CATEGORIES and slug != "shared", slug
    codes = [t for t in tags if FUNCTION_TAG.fullmatch(t)]
    assert len(codes) == 1 and codes[0].upper() in FUNCTION_CODES, codes
    assert {"bkt", "diaai", codes[0]} <= set(tags)
    assert {"id": COMMON} in manifest["requires_plugins"]


def test_common_module_is_shared_and_registers_no_tools():
    manifest = _manifest(COMMON)

    categories = [t for t in manifest["tags"] if t.startswith(CATEGORY_TAG_PREFIX)]
    assert categories == [f"{CATEGORY_TAG_PREFIX}shared"]
    assert manifest["provides_tools"] == []


@pytest.mark.parametrize("plugin", FUNCTION_PLUGINS)
def test_loaded_module_registers_exactly_the_tools_its_manifest_declares(all_enabled, plugin):
    loaded = all_enabled._plugins[plugin]
    assert loaded.enabled and loaded.error is None, loaded.error
    module = loaded.module.MODULE
    names = [tool["name"] for tool in module["tools"]]

    validate_module_spec(module, provides_tools=loaded.manifest.provides_tools)
    assert 1 <= len(names) <= 2, names
    assert all(name.startswith("bkt_dia_") for name in names), names
    assert module["toolset"] == plugin
    assert sorted(loaded.tools_registered) == sorted(names)
    assert {_entry(all_enabled, name).toolset for name in names} == {plugin}
    assert all_enabled.find_plugin_skill(f"{plugin}:{plugin}") is not None


def test_tool_names_are_globally_unique(all_enabled):
    names = [tool["name"] for plugin in FUNCTION_PLUGINS
             for tool in all_enabled._plugins[plugin].module.MODULE["tools"]]

    assert len(names) >= len(FUNCTION_PLUGINS)
    assert len(names) == len(set(names)), sorted(n for n, c in Counter(names).items() if c > 1)


def test_each_function_code_maps_to_exactly_one_plugin(all_enabled):
    codes = Counter(all_enabled._plugins[plugin].module.MODULE["function_code"]
                    for plugin in FUNCTION_PLUGINS)

    assert set(codes) == FUNCTION_CODES
    assert set(codes.values()) == {1}


def test_enabling_every_module_registers_every_tool(all_enabled):
    for plugin in FUNCTION_PLUGINS:
        for name in _manifest(plugin)["provides_tools"]:
            assert _entry(all_enabled, name) is not None, f"{plugin}: {name} not registered"


@pytest.mark.parametrize("plugin", FUNCTION_PLUGINS)
def test_disabling_one_module_removes_only_its_own_tools(all_enabled, write_profile, plugin):
    own = _manifest(plugin)["provides_tools"]
    others = [p for p in FUNCTION_PLUGINS if p != plugin]
    survivors = [t for p in others for t in _manifest(p)["provides_tools"]]
    assert all(_entry(all_enabled, t) is not None for t in own + survivors)

    write_profile(enabled=(COMMON, *others), disabled=(plugin,), settings={})
    all_enabled.discover_and_load(force=True)

    assert not all_enabled._plugins[plugin].enabled
    assert all(_entry(all_enabled, t) is None for t in own)
    assert all(_entry(all_enabled, t) is not None for t in survivors)
