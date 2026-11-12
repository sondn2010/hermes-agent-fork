"""bkt-dia-knowledge-governance (DIA AI F005): read-side checks on the knowledge base.

Covers the read side of UC021, UC022, UC029 and UC030: find records by a term and its synonyms,
trace a record to its source and related records, and flag records whose data period is old.
Governance writes (sensitivity labels, access policy, approvals, feedback capture, retraining)
need policy, confirmation and audit that do not exist here, so no tool writes anything.
Read-only; contract in ``plugins/bkt_dia_common/tool_factory.py``.
"""

from __future__ import annotations

from pathlib import Path

from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

MODULE = {
    "function_code": "F005",
    "toolset": "bkt-dia-knowledge-governance",
    "emoji": "🧭",
    "tools": [
        {
            "name": "bkt_dia_knowledge_governance_terms",
            "description": (
                "Find knowledge-base records that mention a term or keyword, also matching the "
                "synonyms or abbreviations you pass (e.g. SME = doanh nghiệp nhỏ và vừa = DNNVV), "
                "with source records. Use it to check how a term is covered and which related "
                "entities appear."),
            "parameters": {
                "type": "object",
                "properties": {
                    "term": {
                        "type": "string",
                        "description": "The term or keyword, as given by the user.",
                    },
                    "synonyms": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional synonyms or abbreviations of the term to match too.",
                    },
                    "record_type": {
                        "type": "string",
                        "description": ("Optional record type to limit the search, e.g. "
                                        "'văn bản quy phạm pháp luật', 'doanh nghiệp', 'sản phẩm'."),
                    },
                },
                "required": ["term"],
                "additionalProperties": False,
            },
            "question_template": (
                "Tìm các bản ghi tri thức liên quan đến thuật ngữ {term}"
                "[[ (cách gọi tương đương: {synonyms})]][[ trong nhóm {record_type}]], "
                "liệt kê tên, mã và loại của từng bản ghi."),
        },
        {
            "name": "bkt_dia_knowledge_governance_audit",
            "description": (
                "Trace a knowledge-base record or topic to its source: the original record (code, "
                "name, record type), its year or data period, and related documents or records. "
                "Set 'older_than_year' to flag records whose year or data period is before that "
                "year (possibly stale knowledge)."),
            "parameters": {
                "type": "object",
                "properties": {
                    "item": {
                        "type": "string",
                        "description": "Record code or title, or a topic to audit, as given by the user.",
                    },
                    "older_than_year": {
                        "type": "integer",
                        "description": "Optional year: flag records whose year or data period is before it.",
                    },
                },
                "required": ["item"],
                "additionalProperties": False,
            },
            "question_template": (
                "Truy nguồn gốc của {item} trong cơ sở tri thức: bản ghi gốc (mã, tên, loại dữ liệu), "
                "năm hoặc kỳ dữ liệu, và các văn bản hoặc bản ghi liên quan"
                "[[; chỉ ra bản ghi nào có năm hoặc kỳ dữ liệu trước năm {older_than_year}]]."),
        },
    ],
}


def register(ctx) -> None:
    register_query_tools(ctx, MODULE)
    register_module_skills(ctx, Path(__file__).parent)
