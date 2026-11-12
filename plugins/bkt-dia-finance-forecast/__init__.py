"""bkt-dia-finance-forecast (DIA AI F021): enterprise finance analysis and trend projection.

No forecasting or ML service exists behind the DIA query service, so the tools only retrieve
multi-period data: one enterprise's yearly finance records (UC126-UC129) and digital-industry
finance totals by sector or province for peer benchmarks. The bundled skill guides a transparent,
labelled LLM-side trend analysis over that data. Read-only; contract in
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
    "function_code": "F021",
    "toolset": "bkt-dia-finance-forecast",
    "emoji": "📈",
    "tools": [
        {
            "name": "bkt_dia_finance_forecast_history",
            "description": (
                "Get one enterprise's year-by-year finance records from the DIA AI data service "
                "(revenue, corporate income tax and other indicators the service holds), with source "
                "records. Use it as the observed history before any financial health, risk or trend "
                "analysis. It returns data only, never a forecast."),
            "parameters": {
                "type": "object",
                "properties": {
                    "enterprise": {
                        "type": "string",
                        "description": "Enterprise name or tax code (mã số thuế), as given by the user.",
                    },
                    **_YEAR_RANGE,
                    "indicators": {
                        "type": "string",
                        "description": "Optional indicators to focus on, e.g. 'doanh thu, thuế TNDN'.",
                    },
                },
                "required": ["enterprise"],
                "additionalProperties": False,
            },
            "question_template": (
                "Số liệu tài chính theo từng năm của doanh nghiệp {enterprise} "
                "(doanh thu, thuế thu nhập doanh nghiệp và các chỉ tiêu tài chính khác nếu có)"
                "[[ từ năm {from_year}]][[ đến năm {to_year}]][[, tập trung vào {indicators}]]."),
        },
        {
            "name": "bkt_dia_finance_forecast_benchmark",
            "description": (
                "Get digital-industry finance statistics over the years from the DIA AI data service "
                "(total revenue, profit, state budget contribution, foreign-market revenue), "
                "optionally for one sector or province, with source records. Use it as the peer or "
                "sector baseline when comparing an enterprise or analysing a sector trend."),
            "parameters": {
                "type": "object",
                "properties": {
                    "indicator": {
                        "type": "string",
                        "description": ("Indicator to retrieve, e.g. 'doanh thu', 'lợi nhuận', "
                                        "'nộp ngân sách nhà nước', 'doanh thu từ thị trường nước ngoài'."),
                    },
                    "sector": {
                        "type": "string",
                        "description": ("Optional sector (lĩnh vực), e.g. 'phần mềm', 'phần cứng', "
                                        "'nội dung số', 'dịch vụ công nghệ số'."),
                    },
                    "province": {"type": "string", "description": "Optional province or city (tỉnh/thành phố)."},
                    **_YEAR_RANGE,
                },
                "required": ["indicator"],
                "additionalProperties": False,
            },
            "question_template": (
                "Thống kê {indicator} của ngành công nghệ số qua các năm"
                "[[ trong lĩnh vực {sector}]][[ tại {province}]]"
                "[[ từ năm {from_year}]][[ đến năm {to_year}]]."),
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
