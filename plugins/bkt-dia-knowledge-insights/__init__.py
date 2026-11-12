"""bkt-dia-knowledge-insights (DIA AI F007): data for comparisons and trends.

Covers UC024 and UC033 by retrieval: the agent fetches one side at a time (an entity, sector,
region or period) with the slice tool, or a statistic split by one dimension with the breakdown
tool, and writes the comparison itself. Trend and anomaly reading (UC027, UC034) is the agent's
analysis of the returned figures, labelled as such; there is no statistical model, chart export,
BI feed or alerting here. Read-only; contract in ``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F007",
    "toolset": "bkt-dia-knowledge-insights",
    "emoji": "📊",
    "tools": [
        {
            "name": "bkt_dia_knowledge_insights_slice",
            "description": (
                "Get figures and facts for ONE side of a comparison from the DIA AI data service: an "
                "enterprise, sector, market or region, optionally limited to indicators and a year "
                "range, with source records. Call it once per side (A vs B, 2023 vs 2024, region X vs "
                "Y), then compare the results yourself."),
            "parameters": {
                "type": "object",
                "properties": {
                    "subject": {
                        "type": "string",
                        "description": ("Enterprise (name or tax code), sector, market or topic, e.g. "
                                        "'ngành phần mềm', 'doanh nghiệp CNS'."),
                    },
                    "region": {"type": "string", "description": "Optional province, region or country."},
                    "indicators": {
                        "type": "string",
                        "description": "Optional indicators, e.g. 'doanh thu, số lao động, số doanh nghiệp'.",
                    },
                    "from_year": {"type": "integer", "description": "Optional first year."},
                    "to_year": {"type": "integer", "description": "Optional last year."},
                },
                "required": ["subject"],
                "additionalProperties": False,
            },
            "question_template": (
                "Số liệu và thông tin của {subject}[[ tại {region}]][[ về {indicators}]]"
                "[[ từ năm {from_year}]][[ đến năm {to_year}]], theo từng năm nếu có."),
        },
        {
            "name": "bkt_dia_knowledge_insights_breakdown",
            "description": (
                "Get a statistic from the DIA AI data service split by one dimension (province, "
                "sector, year, gender, age group, ...), optionally for one year and scope, with source "
                "records. Use it to group data by entity, region or time."),
            "parameters": {
                "type": "object",
                "properties": {
                    "measure": {
                        "type": "string",
                        "description": "What to count or sum, e.g. 'số doanh nghiệp CNS', 'doanh thu ngành CNS'.",
                    },
                    "dimension": {
                        "type": "string",
                        "description": "The dimension to split by, e.g. 'tỉnh thành', 'lĩnh vực', 'năm'.",
                    },
                    "year": {"type": "integer", "description": "Optional year."},
                    "scope": {
                        "type": "string",
                        "description": "Optional scope, e.g. 'lĩnh vực phần mềm' or 'miền Trung'.",
                    },
                },
                "required": ["measure", "dimension"],
                "additionalProperties": False,
            },
            "question_template": "Thống kê {measure} phân theo {dimension}[[ năm {year}]][[ trong phạm vi {scope}]].",
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
