"""Knowledge & RAG bkt-dia modules (F002, F005, F006, F007) through real plugin discovery.

Each module is loaded by ``PluginManager.discover_and_load`` in a temp profile home, exactly as a
session loads it, and its tools are called against the conftest stub of the DIA query service.
"""

from __future__ import annotations

import json

import pytest

from plugins.bkt_dia_common.tool_factory import validate_module_spec

CATEGORY_TAG = "category:knowledge-rag"

MODULES = {
    "bkt-dia-document-intake": ("F002", ("bkt_dia_document_intake_lookup",)),
    "bkt-dia-knowledge-governance": (
        "F005", ("bkt_dia_knowledge_governance_terms", "bkt_dia_knowledge_governance_audit")),
    "bkt-dia-rag-retrieval": ("F006", ("bkt_dia_rag_retrieval_ask",)),
    "bkt-dia-knowledge-insights": (
        "F007", ("bkt_dia_knowledge_insights_slice", "bkt_dia_knowledge_insights_breakdown")),
}

# Smallest valid call per tool (required arguments only).
MINIMAL_ARGS = {
    "bkt_dia_document_intake_lookup": {"document": "Nghị định 13/2023/NĐ-CP"},
    "bkt_dia_knowledge_governance_terms": {"term": "SME"},
    "bkt_dia_knowledge_governance_audit": {"item": "báo cáo nhân lực CNS"},
    "bkt_dia_rag_retrieval_ask": {"question": "Có bao nhiêu doanh nghiệp CNS ở Đà Nẵng?"},
    "bkt_dia_knowledge_insights_slice": {"subject": "ngành phần mềm"},
    "bkt_dia_knowledge_insights_breakdown": {"measure": "số doanh nghiệp CNS", "dimension": "tỉnh thành"},
}

# (tool, args, question the DIA service must receive): full and minimal renderings per tool.
RENDERINGS = [
    ("bkt_dia_document_intake_lookup",
     {"document": "Nghị định 13/2023/NĐ-CP", "record_type": "văn bản quy phạm pháp luật",
      "fields": "số hiệu, năm ban hành"},
     "Tra cứu tài liệu hoặc bản ghi Nghị định 13/2023/NĐ-CP thuộc loại văn bản quy phạm pháp luật "
     "trong cơ sở tri thức và cho biết các thông tin đã trích xuất: số hiệu hoặc mã, tiêu đề, tóm tắt "
     "nội dung, đặc biệt là số hiệu, năm ban hành."),
    ("bkt_dia_document_intake_lookup", MINIMAL_ARGS["bkt_dia_document_intake_lookup"],
     "Tra cứu tài liệu hoặc bản ghi Nghị định 13/2023/NĐ-CP trong cơ sở tri thức và cho biết các "
     "thông tin đã trích xuất: số hiệu hoặc mã, tiêu đề, tóm tắt nội dung."),
    ("bkt_dia_knowledge_governance_terms",
     {"term": "SME", "synonyms": ["doanh nghiệp nhỏ và vừa", "DNNVV"], "record_type": "doanh nghiệp"},
     "Tìm các bản ghi tri thức liên quan đến thuật ngữ SME (cách gọi tương đương: doanh nghiệp nhỏ và "
     "vừa, DNNVV) trong nhóm doanh nghiệp, liệt kê tên, mã và loại của từng bản ghi."),
    ("bkt_dia_knowledge_governance_terms", {"term": "SME", "synonyms": []},
     "Tìm các bản ghi tri thức liên quan đến thuật ngữ SME, liệt kê tên, mã và loại của từng bản ghi."),
    ("bkt_dia_knowledge_governance_audit", {"item": "báo cáo nhân lực CNS", "older_than_year": 2023},
     "Truy nguồn gốc của báo cáo nhân lực CNS trong cơ sở tri thức: bản ghi gốc (mã, tên, loại dữ "
     "liệu), năm hoặc kỳ dữ liệu, và các văn bản hoặc bản ghi liên quan; chỉ ra bản ghi nào có năm "
     "hoặc kỳ dữ liệu trước năm 2023."),
    ("bkt_dia_knowledge_governance_audit", MINIMAL_ARGS["bkt_dia_knowledge_governance_audit"],
     "Truy nguồn gốc của báo cáo nhân lực CNS trong cơ sở tri thức: bản ghi gốc (mã, tên, loại dữ "
     "liệu), năm hoặc kỳ dữ liệu, và các văn bản hoặc bản ghi liên quan."),
    ("bkt_dia_rag_retrieval_ask",
     {"question": "Có bao nhiêu doanh nghiệp CNS?", "scope": "tại Đà Nẵng, năm 2024",
      "focus": "lĩnh vực phần mềm"},
     "Có bao nhiêu doanh nghiệp CNS? (phạm vi: tại Đà Nẵng, năm 2024) Trả lời chi tiết về lĩnh vực "
     "phần mềm."),
    ("bkt_dia_rag_retrieval_ask", {"question": "Văn bản {mới nhất} về chuyển đổi số?", "scope": " "},
     "Văn bản {mới nhất} về chuyển đổi số?"),
    ("bkt_dia_knowledge_insights_slice",
     {"subject": "ngành phần mềm", "region": "Hà Nội", "indicators": "doanh thu, số lao động",
      "from_year": 2023, "to_year": 2024},
     "Số liệu và thông tin của ngành phần mềm tại Hà Nội về doanh thu, số lao động từ năm 2023 đến "
     "năm 2024, theo từng năm nếu có."),
    ("bkt_dia_knowledge_insights_slice", MINIMAL_ARGS["bkt_dia_knowledge_insights_slice"],
     "Số liệu và thông tin của ngành phần mềm, theo từng năm nếu có."),
    ("bkt_dia_knowledge_insights_breakdown",
     {"measure": "số doanh nghiệp CNS", "dimension": "tỉnh thành", "year": 2024,
      "scope": "lĩnh vực phần mềm"},
     "Thống kê số doanh nghiệp CNS phân theo tỉnh thành năm 2024 trong phạm vi lĩnh vực phần mềm."),
    ("bkt_dia_knowledge_insights_breakdown", MINIMAL_ARGS["bkt_dia_knowledge_insights_breakdown"],
     "Thống kê số doanh nghiệp CNS phân theo tỉnh thành."),
]

