"""bkt-dia-workforce (DIA AI F019): digital-tech workforce statistics.

Covers, as far as the DIA query service indexes them, UC103, UC113 and UC122: the workforce
statistics reports (total, per digital-tech field, per province, gender, age group and
qualification level) by year. Aggregates only: the tool asks for statistics, never for named
personnel records. Read-only; the contract is in ``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F019",
    "toolset": "bkt-dia-workforce",
    "emoji": "👥",
    "tools": [
        {
            "name": "bkt_dia_workforce_stats",
            "description": (
                "Get digital-tech workforce statistics from the DIA AI data service: headcount, "
                "optionally broken down by province, qualification, gender, age group or field, for "
                "one region, field and year range, with source records. Aggregates only."),
            "parameters": {
                "type": "object",
                "properties": {
                    "breakdown": {
                        "type": "string",
                        "enum": ["tỉnh/thành phố", "trình độ chuyên môn", "giới tính", "độ tuổi", "lĩnh vực"],
                        "description": "Optional breakdown dimension.",
                    },
                    "region": {
                        "type": "string",
                        "description": "Optional province or region, e.g. 'Hà Nội'.",
                    },
                    "sector": {
                        "type": "string",
                        "description": ("Optional field: 'phần mềm', 'phần cứng', 'nội dung số' or "
                                        "'dịch vụ công nghệ số'."),
                    },
                    "from_year": {"type": "integer", "description": "Optional first year of the period."},
                    "to_year": {"type": "integer", "description": "Optional last year of the period."},
                },
                "additionalProperties": False,
            },
            "question_template": (
                "Số liệu thống kê nhân lực công nghệ số[[ phân theo {breakdown}]][[ tại {region}]]"
                "[[ trong lĩnh vực {sector}]][[ từ năm {from_year}]][[ đến năm {to_year}]]."),
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
