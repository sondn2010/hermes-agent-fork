"""bkt-dia-document-intake (DIA AI F002): look up documents already ingested into the knowledge base.

OCR, speech-to-text, diarization and file parsing (UC005, UC008, UC009, UC064-UC066, UC068) need
processing services this deployment does not have, so this module never touches files or calls an
external OCR. It answers the read side only: which documents/records the DIA query service holds
and the fields already extracted for them (UC004, UC067, partially). Read-only; contract in
``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F002",
    "toolset": "bkt-dia-document-intake",
    "emoji": "📄",
    "tools": [
        {
            "name": "bkt_dia_document_intake_lookup",
            "description": (
                "Look up a document or record already ingested into the DIA AI knowledge base "
                "(legal documents, statistical reports, enterprise or product records) by number, "
                "code, title or topic, and show the fields extracted for it (number, title, summary, "
                "structured fields), with source records. It does not read files or run OCR or "
                "speech-to-text."),
            "parameters": {
                "type": "object",
                "properties": {
                    "document": {
                        "type": "string",
                        "description": "Document number or code (số hiệu, mã), title or topic, as given by the user.",
                    },
                    "record_type": {
                        "type": "string",
                        "description": ("Optional record type, e.g. 'văn bản quy phạm pháp luật', "
                                        "'báo cáo thống kê', 'doanh nghiệp'."),
                    },
                    "fields": {
                        "type": "string",
                        "description": ("Optional extracted fields to show, e.g. 'số hiệu, năm ban hành' "
                                        "or 'mã số thuế, địa chỉ, doanh thu'."),
                    },
                },
                "required": ["document"],
                "additionalProperties": False,
            },
            "question_template": (
                "Tra cứu tài liệu hoặc bản ghi {document}[[ thuộc loại {record_type}]] trong cơ sở "
                "tri thức và cho biết các thông tin đã trích xuất: số hiệu hoặc mã, tiêu đề, tóm tắt "
                "nội dung[[, đặc biệt là {fields}]]."),
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
