"""bkt-dia assistant-channels modules (F010 admin, F011 channel, F012 conversation) through real discovery.

Each module is loaded by ``PluginManager.discover_and_load`` in a temp profile home, exactly as a
session loads it, and its tools are called against the local DIA query stub.
"""

from __future__ import annotations

import json

import pytest

COMMON = "bkt-dia-common"
CATEGORY_TAG = "category:assistant-channels"

MODULES = {
    "bkt-dia-admin-assistant": ("F010", ("bkt_dia_admin_assistant_ask", "bkt_dia_admin_assistant_documents")),
    "bkt-dia-channel-assistant": ("F011", ("bkt_dia_channel_assistant_lookup",)),
    "bkt-dia-conversation-assistant": ("F012", ("bkt_dia_conversation_assistant_ask",)),
}

# One call per tool: the minimal arguments every tool needs, used by the stub and fail-closed tests.
MINIMAL_ARGS = {
    "bkt_dia_admin_assistant_ask": {"question": "Có bao nhiêu doanh nghiệp công nghệ số ở Hà Nội?"},
    "bkt_dia_admin_assistant_documents": {"subject": "chuyển đổi số"},
    "bkt_dia_channel_assistant_lookup": {"question": "Khu công nghệ số tập trung ở Đà Nẵng?"},
    "bkt_dia_conversation_assistant_ask": {"question": "Doanh nghiệp này hoạt động lĩnh vực gì?"},
}

ALL_TOOLS = [(plugin, code, tool) for plugin, (code, tools) in MODULES.items() for tool in tools]


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


def _all_enabled():
    return (COMMON, *MODULES)


@pytest.mark.parametrize("plugin", list(MODULES))
def test_enabled_module_registers_declared_tools_and_skill(manager, write_profile, plugin):
    from plugins.bkt_dia_common.categories import CATEGORIES

    code, tools = MODULES[plugin]
    write_profile(enabled=(COMMON, plugin), settings={})

    manager.discover_and_load()

    loaded = manager._plugins[plugin]
    assert loaded.enabled and loaded.error is None, loaded.error
    assert set(loaded.tools_registered) == set(tools)
    assert set(loaded.manifest.provides_tools) == set(tools)
    assert CATEGORY_TAG in loaded.manifest.tags
    assert {"bkt", "diaai", code.lower()} <= set(loaded.manifest.tags)
    category_tags = [t for t in loaded.manifest.tags if t.startswith("category:")]
    assert category_tags == [CATEGORY_TAG] and "assistant-channels" in CATEGORIES
    assert {_entry(manager, t).toolset for t in tools} == {plugin}
    assert manager.find_plugin_skill(f"{plugin}:{plugin}") is not None


@pytest.mark.parametrize("plugin", list(MODULES))
def test_module_spec_matches_manifest_and_contract(plugin):
    """The MODULE spec passes the shared contract with exactly the manifest's provides_tools."""
    from pathlib import Path

    import hermes_yaml as yaml
    from hermes_cli import plugins as pmod
    from plugins.bkt_dia_common.tool_factory import validate_module_spec

    plugin_dir = Path(pmod.__file__).resolve().parents[1] / "plugins" / plugin
    manifest = yaml.safe_load((plugin_dir / "plugin.yaml").read_text(encoding="utf-8"))
    module = _load_module_spec(plugin_dir)

    validate_module_spec(module, provides_tools=manifest["provides_tools"])
    assert module["toolset"] == manifest["name"] == plugin
    assert module["function_code"] == MODULES[plugin][0]


