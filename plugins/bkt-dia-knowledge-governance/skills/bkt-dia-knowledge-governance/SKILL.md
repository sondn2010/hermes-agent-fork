---
name: bkt-dia-knowledge-governance
description: Check DIA AI knowledge terms, sources and staleness.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, knowledge-governance, F005]
    category: knowledge-rag
    requires_toolsets: [bkt-dia-knowledge-governance]
---

# DIA Knowledge Governance Skill

Read-side checks on the DIA AI knowledge base for data stewards (F005): how a term and its
synonyms are covered, where a record comes from and what it relates to, and which records carry an
old data period. Nothing here changes the knowledge base: sensitivity labels, access policy,
approvals, synonym dictionaries, feedback capture and retraining are not available, and you must
not pretend they were applied.

## When to Use

- Term or keyword coverage, synonym checks (UC021, UC030): `bkt_dia_knowledge_governance_terms`.
  Pass the synonyms and abbreviations you know in `synonyms` (this expansion is yours, so say so).
  - "Trong hệ thống có bao nhiêu bản ghi nói về SME / doanh nghiệp nhỏ và vừa / DNNVV?"
  - "Từ khóa 'chuyển đổi số' xuất hiện trong những văn bản và doanh nghiệp nào?"
- Source tracing (UC029, internal links only): `bkt_dia_knowledge_governance_audit` with the record
  code, title or topic.
  - "Số liệu doanh thu ngành phần mềm này lấy từ báo cáo nào?"
- Stale knowledge (UC022): `bkt_dia_knowledge_governance_audit` with `older_than_year`.
  - "Những báo cáo nào về nhân lực CNS có số liệu cũ hơn năm 2023?"

## When NOT to Use

- Requests to label sensitivity, change access rights, accept or reject a suggestion, save a
  dictionary entry, record feedback or retrain: say this module is read-only and those actions
  need the Core Admin governance workflow.
- External links (WHO, WTO, World Bank): the service only holds internal records. You may suggest
  external references from general knowledge, clearly labelled as your suggestion, never as data.

## Prerequisites

The `bkt-dia-common` and `bkt-dia-knowledge-governance` plugins are enabled and
`plugins.entries.bkt-dia-common.settings.endpoint` points at the DIA query service. If a tool
returns `"ok": false`, show the user its `error` and `hint`.

## Procedure

1. Restate the term, record or topic the user means; ask when it is ambiguous.
2. Call the matching tool. Pass `older_than_year` only when the user gave a cut-off or asked about
   outdated data (then propose a cut-off and say you chose it).
3. Answer from `answer` and `sources` only, citing the records used (code, title, type, year as
   present in `sources`).
4. If `sources_omitted` is present, say that more records exist than were returned.
5. Staleness or relevance judgements are your analysis based on the returned years: label them
   ("đánh giá của trợ lý") and keep them separate from the records.

## Pitfalls

- The service has no freshness score, update timestamp or lineage graph: a year or data period in
  the record is the only signal. If it is absent, say staleness cannot be judged.
- Missing data is an answer: if `sources` is empty, say the term or record is not in the
  knowledge base. Never invent codes, titles or years.
- On `"ok": false` report the failure with its hint; do not retry in a loop and do not answer from
  memory.

## Verification

Every record, code and year in the reply appears in the tool result's `answer` or `sources`;
anything else is labelled as your analysis.
