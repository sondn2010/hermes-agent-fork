"""bkt-dia-policy-advisor (DIA AI F023): policy documents and sector evidence for policy advice.

Covers UC137 (tax policy), UC138 (investment incentives), UC139 (R&D support) and UC144 (market
support policy) as far as the shared DIA query service can: it retrieves legal and policy
documents and the sector statistics that serve as evidence. Impact analysis, option comparison and
recommendations are LLM-side analysis guided by the skill, labelled as such; the service has no
scenario or impact analytics. Read-only. Contract: ``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F023",
    "toolset": "bkt-dia-policy-advisor",
    "emoji": "📜",
    "tools": [
        {
            "name": "bkt_dia_policy_advisor_documents",
            "description": (
                "Search the DIA AI data service for legal and policy documents (laws, decrees, "
                "circulars) on a policy topic: tax, investment incentives, R&D support or market "
                "support. Returns document numbers, titles and content with source records."),
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": ("Policy topic in the user's words, e.g. 'ưu đãi thuế thu nhập "
                                        "doanh nghiệp cho doanh nghiệp phần mềm'."),
                    },
                    "policy_area": {
                        "type": "string",
                        "enum": ["thuế", "ưu đãi đầu tư", "nghiên cứu và phát triển (R&D)",
                                 "hỗ trợ mở rộng thị trường"],
                        "description": "Optional policy area to narrow the search.",
                    },
                    "year": {"type": "integer", "description": "Optional year of issue."},
                },
                "required": ["topic"],
                "additionalProperties": False,
            },
            "question_template": (
                "Tìm các văn bản quy phạm pháp luật, chính sách về {topic}"
                "[[ trong lĩnh vực chính sách {policy_area}]][[ ban hành năm {year}]], "
                "nêu số hiệu, tên văn bản và nội dung chính."),
        },
        {
            "name": "bkt_dia_policy_advisor_statistics",
            "description": (
                "Get digital-technology sector statistics from the DIA AI data service as evidence "
                "for a policy question (state budget contribution, revenue, foreign revenue, "
                "workforce, research spending, ...), optionally by sector, province and years."),
            "parameters": {
                "type": "object",
                "properties": {
                    "indicator": {
                        "type": "string",
                        "description": ("Indicator to retrieve, e.g. 'nộp ngân sách nhà nước', 'doanh "
                                        "thu từ thị trường nước ngoài', 'chi phí nghiên cứu'."),
                    },
                    "sector": {
                        "type": "string",
                        "description": ("Optional sector, e.g. 'phần mềm', 'phần cứng', 'nội dung số', "
                                        "'dịch vụ công nghệ số'."),
                    },
                    "province": {"type": "string", "description": "Optional province or city."},
                    "from_year": {"type": "integer", "description": "Optional first year."},
                    "to_year": {"type": "integer", "description": "Optional last year."},
                },
                "required": ["indicator"],
                "additionalProperties": False,
            },
            "question_template": (
                "Số liệu thống kê ngành công nghệ số về {indicator}[[ của lĩnh vực {sector}]]"
                "[[ tại {province}]][[ từ năm {from_year}]][[ đến năm {to_year}]]."),
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
