"""bkt-dia-digital-products (DIA AI F018): digital-tech product and service catalogue.

Covers, as far as the DIA query service indexes them, UC100, UC104, UC110, UC114, UC119, UC123 and
UC124: product/service records (name, code, description) found by keyword or provider, and the
product statistics reports (by product group, by provider). Read-only; the contract is in
``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F018",
    "toolset": "bkt-dia-digital-products",
    "emoji": "📦",
    "tools": [
        {
            "name": "bkt_dia_digital_products_search",
            "description": (
                "Search digital-tech products and services in the DIA AI data service by name, "
                "keyword or field, optionally from one provider enterprise, with source records. "
                "Set 'focus' to ask for one aspect, e.g. similar or alternative products."),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Product name, keyword or field, e.g. 'phần mềm quản lý', 'cloud'.",
                    },
                    "provider": {
                        "type": "string",
                        "description": "Optional provider enterprise name or tax code (mã số thuế).",
                    },
                    "focus": {
                        "type": "string",
                        "description": ("Optional aspect, e.g. 'tiêu chuẩn, chứng nhận' or "
                                        "'sản phẩm tương tự, thay thế'."),
                    },
                },
                "required": ["query"],
                "additionalProperties": False,
            },
            "question_template": (
                "Tìm sản phẩm, dịch vụ công nghệ số liên quan đến {query}"
                "[[ do doanh nghiệp {provider} cung cấp]][[, tập trung vào {focus}]]."),
        },
        {
            "name": "bkt_dia_digital_products_stats",
            "description": (
                "Get digital-tech product statistics from the DIA AI data service, broken down by "
                "product group or by provider, optionally for one year, with source records."),
            "parameters": {
                "type": "object",
                "properties": {
                    "breakdown": {
                        "type": "string",
                        "enum": ["nhóm sản phẩm", "đơn vị cung cấp"],
                        "description": "Breakdown: by product group or by provider.",
                    },
                    "year": {"type": "integer", "description": "Optional year."},
                },
                "required": ["breakdown"],
                "additionalProperties": False,
            },
            "question_template": "Thống kê sản phẩm công nghệ số theo {breakdown}[[ năm {year}]].",
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
