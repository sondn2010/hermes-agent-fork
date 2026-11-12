# Phase 03 report: Knowledge & RAG plugins (F002, F005, F006, F007)

Status: DONE_WITH_CONCERNS (see Concerns). Plan: `plans/261112-1101-bkt-modules-page-and-diaai-plugins/`. Nothing committed; no shared/core file touched.

## Plugins

| Fn | Plugin dir | Tools | Tags |
|---|---|---|---|
| F002 | `plugins/bkt-dia-document-intake/` | `bkt_dia_document_intake_lookup` | `bkt, diaai, category:knowledge-rag, f002` |
| F005 | `plugins/bkt-dia-knowledge-governance/` | `bkt_dia_knowledge_governance_terms`, `bkt_dia_knowledge_governance_audit` | `... f005` |
| F006 | `plugins/bkt-dia-rag-retrieval/` | `bkt_dia_rag_retrieval_ask` | `... f006` |
| F007 | `plugins/bkt-dia-knowledge-insights/` | `bkt_dia_knowledge_insights_slice`, `bkt_dia_knowledge_insights_breakdown` | `... f007` |

Each dir: `plugin.yaml` (version 0.1.0, `requires_plugins: bkt-dia-common`, `provides_tools` = registered tools), `__init__.py` (`MODULE` + `register`), `skills/<dir>/SKILL.md`. All tools are read-only `/api/v1/query` wrappers built by `register_query_tools`.

## What the data service can answer (basis for the table)

Read from `cncns-mcp-chatbot-esquery` (`app/core/es_mapping.py`, `app/services/es_prompts.py`, `app/api/routers/query.py`): one ES index `searchindex-library-irm`, keyword/BM25 `multi_match` with field boosts (no vector store, no knowledge graph, no reranker API). An LLM writes the ES query from the question. Entity types: enterprises (`ResPartnerEntity`), products, tech parks, legal documents (`document`: title, code, description, content), bid packages, big problems, digital workforce (`nhan-luc-cns`), research and education facilities, statistical `Report` (ReportType + Year, breakdowns by province/sector/gender/age/level). No ingestion status, OCR/STT output, confidence, author, update timestamp, sensitivity label, access policy, lineage or feedback store is indexed. `type` values: `search_entity`, `search_product`, `search_document`, `search_bid_packages`, `search_hr`, `search_science`, `search_statistics`, `count`, `other`. Max 50 hits per query.

## Coverage table

| UC | Coverage | Tool | Note |
|---|---|---|---|
| UC004 Metadata extraction | partial | `bkt_dia_document_intake_lookup` | Shows metadata already indexed (code/number, title, description, report year). Extraction, cleaning, saving and error handling are pipeline work that does not exist here. Author/time/source metadata not indexed. |
| UC005 Read full text of Word/PDF | not covered | — | No file reading or image/chart text extraction. Indexed `content` of existing records is searchable via the lookup tool only. |
| UC006 Manual e-form entry | not covered | — | Write path (form, upload, validate, save) out of scope; tools are read-only. |
| UC008 Speech-to-text | not covered | — | No STT service. |
| UC009 OCR image to text | not covered | — | No OCR service; the module never calls an external OCR. |
| UC064 AI speech recognition | not covered | — | No STT service. |
| UC065 Speaker diarization | not covered | — | No diarization service; renaming speakers is a write. |
| UC066 Post-STT text correction | not covered | — | Depends on STT output that does not exist. |
| UC067 Structured document recognition | partial | `bkt_dia_document_intake_lookup` (`fields`) | Returns structured fields already stored for records (e.g. tax code, address, revenue by year for enterprises). Layout recognition, schema classification and review/approve are not available. |
| UC068 Text normalization pre-processing | not covered | — | Ingestion pipeline concern; nothing to call. |
| UC021 Keyword/entity suggestion | partial | `bkt_dia_knowledge_governance_terms` | Finds records and related entities for a term. Keyword suggestions are LLM-side (labelled); accept/reject/save is a write: not covered. |
| UC022 Detect outdated knowledge | partial | `bkt_dia_knowledge_governance_audit` (`older_than_year`) | Only signal is a record's year/data period (reports, documents). No freshness score, alerting or restriction marking; judgement is LLM-side and labelled. |
| UC025 Sensitivity/priority classification | not covered | — | No sensitivity labels or policy data in the index; classification and policy suggestion would be writes/policy decisions. |
| UC026 RAG/LLM access by data group | not covered | — | Access-policy write; service has a single shared identity (plan decision 1 of validation session). |
| UC029 External linking | partial | `bkt_dia_knowledge_governance_audit` | Traces a record to its source and internal related records. External references (WHO/WTO/WB) are not in the data; the skill allows labelled LLM suggestions only. Confirm/save relation: not covered. |
| UC030 Synonym/term normalization | partial | `bkt_dia_knowledge_governance_terms` (`synonyms`) | Agent expands synonyms/abbreviations (SME = DNNVV) into the query, labelled as its expansion. No sector dictionary storage. |
| UC035 Feedback loop / retraining | not covered | — | Feedback capture, fine-tuning and pruning are writes with no backing service. |
| UC019 Natural-language semantic search | covered | `bkt_dia_rag_retrieval_ask` | NL question in, answer + sources out; the service normalizes the question into an ES query. Note: retrieval is keyword/BM25 with boosts, not vector search. |
| UC020 Reranking | partial | `bkt_dia_rag_retrieval_ask` | Field boosting and LLM query building stay inside the ES service; no rerank control, scores or hallucination check exposed. Skill forbids claiming scores. |
| UC023 Contextual adaptive query | covered | `bkt_dia_rag_retrieval_ask` (`scope`, `focus`) | Intent and follow-up context handled by the agent (standalone rewrite); widen/narrow suggestions and "why this result" explanations are LLM-side, labelled. |
| UC032 Conversational RAG | partial | `bkt_dia_rag_retrieval_ask` (`focus`) | Follow-up and drill-down work through agent rewriting. No knowledge-graph retrieval exists in the service. |
| UC024 Multi-dimensional comparison | partial | `bkt_dia_knowledge_insights_slice` | One query per side, comparison synthesised by the agent (labelled) as a text table. No chart rendering. |
| UC027 Knowledge trend over time | partial | `bkt_dia_knowledge_insights_slice` / `_breakdown` (by year) | Year series retrieved from data; trend reading is LLM-side and labelled. Paragraph-frequency trends and BI API export: not covered. |
| UC033 Compare by entity/region/time | covered | `bkt_dia_knowledge_insights_breakdown`, `_slice` | Statistics grouped by province/sector/year from `Report` records; table/bullet output and follow-up dimension suggestions by the agent. |
| UC034 Anomaly & pattern detection | partial | `bkt_dia_knowledge_insights_slice` | LLM-side reading of retrieved series, labelled "analysis, not a statistical model"; no baseline/threshold. Real-time dashboard/email alerts: not covered. |

