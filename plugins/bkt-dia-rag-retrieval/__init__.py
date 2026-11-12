"""bkt-dia-rag-retrieval (DIA AI F006): natural-language Q&A over the DIA knowledge base.

Covers UC019, UC023 and UC032 through the shared DIA query service. Retrieval and ranking stay
inside that service (UC020 is partial: no rerank control or scores are exposed). Follow-up and
drill-down context is handled by the agent, which rewrites each turn into a standalone question
(see the skill). Read-only; contract in ``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F006",
    "toolset": "bkt-dia-rag-retrieval",
    "emoji": "🔍",
    "tools": [
        {
            "name": "bkt_dia_rag_retrieval_ask",
            "description": (
                "Ask the DIA AI knowledge base a natural-language question (enterprises, products, "
                "legal documents, bid packages, digital workforce, tech parks, research and education "
                "facilities, statistical reports) and get an answer with source records. Pass a "
                "standalone question: rewrite follow-ups so they name their subject."),
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": ("A standalone question in the user's language, with the subject, "
                                        "place and period spelled out (no 'it' or 'that company')."),
                    },
                    "scope": {
                        "type": "string",
                        "description": "Optional scope to narrow the search, e.g. 'tại Đà Nẵng, năm 2024'.",
                    },
                    "focus": {
                        "type": "string",
                        "description": "Optional drill-down aspect of a previous answer to detail.",
                    },
                },
                "required": ["question"],
                "additionalProperties": False,
            },
            "question_template": "{question}[[ (phạm vi: {scope})]][[ Trả lời chi tiết về {focus}.]]",
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
