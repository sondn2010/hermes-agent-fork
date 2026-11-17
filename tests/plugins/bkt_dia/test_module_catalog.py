"""Behaviour contract of ``plugins.bkt_dia_common.module_catalog``: the read-only module listing the
dashboard console renders, against the real bundled modules and a temp plugins root."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from plugins.bkt_dia_common import module_catalog
from plugins.bkt_dia_common.categories import CATEGORIES

_SAMPLE_INIT = '''
from pathlib import Path

MODULE = {"function_code": "F099", "toolset": "bkt-dia-sample", "emoji": "S", "tools": [{
    "name": "bkt_dia_sample_lookup", "description": "Sample lookup.",
    "parameters": {"type": "object", "properties": {"subject": {"type": "string"}}, "required": ["subject"]},
    "question_template": "About {subject}"}]}


def register(ctx):
    (Path(__file__).parent / "registered.marker").write_text("x")
'''


def _write_module(root: Path, name: str, init: str, tags: str = "[bkt, 'category:domain-lookup']") -> Path:
    directory = root / name
    directory.mkdir()
    (directory / "plugin.yaml").write_text(f"name: {name}\ndescription: {name} module.\ntags: {tags}\n",
                                           encoding="utf-8")
    (directory / "__init__.py").write_text(init, encoding="utf-8")
    return directory


@pytest.fixture
def temp_root(tmp_path, monkeypatch, write_profile) -> Path:
    root = tmp_path / "plugins"
    root.mkdir()
    monkeypatch.setattr(module_catalog, "PLUGINS_ROOT", root)
    write_profile(enabled=("bkt-dia-common", "bkt-dia-sample"))
    return root


def test_lists_the_twenty_bundled_modules_without_templates(write_profile):
    write_profile(enabled=("bkt-dia-common", "bkt-dia-enterprise-profile"))

    modules = module_catalog.list_modules()

    assert len(modules) == 20
    assert all("error" not in m for m in modules)
    assert all(m["category"] in CATEGORIES for m in modules)
    assert all(m["function_code"] and m["title"] and m["description"] and m["tools"] for m in modules)
    assert all("question_template" not in t for m in modules for t in m["tools"])
    order = list(CATEGORIES)
    assert [order.index(m["category"]) for m in modules] == sorted(order.index(m["category"]) for m in modules)
    assert {m["name"] for m in modules if m["enabled"]} == {"bkt-dia-enterprise-profile"}


def test_enabled_is_read_from_the_active_profile_on_every_call(write_profile):
    write_profile(enabled=("bkt-dia-common",))
    assert not any(m["enabled"] for m in module_catalog.list_modules())

    write_profile(enabled=("bkt-dia-common", "bkt-dia-workforce"), disabled=())
    assert [m["name"] for m in module_catalog.list_modules() if m["enabled"]] == ["bkt-dia-workforce"]

    write_profile(enabled=("bkt-dia-common", "bkt-dia-workforce"), disabled=("bkt-dia-workforce",))
    assert not any(m["enabled"] for m in module_catalog.list_modules())


def test_categories_list_every_slug_in_order():
    assert [c["slug"] for c in module_catalog.categories()] == list(CATEGORIES)
    assert all(c["label_vi"] and c["label_en"] for c in module_catalog.categories())


def test_listing_never_calls_register(temp_root):
    directory = _write_module(temp_root, "bkt-dia-sample", _SAMPLE_INIT)

    [entry] = module_catalog.list_modules()

    assert entry["name"] == "bkt-dia-sample" and entry["enabled"] is True
    assert entry["function_code"] == "F099" and entry["title"] == "Sample"
    assert entry["tools"][0]["parameters"]["required"] == ["subject"]
    assert not (directory / "registered.marker").exists()


def test_broken_module_is_listed_with_error_and_cannot_run(temp_root):
    _write_module(temp_root, "bkt-dia-sample", _SAMPLE_INIT)
    _write_module(temp_root, "bkt-dia-broken", "raise RuntimeError('boom')\n")
    _write_module(temp_root, "bkt-dia-badspec", "MODULE = {'function_code': 'nope'}\n")

    entries = {m["name"]: m for m in module_catalog.list_modules()}

    assert "error" not in entries["bkt-dia-sample"]
    assert "boom" in entries["bkt-dia-broken"]["error"]
    assert "function_code" in entries["bkt-dia-badspec"]["error"]
    assert module_catalog.find_tool("bkt-dia-broken", "bkt_dia_broken_x") is None


def test_find_tool_returns_full_specs_only_for_known_names(temp_root):
    _write_module(temp_root, "bkt-dia-sample", _SAMPLE_INIT)

    module, tool = module_catalog.find_tool("bkt-dia-sample", "bkt_dia_sample_lookup")

    assert module["function_code"] == "F099"
    assert tool["question_template"] == "About {subject}"
    assert module_catalog.find_tool("bkt-dia-sample", "bkt_dia_sample_other") is None
    assert module_catalog.find_tool("bkt-dia-missing", "bkt_dia_sample_lookup") is None
    assert module_catalog.find_tool("../bkt-dia-sample", "bkt_dia_sample_lookup") is None


def test_changed_module_file_is_reloaded(temp_root):
    directory = _write_module(temp_root, "bkt-dia-sample", _SAMPLE_INIT)
    assert module_catalog.list_modules()[0]["function_code"] == "F099"

    init = directory / "__init__.py"
    init.write_text(_SAMPLE_INIT.replace("F099", "F098"), encoding="utf-8")
    stat = init.stat()
    os.utime(init, ns=(stat.st_atime_ns, stat.st_mtime_ns + 10_000_000))

    assert module_catalog.list_modules()[0]["function_code"] == "F098"


def test_malformed_plugin_yaml_is_listed_with_error_and_others_still_load(temp_root):
    _write_module(temp_root, "bkt-dia-sample", _SAMPLE_INIT)
    broken = _write_module(temp_root, "bkt-dia-broken", _SAMPLE_INIT)
    (broken / "plugin.yaml").write_text("name: [unclosed\n", encoding="utf-8")

    modules = {m["name"]: m for m in module_catalog.list_modules()}

    assert "error" in modules["bkt-dia-broken"] and modules["bkt-dia-broken"]["tools"] == []
    assert modules["bkt-dia-sample"]["function_code"] == "F099"
    assert module_catalog.find_tool("bkt-dia-broken", "bkt_dia_sample_lookup") is None
