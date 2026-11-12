"""Decision-support bkt-dia modules (F023 policy, F024 strategy, F025 matchmaking) through real discovery.

Each module loads through ``PluginManager.discover_and_load`` in a temp profile home, registers
exactly the tools its manifest declares, sends the rendered question to the local DIA stub, and
fails closed with no request when the endpoint is unset.
"""

from __future__ import annotations

import json

import pytest

from plugins.bkt_dia_common.tool_factory import render_question, validate_module_spec

COMMON = "bkt-dia-common"

# plugin -> (function code, tool names)
MODULES = {
    "bkt-dia-policy-advisor": (
        "F023", ("bkt_dia_policy_advisor_documents", "bkt_dia_policy_advisor_statistics")),
    "bkt-dia-strategy-advisor": (
        "F024", ("bkt_dia_strategy_advisor_enterprise", "bkt_dia_strategy_advisor_market")),
    "bkt-dia-partner-matchmaking": (
        "F025", ("bkt_dia_partner_matchmaking_tender", "bkt_dia_partner_matchmaking_candidates")),
}

# tool -> (full arguments, question sent for them, minimal arguments, question sent for those)
CASES = {
    "bkt_dia_policy_advisor_documents": (
        {"topic": "ưu đãi thuế cho doanh nghiệp phần mềm", "policy_area": "thuế", "year": 2024},
        "Tìm các văn bản quy phạm pháp luật, chính sách về ưu đãi thuế cho doanh nghiệp phần mềm "
        "trong lĩnh vực chính sách thuế ban hành năm 2024, nêu số hiệu, tên văn bản và nội dung chính.",
        {"topic": "hỗ trợ R&D"},
        "Tìm các văn bản quy phạm pháp luật, chính sách về hỗ trợ R&D, nêu số hiệu, tên văn bản và "
        "nội dung chính."),
    "bkt_dia_policy_advisor_statistics": (
        {"indicator": "nộp ngân sách nhà nước", "sector": "phần mềm", "province": "Hà Nội",
         "from_year": 2020, "to_year": 2024},
        "Số liệu thống kê ngành công nghệ số về nộp ngân sách nhà nước của lĩnh vực phần mềm tại "
        "Hà Nội từ năm 2020 đến năm 2024.",
        {"indicator": "chi phí nghiên cứu", "sector": "  "},
        "Số liệu thống kê ngành công nghệ số về chi phí nghiên cứu."),
    "bkt_dia_strategy_advisor_enterprise": (
        {"enterprise": "0101234567", "focus": "sản phẩm phần mềm"},
        "Năng lực của doanh nghiệp 0101234567: lĩnh vực hoạt động, ngành nghề kinh doanh chính, vốn "
        "điều lệ, địa bàn, tình trạng hoạt động và các sản phẩm, dịch vụ công nghệ số doanh nghiệp "
        "cung cấp, tập trung vào sản phẩm phần mềm.",
        {"enterprise": "ACME"},
        "Năng lực của doanh nghiệp ACME: lĩnh vực hoạt động, ngành nghề kinh doanh chính, vốn điều "
        "lệ, địa bàn, tình trạng hoạt động và các sản phẩm, dịch vụ công nghệ số doanh nghiệp cung cấp."),
    "bkt_dia_strategy_advisor_market": (
        {"topic": "giá trị xuất khẩu", "sector": "phần cứng", "province": "Bắc Ninh",
         "from_year": 2022, "to_year": 2024},
        "Dữ liệu thị trường và ngành công nghệ số về giá trị xuất khẩu trong lĩnh vực phần cứng tại "
        "Bắc Ninh từ năm 2022 đến năm 2024.",
        {"topic": "nhân lực CNS theo trình độ", "to_year": 2024},
        "Dữ liệu thị trường và ngành công nghệ số về nhân lực CNS theo trình độ đến năm 2024."),
    "bkt_dia_partner_matchmaking_tender": (
        {"bid_package": "IB2400123456"},
        "Thông tin chi tiết gói thầu IB2400123456: số hiệu, tên, lĩnh vực, giá trị, địa điểm, trạng "
        "thái và yêu cầu chính.",
        {"bid_package": "Gói thầu {phần mềm} quản lý"},
        "Thông tin chi tiết gói thầu Gói thầu {phần mềm} quản lý: số hiệu, tên, lĩnh vực, giá trị, "
        "địa điểm, trạng thái và yêu cầu chính."),
    "bkt_dia_partner_matchmaking_candidates": (
        {"capability": "tích hợp hệ thống", "sector": "phần mềm", "province": "Hà Nội"},
        "Tìm các doanh nghiệp công nghệ số có năng lực, ngành nghề hoặc sản phẩm về tích hợp hệ "
        "thống thuộc lĩnh vực phần mềm tại Hà Nội, kèm mã số thuế, lĩnh vực, địa bàn, vốn điều lệ "
        "và tình trạng hoạt động.",
        {"capability": "điện toán đám mây", "province": None},
        "Tìm các doanh nghiệp công nghệ số có năng lực, ngành nghề hoặc sản phẩm về điện toán đám "
        "mây, kèm mã số thuế, lĩnh vực, địa bàn, vốn điều lệ và tình trạng hoạt động."),
}