TOOL_TO_PLUGIN = {tool: plugin for plugin, (_code, tools) in MODULES.items() for tool in tools}


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


def _load(manager, write_profile, plugin, **settings):
    write_profile(enabled=("bkt-dia-common", plugin), settings=settings)
    manager.discover_and_load()


@pytest.mark.parametrize("plugin", sorted(MODULES))
def test_enabled_module_registers_declared_tools_and_skill(manager, write_profile, plugin):
    code, tools = MODULES[plugin]
    _load(manager, write_profile, plugin)

    loaded = manager._plugins[plugin]
    assert loaded.enabled and loaded.error is None, loaded.error
    assert set(loaded.tools_registered) == set(tools)
    assert set(loaded.manifest.provides_tools) == set(tools)
    validate_module_spec(loaded.module.MODULE, provides_tools=loaded.manifest.provides_tools)
    assert loaded.module.MODULE["function_code"] == code
    assert {"bkt", "diaai", CATEGORY_TAG, code.lower()} <= set(loaded.manifest.tags)
    assert {_entry(manager, t).toolset for t in tools} == {plugin}
    assert manager.find_plugin_skill(f"{plugin}:{plugin}") is not None


@pytest.mark.parametrize("plugin", sorted(MODULES))
def test_disabled_module_registers_nothing(manager, write_profile, plugin):
    write_profile(enabled=("bkt-dia-common",), settings={})
    manager.discover_and_load()

    assert not manager._plugins[plugin].enabled
    assert all(_entry(manager, t) is None for t in MODULES[plugin][1])


@pytest.mark.parametrize("tool", sorted(MINIMAL_ARGS))
def test_tool_answers_from_stub_with_function_code_and_sources(manager, dia_stub, write_profile, tool):
    plugin = TOOL_TO_PLUGIN[tool]
    _load(manager, write_profile, plugin, endpoint=dia_stub.base_url)

    result = _call(manager, tool, MINIMAL_ARGS[tool])

    assert result["ok"] is True
    assert result["function_code"] == MODULES[plugin][0]
    assert result["sources"] == [{"code": "0101234567", "name": "ACME"}]
    assert result["answer"] == dia_stub.payload["answer"]
    assert len(dia_stub.query_requests()) == 1


@pytest.mark.parametrize(("tool", "args", "question"), RENDERINGS,
                         ids=[f"{t}-{i}" for i, (t, _a, _q) in enumerate(RENDERINGS)])
def test_question_sent_to_service(manager, dia_stub, write_profile, tool, args, question):
    _load(manager, write_profile, TOOL_TO_PLUGIN[tool], endpoint=dia_stub.base_url)

    assert _call(manager, tool, args)["ok"] is True

    assert [r.body for r in dia_stub.query_requests()] == [{"question": question}]


@pytest.mark.parametrize("tool", sorted(MINIMAL_ARGS))
def test_unset_endpoint_fails_closed_without_a_request(manager, dia_stub, write_profile, tool):
    plugin = TOOL_TO_PLUGIN[tool]
    _load(manager, write_profile, plugin)

    result = _call(manager, tool, MINIMAL_ARGS[tool])

    assert result["ok"] is False and result["error"] == "bkt-dia endpoint not configured"
    assert result["function_code"] == MODULES[plugin][0] and result["hint"]
    assert "answer" not in result and "sources" not in result
    assert dia_stub.requests == []


@pytest.mark.parametrize("plugin", sorted(MODULES))
def test_http_5xx_fails_closed(manager, dia_stub, write_profile, plugin):
    _load(manager, write_profile, plugin, endpoint=dia_stub.base_url)
    dia_stub.status = 503
    tool = MODULES[plugin][1][0]

    result = _call(manager, tool, MINIMAL_ARGS[tool])

    assert result["ok"] is False and "HTTP 503" in result["error"]
    assert "answer" not in result and "sources" not in result


@pytest.mark.parametrize("tool", sorted(MINIMAL_ARGS))
def test_missing_required_argument_fails_closed_without_a_request(manager, dia_stub, write_profile, tool):
    _load(manager, write_profile, TOOL_TO_PLUGIN[tool], endpoint=dia_stub.base_url)

    result = _call(manager, tool, {})

    assert result["ok"] is False and result["error"].startswith("missing required argument")
    assert dia_stub.requests == []