def _load_module_spec(plugin_dir):
    import importlib.util

    spec = importlib.util.spec_from_file_location(f"_bkt_spec_{plugin_dir.name.replace('-', '_')}",
                                                  plugin_dir / "__init__.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.MODULE


@pytest.mark.parametrize(("plugin", "code", "tool"), ALL_TOOLS)
def test_tool_answers_from_stub_with_function_code_and_sources(manager, dia_stub, write_profile,
                                                               plugin, code, tool):
    write_profile(enabled=(COMMON, plugin), settings={"endpoint": dia_stub.base_url})
    manager.discover_and_load()

    result = _call(manager, tool, MINIMAL_ARGS[tool])

    assert result["ok"] is True
    assert result["function_code"] == code
    assert result["sources"] == [{"code": "0101234567", "name": "ACME"}]
    assert result["answer"]
    assert len(dia_stub.query_requests()) == 1


@pytest.mark.parametrize(("plugin", "code", "tool"), ALL_TOOLS)
def test_unset_endpoint_fails_closed_without_a_request(manager, dia_stub, write_profile, plugin, code, tool):
    write_profile(enabled=(COMMON, plugin), settings={})
    manager.discover_and_load()

    result = _call(manager, tool, MINIMAL_ARGS[tool])

    assert result["ok"] is False and result["error"] == "bkt-dia endpoint not configured"
    assert result["function_code"] == code and "answer" not in result
    assert dia_stub.requests == []


@pytest.mark.parametrize(("plugin", "code", "tool"), ALL_TOOLS)
def test_http_5xx_fails_closed(manager, dia_stub, write_profile, plugin, code, tool):
    write_profile(enabled=(COMMON, plugin), settings={"endpoint": dia_stub.base_url})
    dia_stub.status = 502
    manager.discover_and_load()

    result = _call(manager, tool, MINIMAL_ARGS[tool])

    assert result["ok"] is False and "HTTP 502" in result["error"]
    assert result["function_code"] == code and "answer" not in result


@pytest.mark.parametrize(("plugin", "code", "tool"), ALL_TOOLS)
def test_missing_required_argument_makes_no_request(manager, dia_stub, write_profile, plugin, code, tool):
    write_profile(enabled=(COMMON, plugin), settings={"endpoint": dia_stub.base_url})
    manager.discover_and_load()

    result = _call(manager, tool, {})

    assert result["ok"] is False and result["error"].startswith("missing required argument")
    assert dia_stub.requests == []


@pytest.mark.parametrize(("tool", "args", "question"), [
    ("bkt_dia_admin_assistant_ask",
     {"question": "Đơn vị nào cung cấp dịch vụ điện toán đám mây?", "subject": "sản phẩm, dịch vụ công nghệ số"},
     "Đơn vị nào cung cấp dịch vụ điện toán đám mây? (phạm vi dữ liệu: sản phẩm, dịch vụ công nghệ số)"),
    ("bkt_dia_admin_assistant_documents",
     {"subject": "chuyển đổi số", "document_type": "văn bản quy phạm pháp luật",
      "document_code": "13/2023/NĐ-CP", "summary_level": "ngắn gọn"},
     "Tra cứu văn bản (văn bản quy phạm pháp luật) số hiệu 13/2023/NĐ-CP về chuyển đổi số: nêu số hiệu, "
     "tên, thời điểm ban hành hoặc năm báo cáo và nội dung liên quan, kèm bản tóm tắt ngắn gọn."),
    ("bkt_dia_channel_assistant_lookup",
     {"question": "Gói thầu phần mềm nào tại Hải Phòng?", "scope": "gói thầu"},
     "Gói thầu phần mềm nào tại Hải Phòng? (phạm vi dữ liệu: gói thầu)"),
    ("bkt_dia_conversation_assistant_ask",
     {"question": "Doanh nghiệp này hoạt động lĩnh vực gì?", "context": "đang xem hồ sơ MST 0101234567"},
     "Doanh nghiệp này hoạt động lĩnh vực gì? (ngữ cảnh: đang xem hồ sơ MST 0101234567)"),
])
def test_question_template_renders_full_question(manager, dia_stub, write_profile, tool, args, question):
    write_profile(enabled=_all_enabled(), settings={"endpoint": dia_stub.base_url})
    manager.discover_and_load()

    assert _call(manager, tool, args)["ok"] is True

    assert [r.body["question"] for r in dia_stub.query_requests()] == [question]


def test_optional_segments_drop_when_arguments_are_absent(manager, dia_stub, write_profile):
    write_profile(enabled=_all_enabled(), settings={"endpoint": dia_stub.base_url})
    manager.discover_and_load()

    for tool in MINIMAL_ARGS:
        assert _call(manager, tool, MINIMAL_ARGS[tool])["ok"] is True

    assert [r.body["question"] for r in dia_stub.query_requests()] == [
        "Có bao nhiêu doanh nghiệp công nghệ số ở Hà Nội?",
        "Tra cứu văn bản về chuyển đổi số: nêu số hiệu, tên, thời điểm ban hành hoặc năm báo cáo và "
        "nội dung liên quan.",
        "Khu công nghệ số tập trung ở Đà Nẵng?",
        "Doanh nghiệp này hoạt động lĩnh vực gì?",
    ]


def test_disabled_modules_register_nothing(manager, write_profile):
    write_profile(enabled=(COMMON,), settings={})

    manager.discover_and_load()

    for plugin, (_code, tools) in MODULES.items():
        assert not manager._plugins[plugin].enabled
        assert all(_entry(manager, t) is None for t in tools)
