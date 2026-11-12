"""bkt-dia-sector-forecast (DIA AI F022): digital-industry workforce, trade, GDP and tender analysis.

No forecasting or ML service exists behind the DIA query service, so the tools only retrieve
multi-period statistics: one unified series tool for workforce, export/import, GDP contribution,
revenue and enterprise counts (UC130-UC135), and one tool for bid-package records and statistics.
The bundled skill guides a transparent, labelled LLM-side trend analysis over that data. UC136
(tender capability/success assessment) has no defined criteria in the spec and is not covered.
Read-only; contract in ``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F022",
    "toolset": "bkt-dia-sector-forecast",
    "emoji": "📊",
    "tools": [
        {
            "name": "bkt_dia_sector_forecast_series",
            "description": (
                "Get digital-industry statistics over the years from the DIA AI data service for one "
                "topic (workforce, export or import value, GDP contribution, revenue, enterprise "
                "count), optionally broken down by province, qualification, age, gender or sector, "
                "with source records. It returns observed data only, never a forecast."),
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": ("Statistic to retrieve, e.g. 'nhân lực công nghệ số', "
                                        "'giá trị xuất khẩu', 'giá trị nhập khẩu', "
                                        "'mức đóng góp của ngành công nghệ số vào GDP', 'doanh thu', "
                                        "'số doanh nghiệp công nghệ số'."),
                    },
                    "breakdown": {
                        "type": "string",
                        "description": ("Optional breakdown, e.g. 'tỉnh thành', 'trình độ', 'độ tuổi', "
                                        "'giới tính', 'lĩnh vực', 'sản phẩm'."),
                    },
                    "sector": {"type": "string", "description": "Optional sector (lĩnh vực), e.g. 'phần mềm'."},
                    "province": {"type": "string", "description": "Optional province or city (tỉnh/thành phố)."},
                    "from_year": {"type": "integer", "description": "Optional first year of the period."},
                    "to_year": {"type": "integer", "description": "Optional last year of the period."},
                },
                "required": ["topic"],
                "additionalProperties": False,
            },
            "question_template": (
                "Số liệu thống kê {topic} của ngành công nghệ số qua các năm"
                "[[ phân theo {breakdown}]][[ trong lĩnh vực {sector}]][[ tại {province}]]"
                "[[ từ năm {from_year}]][[ đến năm {to_year}]]."),
        },
        {
            "name": "bkt_dia_sector_forecast_tenders",
            "description": (
                "Get digital-technology bid packages (gói thầu) and bid-package statistics from the "
                "DIA AI data service, optionally filtered by keyword, statistic breakdown, location "
                "or year, with source records. It does not score an enterprise's tender capability."),
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {
                        "type": "string",
                        "description": "Optional subject, bid number or investor, e.g. 'phần mềm quản lý'.",
                    },
                    "breakdown": {
                        "type": "string",
                        "description": ("Optional statistic breakdown, e.g. 'lĩnh vực', 'loại hợp đồng', "
                                        "'hình thức đấu thầu', 'phương thức lựa chọn', 'địa điểm'."),
                    },
                    "location": {"type": "string", "description": "Optional province or city."},
                    "year": {"type": "integer", "description": "Optional year."},
                },
                "additionalProperties": False,
            },
            "question_template": (
                "Thông tin và thống kê các gói thầu mua sắm công nghệ số"
                "[[ liên quan đến {keyword}]][[ phân theo {breakdown}]][[ tại {location}]]"
                "[[ trong năm {year}]]."),
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
