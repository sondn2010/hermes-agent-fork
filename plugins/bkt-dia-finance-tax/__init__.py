"""bkt-dia-finance-tax (DIA AI F016): enterprise finance and tax, sector finance and GDP contribution.

Covers, as far as the DIA query service indexes them, UC098, UC101, UC102, UC108, UC111, UC112,
UC120 and UC121: an enterprise's revenue and tax by year (``TaiChinh_<year>_*`` fields on the
enterprise record) and the sector-wide statistics reports (revenue, profit, state-budget payments,
GDP contribution, per digital-tech field). Read-only; the contract is in
``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

_YEAR_RANGE = {
    "from_year": {"type": "integer", "description": "Optional first year of the period."},
    "to_year": {"type": "integer", "description": "Optional last year of the period."},
}

MODULE = {
    "function_code": "F016",
    "toolset": "bkt-dia-finance-tax",
    "emoji": "💰",
    "tools": [
        {
            "name": "bkt_dia_finance_tax_enterprise_lookup",
            "description": (
                "Look up one enterprise's finance and tax data in the DIA AI data service by name or "
                "tax code: revenue, corporate income tax (TNDN), personal income tax (TNCN) and "
                "charter capital by year, with source records. Set 'focus' to ask for one aspect."),
            "parameters": {
                "type": "object",
                "properties": {
                    "enterprise": {
                        "type": "string",
                        "description": "Enterprise name or tax code (mã số thuế), as given by the user.",
                    },
                    **_YEAR_RANGE,
                    "focus": {
                        "type": "string",
                        "description": "Optional aspect, e.g. 'thuế TNDN', 'doanh thu', 'vốn điều lệ'.",
                    },
                },
                "required": ["enterprise"],
                "additionalProperties": False,
            },
            "question_template": (
                "Tình hình tài chính và nghĩa vụ thuế (doanh thu, thuế TNDN, thuế TNCN, vốn điều lệ) "
                "của doanh nghiệp {enterprise}[[ từ năm {from_year}]][[ đến năm {to_year}]]"
                "[[, tập trung vào {focus}]]."),
        },
        {
            "name": "bkt_dia_finance_tax_sector_stats",
            "description": (
                "Get digital-tech industry statistics from the DIA AI data service: revenue, profit, "
                "state-budget payments or GDP contribution, optionally for one field (software, "
                "hardware, digital content, digital services) and a year range, with source records."),
            "parameters": {
                "type": "object",
                "properties": {
                    "indicator": {
                        "type": "string",
                        "description": ("Indicator, e.g. 'doanh thu', 'lợi nhuận', 'nộp ngân sách nhà "
                                        "nước', 'đóng góp GDP', 'doanh thu theo tỉnh thành'."),
                    },
                    "sector": {
                        "type": "string",
                        "description": ("Optional field: 'phần mềm', 'phần cứng', 'nội dung số' or "
                                        "'dịch vụ công nghệ số'."),
                    },
                    **_YEAR_RANGE,
                },
                "required": ["indicator"],
                "additionalProperties": False,
            },
            "question_template": (
                "Số liệu thống kê {indicator} của ngành công nghiệp công nghệ số"
                "[[ trong lĩnh vực {sector}]][[ từ năm {from_year}]][[ đến năm {to_year}]]."),
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
