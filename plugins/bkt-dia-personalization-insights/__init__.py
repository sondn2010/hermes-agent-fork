"""bkt-dia-personalization-insights (DIA AI F027): proactive, interest-based suggestions.

The DIA query service indexes business data, not user behaviour, and behaviour learning without
consent is out of scope (spec 5.3: consent, opt-out, data minimisation). So the user states the topics they follow; the
skill keeps them, and the proactive-mode switch, in user-controlled Hermes memory. The one tool
fetches the latest data on those topics, which grounds "what to ask next" suggestions
(UC031, UC153, UC155). Anomalous-query monitoring and model auto-tuning are not provided.
Read-only. Contract: ``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F027",
    "toolset": "bkt-dia-personalization-insights",
    "emoji": "🧭",
    "tools": [
        {
            "name": "bkt_dia_personalization_insights_suggest",
            "description": (
                "Fetch the latest DIA AI data (statistics, enterprises, documents, bid packages) on "
                "the topics a user follows, with source records, to ground proactive 'what to ask "
                "next' suggestions. Pass only topics the user stated or saved, never inferred traits."),
            "parameters": {
                "type": "object",
                "properties": {
                    "interests": {
                        "type": "string",
                        "description": ("Topics the user follows, e.g. 'doanh thu phần mềm, "
                                        "doanh nghiệp CNS tại Đà Nẵng'."),
                    },
                    "role": {
                        "type": "string",
                        "description": "Optional role the user gave, e.g. 'lãnh đạo cục'.",
                    },
                    "exclude_topics": {
                        "type": "string",
                        "description": "Optional topics already covered recently, to skip.",
                    },
                },
                "required": ["interests"],
                "additionalProperties": False,
            },
            "question_template": (
                "Thông tin, số liệu và văn bản mới nhất liên quan đến {interests}"
                "[[, phù hợp với vai trò {role}]][[, ngoài các chủ đề {exclude_topics}]]."),
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
