"""Domain-lookup DIA AI modules F016-F020 through real plugin discovery in a temp profile home.

For each module: the manifest declares exactly the registered tools and the domain-lookup
category, an enabled module registers its tools and skill, every tool turns its arguments into the
expected question for the local DIA stub and returns the stub's ``sources`` stamped with the
function code, and an unset endpoint or HTTP 5xx fails closed.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import pytest

from plugins.bkt_dia_common.tool_factory import validate_module_spec


@dataclass(frozen=True)
class Module:
    plugin: str
    function_code: str
    tools: tuple[str, ...]


MODULES = (
    Module("bkt-dia-finance-tax", "F016",
           ("bkt_dia_finance_tax_enterprise_lookup", "bkt_dia_finance_tax_sector_stats")),
    Module("bkt-dia-import-export", "F017", ("bkt_dia_import_export_lookup",)),
    Module("bkt-dia-digital-products", "F018",
           ("bkt_dia_digital_products_search", "bkt_dia_digital_products_stats")),
    Module("bkt-dia-workforce", "F019", ("bkt_dia_workforce_stats",)),
    Module("bkt-dia-tech-zones-projects", "F020",
           ("bkt_dia_tech_zones_projects_zone_lookup", "bkt_dia_tech_zones_projects_tender_lookup")),
)
_BY_TOOL = {tool: module for module in MODULES for tool in module.tools}

# (tool, arguments, question the DIA service receives): one case with every optional segment
# filled and one with optional arguments left out, per tool.
QUESTIONS = (
    ("bkt_dia_finance_tax_enterprise_lookup",
     {"enterprise": "0101234567", "from_year": 2022, "to_year": 2024, "focus": "thuế TNDN"},
     "Tình hình tài chính và nghĩa vụ thuế (doanh thu, thuế TNDN, thuế TNCN, vốn điều lệ) của doanh "
     "nghiệp 0101234567 từ năm 2022 đến năm 2024, tập trung vào thuế TNDN."),
    ("bkt_dia_finance_tax_enterprise_lookup", {"enterprise": "ACME"},
     "Tình hình tài chính và nghĩa vụ thuế (doanh thu, thuế TNDN, thuế TNCN, vốn điều lệ) của doanh "
     "nghiệp ACME."),
    ("bkt_dia_finance_tax_sector_stats",
     {"indicator": "đóng góp GDP", "sector": "phần mềm", "from_year": 2021, "to_year": 2024},
     "Số liệu thống kê đóng góp GDP của ngành công nghiệp công nghệ số trong lĩnh vực phần mềm từ năm "
     "2021 đến năm 2024."),
    ("bkt_dia_finance_tax_sector_stats", {"indicator": "lợi nhuận", "sector": "  "},
     "Số liệu thống kê lợi nhuận của ngành công nghiệp công nghệ số."),
    ("bkt_dia_import_export_lookup",
     {"flow": "xuất khẩu", "product": "điện thoại", "market": "Hoa Kỳ", "enterprise": "ACME",
      "from_year": 2023, "to_year": 2024},
     "Số liệu kim ngạch xuất khẩu công nghệ số của sản phẩm điện thoại tại thị trường Hoa Kỳ của "
     "doanh nghiệp ACME từ năm 2023 đến năm 2024."),
    ("bkt_dia_import_export_lookup", {"flow": "nhập khẩu", "to_year": 2024},
     "Số liệu kim ngạch nhập khẩu công nghệ số đến năm 2024."),
    ("bkt_dia_digital_products_search",
     {"query": "phần mềm kế toán", "provider": "ACME", "focus": "sản phẩm tương tự, thay thế"},
     "Tìm sản phẩm, dịch vụ công nghệ số liên quan đến phần mềm kế toán do doanh nghiệp ACME cung "
     "cấp, tập trung vào sản phẩm tương tự, thay thế."),
    ("bkt_dia_digital_products_search", {"query": "cloud"},
     "Tìm sản phẩm, dịch vụ công nghệ số liên quan đến cloud."),
    ("bkt_dia_digital_products_stats", {"breakdown": "nhóm sản phẩm", "year": 2024},
     "Thống kê sản phẩm công nghệ số theo nhóm sản phẩm năm 2024."),
    ("bkt_dia_digital_products_stats", {"breakdown": "đơn vị cung cấp"},
     "Thống kê sản phẩm công nghệ số theo đơn vị cung cấp."),
    ("bkt_dia_workforce_stats",
     {"breakdown": "trình độ chuyên môn", "region": "Hà Nội", "sector": "phần mềm",
      "from_year": 2021, "to_year": 2024},
     "Số liệu thống kê nhân lực công nghệ số phân theo trình độ chuyên môn tại Hà Nội trong lĩnh vực "
     "phần mềm từ năm 2021 đến năm 2024."),
    ("bkt_dia_workforce_stats", {},
     "Số liệu thống kê nhân lực công nghệ số."),
    ("bkt_dia_tech_zones_projects_zone_lookup",
     {"zone": "Khu CNTT tập trung Đà Nẵng", "province": "Đà Nẵng", "focus": "hạ tầng"},
     "Thông tin khu công nghệ số tập trung Khu CNTT tập trung Đà Nẵng tại Đà Nẵng, tập trung vào hạ "
     "tầng."),
    ("bkt_dia_tech_zones_projects_zone_lookup", {},
     "Thông tin khu công nghệ số tập trung."),
    ("bkt_dia_tech_zones_projects_tender_lookup",
     {"keyword": "phần mềm", "status": "đã đấu thầu", "province": "Hà Nội", "party": "Sở TT&TT",
      "from_year": 2024, "to_year": 2025, "focus": "giá trị hợp đồng"},
     "Tra cứu gói thầu mua sắm công nghệ số liên quan đến phần mềm có trạng thái đã đấu thầu tại Hà "
     "Nội của đơn vị Sở TT&TT từ năm 2024 đến năm 2025, tập trung vào giá trị hợp đồng."),
    ("bkt_dia_tech_zones_projects_tender_lookup", {"keyword": "IB2400012345 {status}"},
     "Tra cứu gói thầu mua sắm công nghệ số liên quan đến IB2400012345 {status}."),
)

# Minimal valid arguments per tool, for the fail-closed cases.
REQUIRED_ARGS = {
    "bkt_dia_finance_tax_enterprise_lookup": {"enterprise": "ACME"},
    "bkt_dia_finance_tax_sector_stats": {"indicator": "doanh thu"},
    "bkt_dia_import_export_lookup": {"flow": "xuất khẩu"},
    "bkt_dia_digital_products_search": {"query": "cloud"},
    "bkt_dia_digital_products_stats": {"breakdown": "nhóm sản phẩm"},
    "bkt_dia_workforce_stats": {},
    "bkt_dia_tech_zones_projects_zone_lookup": {},
    "bkt_dia_tech_zones_projects_tender_lookup": {},
}


def _enabled(module: Module) -> tuple[str, ...]:
    return ("bkt-dia-common", module.plugin)


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


def test_question_cases_cover_every_tool():
    assert {tool for tool, _args, _q in QUESTIONS} == set(_BY_TOOL)
    assert set(REQUIRED_ARGS) == set(_BY_TOOL)


@pytest.mark.parametrize("module", MODULES, ids=lambda m: m.plugin)
def test_enabled_module_registers_declared_tools_and_skill(manager, write_profile, module):
    write_profile(enabled=_enabled(module), settings={})

    manager.discover_and_load()

    loaded = manager._plugins[module.plugin]
    assert loaded.enabled and loaded.error is None, loaded.error
    manifest = loaded.manifest
    assert set(manifest.provides_tools) == set(module.tools)
    assert {"bkt", "diaai", "category:domain-lookup", module.function_code.lower()} <= set(manifest.tags)
    validate_module_spec(loaded.module.MODULE, provides_tools=manifest.provides_tools)
    assert loaded.module.MODULE["toolset"] == module.plugin
    assert loaded.module.MODULE["function_code"] == module.function_code
    assert set(loaded.tools_registered) == set(module.tools)
    assert {_entry(manager, t).toolset for t in module.tools} == {module.plugin}
    assert manager.find_plugin_skill(f"{module.plugin}:{module.plugin}") is not None


@pytest.mark.parametrize(("tool", "args", "question"), QUESTIONS,
                         ids=[f"{tool}-{i}" for i, (tool, _a, _q) in enumerate(QUESTIONS)])
def test_tool_sends_rendered_question_and_returns_sources(manager, dia_stub, write_profile,
                                                          tool, args, question):
    module = _BY_TOOL[tool]
    write_profile(enabled=_enabled(module), settings={"endpoint": dia_stub.base_url})
    manager.discover_and_load()

    result = _call(manager, tool, args)

    assert result["ok"] is True, result
    assert result["function_code"] == module.function_code
    assert result["sources"] == [{"code": "0101234567", "name": "ACME"}]
    assert [r.body["question"] for r in dia_stub.query_requests()] == [question]


@pytest.mark.parametrize("module", MODULES, ids=lambda m: m.plugin)
def test_unset_endpoint_fails_closed_without_a_request(manager, dia_stub, write_profile, module):
    write_profile(enabled=_enabled(module), settings={})
    manager.discover_and_load()

    for tool in module.tools:
        result = _call(manager, tool, REQUIRED_ARGS[tool])
        assert result["ok"] is False and result["error"] == "bkt-dia endpoint not configured"
        assert result["function_code"] == module.function_code
    assert dia_stub.requests == []


@pytest.mark.parametrize("module", MODULES, ids=lambda m: m.plugin)
def test_http_5xx_fails_closed(manager, dia_stub, write_profile, module):
    write_profile(enabled=_enabled(module), settings={"endpoint": dia_stub.base_url})
    dia_stub.status = 503
    manager.discover_and_load()

    for tool in module.tools:
        result = _call(manager, tool, REQUIRED_ARGS[tool])
        assert result["ok"] is False and "HTTP 503" in result["error"]
        assert "answer" not in result and "sources" not in result


@pytest.mark.parametrize("tool", [t for t, args in REQUIRED_ARGS.items() if args])
def test_missing_required_argument_fails_closed_without_a_request(manager, dia_stub, write_profile,
                                                                  tool):
    module = _BY_TOOL[tool]
    write_profile(enabled=_enabled(module), settings={"endpoint": dia_stub.base_url})
    manager.discover_and_load()

    result = _call(manager, tool, {})

    assert result["ok"] is False and result["error"].startswith("missing required argument")
    assert dia_stub.requests == []
