"""Behaviour contract of ``plugins.bkt_dia_common.tool_factory``: module-spec validation at
register time, safe question rendering, and the registered handler's result shape."""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest

from plugins.bkt_dia_common.categories import CATEGORIES, category_label, category_tag
from plugins.bkt_dia_common.tool_factory import (
    ModuleSpecError,
    register_module_skills,
    register_query_tools,
    render_question,
    validate_module_spec,
)


@dataclass
class _RecordingCtx:
    """Just the ``ctx`` surface the factory uses; records what a plugin registers."""

    tools: dict[str, dict[str, Any]] = field(default_factory=dict)
    skills: dict[str, tuple[Path, str]] = field(default_factory=dict)

    def register_tool(self, **kwargs: Any) -> None:
        self.tools[kwargs["name"]] = kwargs

    def register_skill(self, name: str, path: Path, description: str = "") -> None:
        self.skills[name] = (path, description)


def _tool(name: str = "bkt_dia_sample_lookup", template: str = "Hỏi về {subject}[[ năm {year}]].") -> dict:
    return {
        "name": name,
        "description": "Sample lookup.",
        "parameters": {
            "type": "object",
            "properties": {"subject": {"type": "string"}, "year": {"type": "integer"}},
            "required": ["subject"],
        },
        "question_template": template,
    }


def _module(**overrides: Any) -> dict:
    module = {"function_code": "F099", "toolset": "bkt-dia-sample", "tools": [_tool()]}
    module.update(overrides)
    return module


def test_valid_module_registers_tools_under_its_toolset():
    ctx = _RecordingCtx()

    names = register_query_tools(ctx, _module())

    assert names == ["bkt_dia_sample_lookup"]
    entry = ctx.tools["bkt_dia_sample_lookup"]
    assert entry["toolset"] == "bkt-dia-sample"
    assert entry["schema"]["name"] == "bkt_dia_sample_lookup"
    assert entry["schema"]["parameters"]["required"] == ["subject"]


@pytest.mark.parametrize("mutate, message", [
    (lambda m: m.update(function_code="15"), "function_code"),
    (lambda m: m.update(toolset="dia-sample"), "toolset"),
    (lambda m: m.update(tools=[]), "1-2 tools"),
    (lambda m: m["tools"][0].update(name="SampleLookup"), "bkt_dia_"),
    (lambda m: m["tools"][0].update(description=""), "description"),
    (lambda m: m["tools"][0].update(parameters={"type": "string"}), "JSON-schema object"),
    (lambda m: m["tools"][0]["parameters"].update(required=["nope"]), "required parameter"),
    (lambda m: m["tools"][0].update(question_template="{undeclared}"), "undeclared"),
    (lambda m: m["tools"][0].pop("question_template"), "question_template"),
])
def test_invalid_spec_raises_at_register(mutate, message):
    module = copy.deepcopy(_module())
    mutate(module)
    ctx = _RecordingCtx()

    with pytest.raises(ModuleSpecError, match=message):
        register_query_tools(ctx, module)
    assert ctx.tools == {}


def test_more_than_two_tools_rejected():
    tools = [_tool(f"bkt_dia_sample_t{i}") for i in range(3)]
    ctx = _RecordingCtx()

    with pytest.raises(ModuleSpecError, match="1-2 tools"):
        register_query_tools(ctx, _module(tools=tools))


def test_provides_tools_must_match_module_tools():
    validate_module_spec(_module(), provides_tools=["bkt_dia_sample_lookup"])
    with pytest.raises(ModuleSpecError, match="provides_tools"):
        validate_module_spec(_module(), provides_tools=["bkt_dia_sample_other"])


@pytest.mark.parametrize("args, expected", [
    ({"subject": "ACME", "year": 2024}, "Hỏi về ACME năm 2024."),
    ({"subject": "ACME"}, "Hỏi về ACME."),
    ({"subject": "ACME", "year": None}, "Hỏi về ACME."),
    ({"subject": "ACME", "year": "  "}, "Hỏi về ACME."),
])
def test_optional_segments_drop_when_value_missing(args, expected):
    assert render_question("Hỏi về {subject}[[ năm {year}]].", args) == expected


def test_braces_in_template_and_values_never_raise_or_expand():
    template = "JSON {\"k\": 1} {subject} {{year}} {unknown} [[x {missing}]]"
    rendered = render_question(template, {"subject": "{year} {0} {__class__}", "year": 7})

    # Literal braces stay, the value's braces are not re-expanded, unknown/missing names render empty.
    assert rendered == "JSON {\"k\": 1} {year} {0} {__class__} {7}"


def test_values_are_flattened_to_one_line():
    assert render_question("{a} | {b}", {"a": "x\n\ny", "b": ["p", "", "q"]}) == "x y | p, q"


def test_boolean_switch_controls_optional_segment():
    template = "Hồ sơ {subject}[[ kèm doanh nghiệp tương tự{similar}]]"
    assert render_question(template, {"subject": "A", "similar": False}) == "Hồ sơ A"
    assert "tương tự" in render_question(template, {"subject": "A", "similar": True})


def test_handler_returns_json_with_function_code_and_fails_closed_on_missing_required(write_profile):
    write_profile(settings={})
    ctx = _RecordingCtx()
    register_query_tools(ctx, _module())
    handler = ctx.tools["bkt_dia_sample_lookup"]["handler"]

    missing = json.loads(handler({}))
    assert missing["ok"] is False and "subject" in missing["error"]
    assert missing["function_code"] == "F099"

    unset = json.loads(handler({"subject": "ACME"}, task_id="t1"))
    assert unset["ok"] is False and unset["error"] == "bkt-dia endpoint not configured"
    assert unset["function_code"] == "F099"


def test_handler_success_carries_function_code(dia_stub, write_profile):
    write_profile(settings={"endpoint": dia_stub.base_url})
    ctx = _RecordingCtx()
    register_query_tools(ctx, _module())

    result = json.loads(ctx.tools["bkt_dia_sample_lookup"]["handler"]({"subject": "ACME", "year": 2023}))

    assert result["ok"] is True and result["function_code"] == "F099"
    assert set(result) >= {"answer", "type", "sources"}
    assert dia_stub.query_requests()[0].body == {"question": "Hỏi về ACME năm 2023."}


def test_register_module_skills_reads_frontmatter_description(tmp_path):
    skill_dir = tmp_path / "skills" / "bkt-dia-sample"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("---\nname: bkt-dia-sample\ndescription: Sample skill.\n---\n# S\n",
                                        encoding="utf-8")
    (tmp_path / "skills" / "not-a-skill").mkdir()
    ctx = _RecordingCtx()

    assert register_module_skills(ctx, tmp_path) == ["bkt-dia-sample"]
    assert ctx.skills["bkt-dia-sample"] == (skill_dir / "SKILL.md", "Sample skill.")


def test_categories_cover_the_seven_slugs_with_vi_and_en_labels():
    assert set(CATEGORIES) == {"shared", "knowledge-rag", "assistant-channels", "domain-lookup",
                               "analysis-forecast", "decision-support", "monitoring-personalization"}
    assert all(labels["vi"] and labels["en"] for labels in CATEGORIES.values())
    assert category_tag("domain-lookup") == "category:domain-lookup"
    assert category_label("shared", "fr") == category_label("shared", "en")
    with pytest.raises(ValueError):
        category_tag("unknown")
