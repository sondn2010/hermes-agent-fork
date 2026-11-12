"""bkt-dia-channel-assistant (DIA AI F011): DIA answers shaped for voice, chat-app and web channels.

Voice, Zalo OA and the website embed are delivery channels, which Hermes provides as gateway
platforms, the API server and its TTS/STT stack, not tools. This module ships one read-only lookup
(the data behind UC058/UC060 replies) and a skill that keeps channel answers short and
voice-friendly. Channel connection, audio storage and channel statistics are not covered here.
Contract: ``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F011",
    "toolset": "bkt-dia-channel-assistant",
    "emoji": "📣",
    "tools": [
        {
            "name": "bkt_dia_channel_assistant_lookup",
            "description": (
                "Look up the facts for a channel user's question (voice, chat app, embedded web chat) "
                "in the DIA AI data service: enterprises, products, legal documents, bid packages, "
                "workforce, technology parks, research and education facilities, statistics. Returns "
                "an answer with source records; shorten it for the channel yourself."),
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The user's question in Vietnamese (transcribed text for voice).",
                    },
                    "scope": {
                        "type": "string",
                        "enum": [
                            "doanh nghiệp", "sản phẩm, dịch vụ công nghệ số", "văn bản quy phạm pháp luật",
                            "gói thầu", "nhân lực công nghệ số", "khu công nghệ số tập trung",
                            "cơ sở nghiên cứu", "cơ sở giáo dục", "bài toán lớn", "số liệu thống kê",
                        ],
                        "description": "Optional data domain when the question clearly names one.",
                    },
                },
                "required": ["question"],
                "additionalProperties": False,
            },
            "question_template": "{question}[[ (phạm vi dữ liệu: {scope})]]",
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
