"""bkt-dia-admin-assistant (DIA AI F010): admin Q&A over enterprises, products and documents.

Covers UC046 (enterprise/product Q&A with sources), UC047 (legal document Q&A quoting the
original provisions) and UC050 (summaries of indexed documents and reports) through the shared
DIA query service. Read-only. Question templates (UC048) live as examples in the skill; history
(UC049), model selection (UC051) and language/voice settings (UC052) are existing Hermes features
the skill points to, so this module adds no tools for them. Contract:
``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F010",
    "toolset": "bkt-dia-admin-assistant",
    "emoji": "🧭",
    "tools": [
        {
            "name": "bkt_dia_admin_assistant_ask",
            "description": (
                "Ask the DIA AI data service a question about digital-technology enterprises or "
                "digital products and services, in the user's own words; returns an answer with "
                "source records. Set 'subject' when the question is clearly about one of them."),
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The question in Vietnamese, as the user asked it.",
                    },
                    "subject": {
                        "type": "string",
                        "enum": ["doanh nghiệp công nghệ số", "sản phẩm, dịch vụ công nghệ số"],
                        "description": "Optional data domain the question is about.",
                    },
                },
                "required": ["question"],
                "additionalProperties": False,
            },
            "question_template": "{question}[[ (phạm vi dữ liệu: {subject})]]",
        },
        {
            "name": "bkt_dia_admin_assistant_documents",
            "description": (
                "Find legal documents (văn bản quy phạm pháp luật) or summary reports on a subject in "
                "the DIA AI data service: number, title, date or year and the relevant content, "
                "optionally with a short or detailed summary, with source records."),
            "parameters": {
                "type": "object",
                "properties": {
                    "subject": {
                        "type": "string",
                        "description": "What the document is about, e.g. 'chuyển đổi số', 'ưu đãi thuế phần mềm'.",
                    },
                    "document_type": {
                        "type": "string",
                        "enum": ["văn bản quy phạm pháp luật", "báo cáo tổng hợp"],
                        "description": "Optional: a legal document or a statistical summary report.",
                    },
                    "document_code": {
                        "type": "string",
                        "description": "Optional document number (số hiệu), e.g. '13/2023/NĐ-CP'.",
                    },
                    "summary_level": {
                        "type": "string",
                        "enum": ["ngắn gọn", "chi tiết"],
                        "description": "Optional summary depth; omit when no summary was asked for.",
                    },
                },
                "required": ["subject"],
                "additionalProperties": False,
            },
            "question_template": (
                "Tra cứu văn bản[[ ({document_type})]][[ số hiệu {document_code}]] về {subject}: nêu số "
                "hiệu, tên, thời điểm ban hành hoặc năm báo cáo và nội dung liên quan"
                "[[, kèm bản tóm tắt {summary_level}]]."),
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
