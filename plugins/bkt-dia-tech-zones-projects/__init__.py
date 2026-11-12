"""bkt-dia-tech-zones-projects (DIA AI F020): digital-tech zones and procurement packages.

Covers, as far as the DIA query service indexes them, UC105, UC115, UC117 and UC118: concentrated
digital-tech zone records (name, address, province, description) and zone statistics, and
digital-tech bid packages (name, number, value, status, location) with their statistics reports.
Investment-project records are not indexed by the service. Read-only; the contract is in
``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

_FOCUS = {
    "type": "string",
    "description": "Optional aspect to focus on, as worded by the user.",
}

MODULE = {
    "function_code": "F020",
    "toolset": "bkt-dia-tech-zones-projects",
    "emoji": "🏗️",
    "tools": [
        {
            "name": "bkt_dia_tech_zones_projects_zone_lookup",
            "description": (
                "Look up concentrated digital-tech zones (khu công nghệ số tập trung) in the DIA AI "
                "data service: list zones, or one zone's location and description, optionally in one "
                "province, with source records."),
            "parameters": {
                "type": "object",
                "properties": {
                    "zone": {
                        "type": "string",
                        "description": "Optional zone name or code; omit to list zones.",
                    },
                    "province": {
                        "type": "string",
                        "description": "Optional province, e.g. 'Đà Nẵng'.",
                    },
                    "focus": _FOCUS,
                },
                "additionalProperties": False,
            },
            "question_template": (
                "Thông tin khu công nghệ số tập trung[[ {zone}]][[ tại {province}]]"
                "[[, tập trung vào {focus}]]."),
        },
        {
            "name": "bkt_dia_tech_zones_projects_tender_lookup",
            "description": (
                "Look up digital-tech procurement bid packages (gói thầu) in the DIA AI data service "
                "by keyword, bid number, status, location, party and year range: name, value, status "
                "and location, with source records. Set 'focus' for statistics, e.g. by field."),
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {
                        "type": "string",
                        "description": "Optional subject keyword or bid number, e.g. 'phần mềm', 'IB2400012345'.",
                    },
                    "status": {
                        "type": "string",
                        "description": "Optional status, e.g. 'đã đấu thầu', 'chưa đấu thầu', 'đã hoàn thành'.",
                    },
                    "province": {"type": "string", "description": "Optional province of the package."},
                    "party": {
                        "type": "string",
                        "description": "Optional procuring entity or bidder name.",
                    },
                    "from_year": {"type": "integer", "description": "Optional first year of the period."},
                    "to_year": {"type": "integer", "description": "Optional last year of the period."},
                    "focus": _FOCUS,
                },
                "additionalProperties": False,
            },
            "question_template": (
                "Tra cứu gói thầu mua sắm công nghệ số[[ liên quan đến {keyword}]]"
                "[[ có trạng thái {status}]][[ tại {province}]][[ của đơn vị {party}]]"
                "[[ từ năm {from_year}]][[ đến năm {to_year}]][[, tập trung vào {focus}]]."),
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
