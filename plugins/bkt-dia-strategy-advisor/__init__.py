"""bkt-dia-strategy-advisor (DIA AI F024): enterprise capability and market evidence for strategy.

Covers UC140 (development strategy), UC141 (investment opportunities), UC142 (cooperation
opportunities), UC143 (high-quality workforce training), UC145 (new product strategy) and UC146
(strategic risk) as far as the shared DIA query service can: it retrieves one enterprise's
capability profile and sector, market, product, bid, workforce and training data. Strategy,
scoring, profitability comparison and risk assessment are LLM-side analysis built from that
evidence with the skill's report template, labelled as such. Read-only. Contract:
``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F024",
    "toolset": "bkt-dia-strategy-advisor",
    "emoji": "🧭",
    "tools": [
        {
            "name": "bkt_dia_strategy_advisor_enterprise",
            "description": (
                "Get one enterprise's capability profile from the DIA AI data service by name or "
                "tax code: sector, main business lines, charter capital, location, operating status "
                "and the digital products it provides, with source records."),
            "parameters": {
                "type": "object",
                "properties": {
                    "enterprise": {
                        "type": "string",
                        "description": "Enterprise name or tax code (mã số thuế), as given by the user.",
                    },
                    "focus": {
                        "type": "string",
                        "description": ("Optional aspect to focus on, e.g. 'sản phẩm phần mềm' or "
                                        "'doanh nghiệp cùng ngành để so sánh'."),
                    },
                },
                "required": ["enterprise"],
                "additionalProperties": False,
            },
            "question_template": (
                "Năng lực của doanh nghiệp {enterprise}: lĩnh vực hoạt động, ngành nghề kinh doanh "
                "chính, vốn điều lệ, địa bàn, tình trạng hoạt động và các sản phẩm, dịch vụ công nghệ "
                "số doanh nghiệp cung cấp[[, tập trung vào {focus}]]."),
        },
        {
            "name": "bkt_dia_strategy_advisor_market",
            "description": (
                "Get digital-technology market and sector evidence from the DIA AI data service for "
                "a strategy question: revenue and exports by sector, products by group, bid packages "
                "by field, workforce by qualification, training institutions, large problems, "
                "optionally by sector, province and years."),
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": ("What to retrieve, e.g. 'doanh thu theo lĩnh vực', 'giá trị xuất "
                                        "khẩu', 'nhân lực CNS theo trình độ', 'gói thầu theo lĩnh vực'."),
                    },
                    "sector": {
                        "type": "string",
                        "description": "Optional sector, e.g. 'phần mềm', 'phần cứng', 'nội dung số'.",
                    },
                    "province": {"type": "string", "description": "Optional province or city."},
                    "from_year": {"type": "integer", "description": "Optional first year."},
                    "to_year": {"type": "integer", "description": "Optional last year."},
                },
                "required": ["topic"],
                "additionalProperties": False,
            },
            "question_template": (
                "Dữ liệu thị trường và ngành công nghệ số về {topic}[[ trong lĩnh vực {sector}]]"
                "[[ tại {province}]][[ từ năm {from_year}]][[ đến năm {to_year}]]."),
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
