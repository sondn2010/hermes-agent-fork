"""bkt-dia-import-export (DIA AI F017): digital-tech import and export values.

Covers, as far as the DIA query service indexes them, UC099, UC109 and UC125: industry import and
export value reports by year, export value of key products (phones, cameras, computers) and
foreign-market revenue. One unified tool; trends are compared by calling it once per period.
Read-only; the contract is in ``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F017",
    "toolset": "bkt-dia-import-export",
    "emoji": "🚢",
    "tools": [
        {
            "name": "bkt_dia_import_export_lookup",
            "description": (
                "Look up digital-tech import/export values in the DIA AI data service, optionally "
                "for one product, market, enterprise and year range, with source records. To "
                "compare periods or markets, call once per period or market."),
            "parameters": {
                "type": "object",
                "properties": {
                    "flow": {
                        "type": "string",
                        "enum": ["xuất khẩu", "nhập khẩu", "xuất nhập khẩu"],
                        "description": "Trade direction: export, import, or both.",
                    },
                    "product": {
                        "type": "string",
                        "description": "Optional product or product group, e.g. 'điện thoại', 'máy vi tính'.",
                    },
                    "market": {
                        "type": "string",
                        "description": "Optional market or partner country, e.g. 'Hoa Kỳ'.",
                    },
                    "enterprise": {
                        "type": "string",
                        "description": "Optional enterprise name or tax code (mã số thuế).",
                    },
                    "from_year": {"type": "integer", "description": "Optional first year of the period."},
                    "to_year": {"type": "integer", "description": "Optional last year of the period."},
                },
                "required": ["flow"],
                "additionalProperties": False,
            },
            "question_template": (
                "Số liệu kim ngạch {flow} công nghệ số[[ của sản phẩm {product}]]"
                "[[ tại thị trường {market}]][[ của doanh nghiệp {enterprise}]]"
                "[[ từ năm {from_year}]][[ đến năm {to_year}]]."),
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
