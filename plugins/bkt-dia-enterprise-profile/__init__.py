"""bkt-dia-enterprise-profile (DIA AI F015): enterprise profile lookup and profile history.

Covers UC097 (look up an enterprise by name or tax code, summary, similar enterprises) and UC107
(profile over the years, period comparison) through the shared DIA query service. Read-only.
This is the template every bkt-dia module copies; the contract is in
``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F015",
    "toolset": "bkt-dia-enterprise-profile",
    "emoji": "🏢",
    "tools": [
        {
            "name": "bkt_dia_enterprise_profile_lookup",
            "description": (
                "Look up an enterprise's current profile in the DIA AI data service by name or tax "
                "code: identity, status, sector and key facts, with source records. Set 'focus' to "
                "ask for one aspect, e.g. similar enterprises in the same sector."),
            "parameters": {
                "type": "object",
                "properties": {
                    "enterprise": {
                        "type": "string",
                        "description": "Enterprise name or tax code (mã số thuế), as given by the user.",
                    },
                    "focus": {
                        "type": "string",
                        "description": ("Optional aspect to focus on, e.g. 'ngành nghề kinh doanh' or "
                                        "'doanh nghiệp tương tự cùng lĩnh vực'."),
                    },
                },
                "required": ["enterprise"],
                "additionalProperties": False,
            },
            "question_template": (
                "Tra cứu hồ sơ và thông tin tổng quan của doanh nghiệp {enterprise}"
                "[[, tập trung vào {focus}]]."),
        },
        {
            "name": "bkt_dia_enterprise_profile_history",
            "description": (
                "Get an enterprise's profile history over the years from the DIA AI data service, "
                "optionally limited to a year range and to the indicators to compare (revenue, "
                "workforce, ...), with source records."),
            "parameters": {
                "type": "object",
                "properties": {
                    "enterprise": {
                        "type": "string",
                        "description": "Enterprise name or tax code (mã số thuế).",
                    },
                    "from_year": {"type": "integer", "description": "Optional first year of the period."},
                    "to_year": {"type": "integer", "description": "Optional last year of the period."},
                    "indicators": {
                        "type": "string",
                        "description": "Optional indicators to compare, e.g. 'doanh thu, số lao động'.",
                    },
                },
                "required": ["enterprise"],
                "additionalProperties": False,
            },
            "question_template": (
                "Hồ sơ lịch sử của doanh nghiệp {enterprise} qua các năm"
                "[[ từ năm {from_year}]][[ đến năm {to_year}]][[, so sánh {indicators} theo từng giai đoạn]]."),
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