Totals: covered 3 (UC019, UC023, UC033); partial 11; not covered 11.

## Verification (exact outputs)

`scripts/run_tests.sh tests/plugins/bkt_dia/test_knowledge_rag.py`
```
[100.0% |     7/~7 | ✓42 | ✗ 0] ✓ tests\plugins\bkt_dia\test_knowledge_rag.py (42✓, 48.4s)
=== Summary: 1 files, 42 tests passed, 0 failed (100% complete) in 48.6s (20 workers) ===
```
Tests (all through real `PluginManager.discover_and_load` in a temp `HERMES_HOME`): per plugin, manifest/`provides_tools`/`validate_module_spec`/tags/toolset/skill; disabled registers nothing; HTTP 503 fails closed. Per tool: stub happy path returns `function_code` + `sources`; unset endpoint fails closed with zero requests; missing required argument fails closed with zero requests. 12 template renderings (full and minimal per tool, incl. literal braces and blank optional values) asserted on the request body the stub received.

`hermes plugins validate plugins/<dir>` (scratch `HERMES_HOME` set inside Python, launched via `scripts/run-in-hermes-env python <runner> ... plugins validate <dir>`), each of the 4 dirs:
```
✓ capability probe — register() ran in isolation
✓ declared tools — matches registrations
Validation passed.   (rc=0)
```
Same informational `⚠ private core imports (catalog rule 9) ... plugins.bkt_dia_common.*` warning as phase 01. The first document-intake run failed `capability probe — import failed: No module named 'httpx'` while another agent's PM sync held `tools\.install.lock`; the re-run passed unchanged.

`python scripts/boundary_lint.py --check`: rc=0 (`module_to_core: 843`, `core_to_module: 20`, unchanged).

`python scripts/check`: 16 checks, only `health` fails on the known `apps/desktop/src/i18n/vi.ts:1 FILE_LINES 3370 > 2000`. Ruff and everything else clean.

## Concerns

- No live ES endpoint was available, so `GET /api/v1/query/test` was not run; coverage is judged from the service source. Real answer quality for governance/staleness prompts (which ask the ES-query LLM for source and year) is unverified against live data.
- `plugin.yaml` uses `version: 0.1.0` per the phase file; the pilot and the factory docstring say `1.0.0`. Phase 09 should decide whether versions must match.

## Unresolved questions

- Should modules use `0.1.0` (phase file) or `1.0.0` (pilot/factory docstring)?
