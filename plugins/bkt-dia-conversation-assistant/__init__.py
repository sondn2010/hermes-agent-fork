"""bkt-dia-conversation-assistant (DIA AI F012): context-aware domain questions in a conversation.

Most of F012 (clarifying questions, goal-led sessions, conversation summaries, follow-up
suggestions, read-aloud) is agent behaviour, so the skill carries it and uses existing Hermes
features (sessions, ``text_to_speech``, vision). The one read-only tool answers a domain question
together with the conversation or page context the user is in (UC076, UC079, UC106, UC116).
It does not duplicate the F006 RAG retrieval tools; the skill prefers those when enabled.
Contract: ``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F012",
    "toolset": "bkt-dia-conversation-assistant",
    "emoji": "💬",
    "tools": [
        {
            "name": "bkt_dia_conversation_assistant_ask",
            "description": (
                "Ask the DIA AI data service a domain question (enterprises, products, legal "
                "documents, bid packages, workforce, statistics) rewritten as a complete question, "
                "plus the conversation or page context it depends on; returns an answer with "
                "source records."),
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": ("A self-contained question in Vietnamese: resolve 'nó', 'công ty "
                                        "đó' and similar references from the conversation first."),
                    },
                    "context": {
                        "type": "string",
                        "description": ("Optional context the answer depends on, e.g. the enterprise or "
                                        "page the user is viewing, or the conversation topic."),
                    },
                },
                "required": ["question"],
                "additionalProperties": False,
            },
            "question_template": "{question}[[ (ngữ cảnh: {context})]]",
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