TOOL_PLUGIN = {tool: plugin for plugin, (_code, tools) in MODULES.items() for tool in tools}


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


def _load(manager, write_profile, plugin, settings):
    write_profile(enabled=(COMMON, plugin), settings=settings)
    manager.discover_and_load()
    loaded = manager._plugins[plugin]
    assert loaded.enabled and loaded.error is None, loaded.error
    return loaded


@pytest.mark.parametrize("plugin", sorted(MODULES))
def test_module_registers_declared_tools_toolset_tags_and_skill(manager, write_profile, plugin):
    code, tools = MODULES[plugin]

    loaded = _load(manager, write_profile, plugin, settings={})

    manifest = loaded.manifest
    validate_module_spec(loaded.module.MODULE, provides_tools=manifest.provides_tools)
    assert loaded.module.MODULE["function_code"] == code
    assert loaded.module.MODULE["toolset"] == manifest.name == plugin
    assert set(loaded.tools_registered) == set(manifest.provides_tools) == set(tools)
    assert {"bkt", "diaai", "category:decision-support", code.lower()} <= set(manifest.tags)
    assert {_entry(manager, t).toolset for t in tools} == {plugin}
    assert manager.find_plugin_skill(f"{plugin}:{plugin}") is not None


@pytest.mark.parametrize("tool", sorted(CASES))
def test_tool_answers_from_stub_with_function_code_and_sources(manager, dia_stub, write_profile, tool):
    plugin = TOOL_PLUGIN[tool]
    full_args, full_question, _min_args, _min_question = CASES[tool]
    _load(manager, write_profile, plugin, settings={"endpoint": dia_stub.base_url})

    result = _call(manager, tool, full_args)

    assert result["ok"] is True
    assert result["function_code"] == MODULES[plugin][0]
    assert result["sources"] == [{"code": "0101234567", "name": "ACME"}]
    assert [r.body["question"] for r in dia_stub.query_requests()] == [full_question]


@pytest.mark.parametrize("tool", sorted(CASES))
def test_template_drops_unset_optional_segments(manager, write_profile, tool):
    plugin = TOOL_PLUGIN[tool]
    _full_args, _full_question, min_args, min_question = CASES[tool]
    loaded = _load(manager, write_profile, plugin, settings={})
    spec = next(t for t in loaded.module.MODULE["tools"] if t["name"] == tool)

    assert render_question(spec["question_template"], min_args) == min_question


@pytest.mark.parametrize("plugin", sorted(MODULES))
def test_unset_endpoint_fails_closed_without_a_request(manager, dia_stub, write_profile, plugin):
    code, tools = MODULES[plugin]
    _load(manager, write_profile, plugin, settings={})

    for tool in tools:
        result = _call(manager, tool, CASES[tool][0])
        assert result["ok"] is False
        assert result["error"] == "bkt-dia endpoint not configured"
        assert result["function_code"] == code
        assert "answer" not in result and "sources" not in result
    assert dia_stub.requests == []


@pytest.mark.parametrize("plugin", sorted(MODULES))
def test_service_5xx_and_missing_argument_fail_closed(manager, dia_stub, write_profile, plugin):
    code, tools = MODULES[plugin]
    _load(manager, write_profile, plugin, settings={"endpoint": dia_stub.base_url})

    missing = _call(manager, tools[0], {})
    assert missing["ok"] is False and missing["error"].startswith("missing required argument")
    assert dia_stub.requests == []

    dia_stub.status = 503
    failed = _call(manager, tools[1], CASES[tools[1]][0])
    assert failed["ok"] is False and "HTTP 503" in failed["error"]
    assert failed["function_code"] == code and "answer" not in failed
