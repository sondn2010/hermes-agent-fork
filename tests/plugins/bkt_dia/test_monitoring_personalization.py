"""Monitoring & personalization modules (F026 risk monitor, F027 personalization insights).

Plugins load through real ``PluginManager`` discovery in a temp profile home and query the local
DIA stub from ``conftest.py``; the rendered questions are checked as the exact text the service
receives.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

import hermes_yaml as yaml
from plugins.bkt_dia_common.tool_factory import render_question, validate_module_spec

PLUGINS_DIR = Path(__file__).resolve().parents[3] / "plugins"
RISK = "bkt-dia-risk-monitor"
PERSONAL = "bkt-dia-personalization-insights"
TOOLS = {
    RISK: ("bkt_dia_risk_monitor_check", "bkt_dia_risk_monitor_freshness"),
    PERSONAL: ("bkt_dia_personalization_insights_suggest",),
}
CODES = {RISK: "F026", PERSONAL: "F027"}
# One valid call per tool, used by the stub happy path and the fail-closed checks.
SAMPLE_ARGS = {
    "bkt_dia_risk_monitor_check": {"risk_area": "giá trị xuất khẩu và nhập khẩu",
                                   "subject": "ngành công nghệ số"},
    "bkt_dia_risk_monitor_freshness": {"subject": "doanh thu ngành công nghệ số"},
    "bkt_dia_personalization_insights_suggest": {"interests": "doanh nghiệp phần mềm tại Đà Nẵng"},
}
ALL_TOOLS = [(plugin, tool) for plugin, tools in TOOLS.items() for tool in tools]


def _module_spec(plugin: str) -> dict:
    """``MODULE`` from a hyphenated plugin dir (not importable as ``plugins.<dir>``)."""
    spec = importlib.util.spec_from_file_location(f"_bkt_test_{plugin.replace('-', '_')}",
                                                  PLUGINS_DIR / plugin / "__init__.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.MODULE


def _template(plugin: str, tool: str) -> str:
    return next(t["question_template"] for t in _module_spec(plugin)["tools"] if t["name"] == tool)


@pytest.fixture
def manager(hermes_home):
    """A fresh manager bound to the temp profile home (it captures the home at construction)."""
    from hermes_cli import plugins as pmod

    mgr = pmod.PluginManager()
    yield mgr
    mgr.unload()


def _call(mgr, name, args):
    from tools.registry import registry

    return json.loads(registry.get_entry(name, scope=mgr.scope_key).handler(args))


@pytest.mark.parametrize("plugin", list(TOOLS))
def test_manifest_matches_module_spec_and_category(plugin):
    manifest = yaml.safe_load((PLUGINS_DIR / plugin / "plugin.yaml").read_text(encoding="utf-8"))
    module = _module_spec(plugin)

    validate_module_spec(module, provides_tools=manifest["provides_tools"])
    assert manifest["name"] == module["toolset"] == plugin
    assert module["function_code"] == CODES[plugin]
    assert [t for t in manifest["tags"] if t.startswith("category:")] == ["category:monitoring-personalization"]
    assert {"bkt", "diaai", CODES[plugin].lower()} <= set(manifest["tags"])
    assert {"id": "bkt-dia-common"} in manifest["requires_plugins"]


@pytest.mark.parametrize("plugin", list(TOOLS))
def test_enabled_module_registers_its_tools_and_skill(plugin, manager, write_profile):
    write_profile(enabled=("bkt-dia-common", plugin), settings={})

    manager.discover_and_load()

    loaded = manager._plugins[plugin]
    assert loaded.enabled and loaded.error is None, loaded.error
    assert set(loaded.tools_registered) == set(TOOLS[plugin])
    assert set(loaded.manifest.provides_tools) == set(TOOLS[plugin])
    assert manager.find_plugin_skill(f"{plugin}:{plugin}") is not None


@pytest.mark.parametrize(("plugin", "tool"), ALL_TOOLS)
def test_tool_answers_from_stub_with_function_code_and_sources(plugin, tool, manager, dia_stub, write_profile):
    write_profile(enabled=("bkt-dia-common", plugin), settings={"endpoint": dia_stub.base_url})
    manager.discover_and_load()

    result = _call(manager, tool, SAMPLE_ARGS[tool])

    assert result["ok"] is True
    assert result["function_code"] == CODES[plugin]
    assert result["sources"] == [{"code": "0101234567", "name": "ACME"}]
    sent = [r.body["question"] for r in dia_stub.query_requests()]
    assert sent == [render_question(_template(plugin, tool), SAMPLE_ARGS[tool])]


@pytest.mark.parametrize(("plugin", "tool"), ALL_TOOLS)
def test_unset_endpoint_fails_closed_without_a_request(plugin, tool, manager, dia_stub, write_profile):
    write_profile(enabled=("bkt-dia-common", plugin), settings={})
    manager.discover_and_load()

    result = _call(manager, tool, SAMPLE_ARGS[tool])

    assert result["ok"] is False and result["error"] == "bkt-dia endpoint not configured"
    assert result["function_code"] == CODES[plugin] and "answer" not in result
    assert dia_stub.requests == []


@pytest.mark.parametrize(("plugin", "tool"), ALL_TOOLS)
def test_service_5xx_fails_closed(plugin, tool, manager, dia_stub, write_profile):
    write_profile(enabled=("bkt-dia-common", plugin), settings={"endpoint": dia_stub.base_url})
    manager.discover_and_load()
    dia_stub.status = 503

    result = _call(manager, tool, SAMPLE_ARGS[tool])

    assert result["ok"] is False and "HTTP 503" in result["error"]
    assert "answer" not in result and "sources" not in result


def test_missing_required_argument_fails_closed_without_a_request(manager, dia_stub, write_profile):
    write_profile(enabled=("bkt-dia-common", RISK), settings={"endpoint": dia_stub.base_url})
    manager.discover_and_load()

    result = _call(manager, "bkt_dia_risk_monitor_check", {"risk_area": "nhân lực và số lao động"})

    assert result["ok"] is False and "subject" in result["error"]
    assert dia_stub.requests == []


def test_risk_check_template_renders_area_subject_and_optional_segments():
    template = _template(RISK, "bkt_dia_risk_monitor_check")
    area = "nhân lực và số lao động"

    full = render_question(template, {"risk_area": area, "subject": "lĩnh vực phần mềm",
                                      "period": "2022-2024", "compare_with": "lĩnh vực phần cứng"})
    bare = render_question(template, {"risk_area": area, "subject": "lĩnh vực phần mềm"})

    assert full == ("Dữ liệu về nhân lực và số lao động của lĩnh vực phần mềm trong giai đoạn 2022-2024, "
                    "theo từng năm kèm mức biến động giữa các kỳ, so sánh với lĩnh vực phần cứng.")
    assert bare == ("Dữ liệu về nhân lực và số lao động của lĩnh vực phần mềm, "
                    "theo từng năm kèm mức biến động giữa các kỳ.")


def test_freshness_template_renders_optional_data_type():
    template = _template(RISK, "bkt_dia_risk_monitor_freshness")

    with_type = render_question(template, {"subject": "doanh thu ngành CNS", "data_type": "báo cáo thống kê"})
    bare = render_question(template, {"subject": "ACME"})

    assert with_type == ("Dữ liệu mới nhất hiện có về doanh thu ngành CNS thuộc loại báo cáo thống kê "
                         "là của năm hoặc kỳ nào và được cập nhật khi nào?")
    assert bare == "Dữ liệu mới nhất hiện có về ACME là của năm hoặc kỳ nào và được cập nhật khi nào?"


def test_suggest_template_renders_role_and_exclusions():
    template = _template(PERSONAL, "bkt_dia_personalization_insights_suggest")

    full = render_question(template, {"interests": "nhân lực CNS Hà Nội", "role": "lãnh đạo cục",
                                      "exclude_topics": "doanh thu"})
    bare = render_question(template, {"interests": "nhân lực CNS Hà Nội", "role": "  "})

    assert full == ("Thông tin, số liệu và văn bản mới nhất liên quan đến nhân lực CNS Hà Nội, "
                    "phù hợp với vai trò lãnh đạo cục, ngoài các chủ đề doanh thu.")
    assert bare == "Thông tin, số liệu và văn bản mới nhất liên quan đến nhân lực CNS Hà Nội."
