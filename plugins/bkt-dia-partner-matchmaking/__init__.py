"""bkt-dia-partner-matchmaking (DIA AI F025): candidate retrieval for partner matchmaking.

Covers UC147 partially. No matching or ranking service exists, so the tools only retrieve: the
requirements of a bid package (gói thầu) and candidate enterprises by required capability, sector
and region. Ranking is LLM-side analysis guided by the skill, with explicit, shown criteria and
labelled as such; the shortlist is never saved anywhere. Read-only. Contract:
``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F025",
    "toolset": "bkt-dia-partner-matchmaking",
    "emoji": "🤝",
    "tools": [
        {
            "name": "bkt_dia_partner_matchmaking_tender",
            "description": (
                "Get a bid package (gói thầu) from the DIA AI data service by number or name: "
                "field, value, location, status and main requirements, with source records. Use it "
                "to extract the capabilities a partner must have."),
            "parameters": {
                "type": "object",
                "properties": {
                    "bid_package": {
                        "type": "string",
                        "description": "Bid package number (số hiệu, e.g. 'IB2400123456') or name.",
                    },
                },
                "required": ["bid_package"],
                "additionalProperties": False,
            },
            "question_template": (
                "Thông tin chi tiết gói thầu {bid_package}: số hiệu, tên, lĩnh vực, giá trị, địa "
                "điểm, trạng thái và yêu cầu chính."),
        },
        {
            "name": "bkt_dia_partner_matchmaking_candidates",
            "description": (
                "Find candidate partner enterprises in the DIA AI data service by required "
                "capability, optionally by sector and province, with tax code, sector, location, "
                "charter capital and status. Returns candidates only; it does not rank them."),
            "parameters": {
                "type": "object",
                "properties": {
                    "capability": {
                        "type": "string",
                        "description": ("Required capability, business line or product, e.g. 'phát "
                                        "triển phần mềm quản lý', 'tích hợp hệ thống'."),
                    },
                    "sector": {
                        "type": "string",
                        "description": "Optional sector, e.g. 'phần mềm', 'phần cứng', 'nội dung số'.",
                    },
                    "province": {"type": "string", "description": "Optional province or city."},
                },
                "required": ["capability"],
                "additionalProperties": False,
            },
            "question_template": (
                "Tìm các doanh nghiệp công nghệ số có năng lực, ngành nghề hoặc sản phẩm về "
                "{capability}[[ thuộc lĩnh vực {sector}]][[ tại {province}]], kèm mã số thuế, lĩnh "
                "vực, địa bàn, vốn điều lệ và tình trạng hoạt động."),
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
