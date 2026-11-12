"""Analysis & forecast modules (F021 bkt-dia-finance-forecast, F022 bkt-dia-sector-forecast).

Both load through ``PluginManager.discover_and_load`` in a temp profile home and query the local
DIA stub. They retrieve observed multi-period data only; the stub sees the rendered question.
"""

from __future__ import annotations

import json

import pytest

COMMON = "bkt-dia-common"
MODULES = {
    "bkt-dia-finance-forecast": ("F021", ("bkt_dia_finance_forecast_history",
                                          "bkt_dia_finance_forecast_benchmark")),
    "bkt-dia-sector-forecast": ("F022", ("bkt_dia_sector_forecast_series",
                                         "bkt_dia_sector_forecast_tenders")),
}
ALL_ENABLED = (COMMON, *MODULES)

# (tool, args, question the service must receive): full arguments, then optional segments dropped.
RENDER_CASES = [
    ("bkt_dia_finance_forecast_history",
     {"enterprise": "0101234567", "from_year": 2022, "to_year": 2025, "indicators": "doanh thu"},
     "Số liệu tài chính theo từng năm của doanh nghiệp 0101234567 (doanh thu, thuế thu nhập doanh "
     "nghiệp và các chỉ tiêu tài chính khác nếu có) từ năm 2022 đến năm 2025, tập trung vào doanh thu."),
    ("bkt_dia_finance_forecast_history", {"enterprise": "ACME", "indicators": "  "},
     "Số liệu tài chính theo từng năm của doanh nghiệp ACME (doanh thu, thuế thu nhập doanh nghiệp "
     "và các chỉ tiêu tài chính khác nếu có)."),
    ("bkt_dia_finance_forecast_benchmark",
     {"indicator": "lợi nhuận", "sector": "phần mềm", "province": "Hà Nội", "from_year": 2021},
     "Thống kê lợi nhuận của ngành công nghệ số qua các năm trong lĩnh vực phần mềm tại Hà Nội "
     "từ năm 2021."),
    ("bkt_dia_finance_forecast_benchmark", {"indicator": "doanh thu"},
     "Thống kê doanh thu của ngành công nghệ số qua các năm."),
    ("bkt_dia_sector_forecast_series",
     {"topic": "nhân lực công nghệ số", "breakdown": "trình độ", "province": "Đà Nẵng",
      "from_year": 2020, "to_year": 2024},
     "Số liệu thống kê nhân lực công nghệ số của ngành công nghệ số qua các năm phân theo trình độ "
     "tại Đà Nẵng từ năm 2020 đến năm 2024."),
    ("bkt_dia_sector_forecast_series", {"topic": "giá trị xuất khẩu", "sector": None},
     "Số liệu thống kê giá trị xuất khẩu của ngành công nghệ số qua các năm."),
    ("bkt_dia_sector_forecast_tenders",
     {"keyword": "phần mềm {quản lý}", "breakdown": "lĩnh vực", "location": "Hà Nội", "year": 2024},
     "Thông tin và thống kê các gói thầu mua sắm công nghệ số liên quan đến phần mềm {quản lý} "
     "phân theo lĩnh vực tại Hà Nội trong năm 2024."),
    ("bkt_dia_sector_forecast_tenders", {},
     "Thông tin và thống kê các gói thầu mua sắm công nghệ số."),
]


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


@pytest.mark.parametrize("plugin", sorted(MODULES))
def test_module_loads_with_declared_tools_category_and_skill(manager, write_profile, plugin):
    from plugins.bkt_dia_common.tool_factory import validate_module_spec

    function_code, tools = MODULES[plugin]
    write_profile(enabled=ALL_ENABLED, settings={})

    manager.discover_and_load()

    loaded = manager._plugins[plugin]
    assert loaded.enabled and loaded.error is None, loaded.error
    assert set(loaded.tools_registered) == set(tools)
    assert set(loaded.manifest.provides_tools) == set(tools)
    assert "category:analysis-forecast" in loaded.manifest.tags
    assert function_code.lower() in loaded.manifest.tags
    validate_module_spec(loaded.module.MODULE, provides_tools=loaded.manifest.provides_tools)
    assert loaded.module.MODULE["function_code"] == function_code
    assert {_entry(manager, t).toolset for t in tools} == {plugin}
    assert manager.find_plugin_skill(f"{plugin}:{plugin}") is not None


@pytest.mark.parametrize("plugin", sorted(MODULES))
def test_happy_path_returns_function_code_and_sources(manager, dia_stub, write_profile, plugin):
    function_code, tools = MODULES[plugin]
    write_profile(enabled=ALL_ENABLED, settings={"endpoint": dia_stub.base_url})
    manager.discover_and_load()
    first_args = {"bkt_dia_finance_forecast_history": {"enterprise": "0101234567"},
                  "bkt_dia_sector_forecast_series": {"topic": "giá trị nhập khẩu"}}

    for tool in tools:
        result = _call(manager, tool, first_args.get(tool, {"indicator": "doanh thu"}))
        assert result["ok"] is True, result
        assert result["function_code"] == function_code
        assert result["sources"] == [{"code": "0101234567", "name": "ACME"}]
    assert len(dia_stub.query_requests()) == len(tools)


@pytest.mark.parametrize(("tool", "args", "question"), RENDER_CASES)
def test_question_template_renders_for_the_service(manager, dia_stub, write_profile, tool, args, question):
    write_profile(enabled=ALL_ENABLED, settings={"endpoint": dia_stub.base_url})
    manager.discover_and_load()

    assert _call(manager, tool, args)["ok"] is True

    assert [r.body["question"] for r in dia_stub.query_requests()] == [question]


@pytest.mark.parametrize("plugin", sorted(MODULES))
def test_unset_endpoint_fails_closed_without_a_request(manager, dia_stub, write_profile, plugin):
    function_code, tools = MODULES[plugin]
    write_profile(enabled=ALL_ENABLED, settings={})
    manager.discover_and_load()

    results = [_call(manager, tool, {"enterprise": "ACME", "indicator": "doanh thu", "topic": "GDP"})
               for tool in tools]

    for result in results:
        assert result["ok"] is False and result["error"] == "bkt-dia endpoint not configured"
        assert result["function_code"] == function_code and "answer" not in result
    assert dia_stub.requests == []


@pytest.mark.parametrize("tool", ["bkt_dia_finance_forecast_history", "bkt_dia_sector_forecast_series"])
def test_5xx_and_missing_required_argument_fail_closed(manager, dia_stub, write_profile, tool):
    write_profile(enabled=ALL_ENABLED, settings={"endpoint": dia_stub.base_url})
    manager.discover_and_load()

    missing = _call(manager, tool, {})
    assert missing["ok"] is False and "missing required argument" in missing["error"]
    assert dia_stub.requests == []

    dia_stub.status = 502
    failed = _call(manager, tool, {"enterprise": "ACME", "topic": "GDP"})
    assert failed["ok"] is False and "HTTP 502" in failed["error"]
    assert "answer" not in failed and "sources" not in failed
