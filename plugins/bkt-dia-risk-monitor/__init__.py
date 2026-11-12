"""bkt-dia-risk-monitor (DIA AI F026): on-demand risk evidence and data-freshness checks.

The DIA query service holds facts (enterprise financials by year, legal documents, trade and
workforce statistics, report years), not risk scores or alerts. So the tools retrieve the
evidence a risk check needs (UC148-UC151, UC156) and the latest available period of a dataset
(UC158); judging the risk is LLM-side analysis the skill labels as such. Scheduled monitoring
uses the existing Hermes cron feature; there is no scheduler, alert store or notifier here.
Read-only. Contract: ``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

# Each value names the indicators the service can return for that risk area, so the rendered
# question asks for data (what /query answers), not for a risk verdict (what it cannot give).
RISK_AREAS = (
    "tình hình tài chính (doanh thu, thuế thu nhập doanh nghiệp, vốn điều lệ, tình trạng hoạt động)",
    "văn bản pháp luật, chính sách áp dụng và tình trạng hoạt động",
    "giá trị xuất khẩu và nhập khẩu",
    "nhân lực và số lao động",
    "tài chính, nhân lực, sản phẩm và xuất nhập khẩu",
)

MODULE = {
    "function_code": "F026",
    "toolset": "bkt-dia-risk-monitor",
    "emoji": "🚨",
    "tools": [
        {
            "name": "bkt_dia_risk_monitor_check",
            "description": (
                "Fetch the evidence for a risk check from the DIA AI data service: figures per year "
                "and changes between periods for an enterprise, sector, province or the whole "
                "digital-tech industry, in one risk area (finance, legal/policy, import-export, "
                "workforce, or all combined), with source records. Returns data, not a risk score."),
            "parameters": {
                "type": "object",
                "properties": {
                    "risk_area": {
                        "type": "string",
                        "enum": list(RISK_AREAS),
                        "description": ("Risk area: finance, legal/policy, import-export, workforce, "
                                        "or the combined cross-domain view (last value)."),
                    },
                    "subject": {
                        "type": "string",
                        "description": ("Enterprise name or tax code, sector, province, or "
                                        "'ngành công nghệ số' for the whole industry."),
                    },
                    "period": {"type": "string", "description": "Optional period, e.g. '2022-2024'."},
                    "compare_with": {
                        "type": "string",
                        "description": "Optional comparison group, e.g. 'các doanh nghiệp cùng ngành'.",
                    },
                },
                "required": ["risk_area", "subject"],
                "additionalProperties": False,
            },
            "question_template": (
                "Dữ liệu về {risk_area} của {subject}[[ trong giai đoạn {period}]], "
                "theo từng năm kèm mức biến động giữa các kỳ[[, so sánh với {compare_with}]]."),
        },
        {
            "name": "bkt_dia_risk_monitor_freshness",
            "description": (
                "Ask the DIA AI data service for the latest year or period it holds for a subject "
                "(an enterprise, report type or dataset) and its update time when recorded, with "
                "source records, to flag possibly outdated strategic data."),
            "parameters": {
                "type": "object",
                "properties": {
                    "subject": {
                        "type": "string",
                        "description": ("What to check, e.g. 'doanh thu ngành công nghệ số' or an "
                                        "enterprise name or tax code."),
                    },
                    "data_type": {
                        "type": "string",
                        "description": "Optional dataset kind, e.g. 'báo cáo thống kê' or 'hồ sơ doanh nghiệp'.",
                    },
                },
                "required": ["subject"],
                "additionalProperties": False,
            },
            "question_template": (
                "Dữ liệu mới nhất hiện có về {subject}[[ thuộc loại {data_type}]] là của năm hoặc "
                "kỳ nào và được cập nhật khi nào?"),
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
