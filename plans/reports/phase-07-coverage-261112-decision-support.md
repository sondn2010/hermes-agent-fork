# Phase 07 report: decision-support plugins (F023, F024, F025)

Status: DONE_WITH_CONCERNS (coverage is honestly `partial` for every UC; see below). Nothing committed. Only owned paths touched.

## Files

- `plugins/bkt-dia-policy-advisor/` (`plugin.yaml`, `__init__.py`, `skills/bkt-dia-policy-advisor/SKILL.md`): F023, tools `bkt_dia_policy_advisor_documents`, `bkt_dia_policy_advisor_statistics`.
- `plugins/bkt-dia-strategy-advisor/` (same layout): F024, tools `bkt_dia_strategy_advisor_enterprise`, `bkt_dia_strategy_advisor_market`.
- `plugins/bkt-dia-partner-matchmaking/` (same layout): F025, tools `bkt_dia_partner_matchmaking_tender`, `bkt_dia_partner_matchmaking_candidates`.
- `tests/plugins/bkt_dia/test_decision_support.py` (21 tests).

Manifests: `version: 0.1.0`, `tags: [bkt, diaai, category:decision-support, f02N]`, `requires_plugins: bkt-dia-common`, `provides_tools` = the 2 tools. English description with Vietnamese subtitle. Skills: English, Vietnamese example questions, structured output (data vs labelled analysis vs advisory recommendation), cite `sources`, fail-closed guidance.

## What the data service can and cannot answer (basis for the table)

Read only: `cncns-mcp-chatbot-esquery/app/core/es_mapping.py`, `app/services/es_prompts.py`. The service is NL-to-Elasticsearch retrieval over one index with object types: `ResPartnerEntity` (enterprise: name, tax code, province, `LINH_VUC`, main business lines, charter capital, status), `products`, `digital-technology-park`, `document` (legal documents: title, number, content; **no effective-date / validity field mapped**), `bid-packages` (name, number, price, status, location), `big_problem`, `nhan-luc-cns`, `research-facilities`, `educational-facility`, `Report` (yearly statistics: enterprises/workforce/revenue/profit/state-budget contribution by sector and province, foreign revenue, exports, GDP contribution, workforce by qualification, education facilities by training plan, research-facility costs). Query types: `search_*`, `search_statistics`, `count`, `other`.

It has **no** impact/scenario analytics, scoring, ranking, profitability, risk indicators, forecasts, investment-project entity, or matching service, and no write path (shortlist save). Every "analyse / propose / compare / warn" step is therefore LLM-side analysis on retrieved evidence, labelled as such by the skills. `GET /api/v1/query/test` was not checked live: no endpoint is configured on this machine and nothing answers on 127.0.0.1:8000/8080/8001.

## Coverage table

| UC | Status | Tool | Note |
|---|---|---|---|
| UC137 Khuyến nghị chính sách thuế | partial | `bkt_dia_policy_advisor_documents` (`policy_area: thuế`), `bkt_dia_policy_advisor_statistics` | Retrieves tax legal documents and sector statistics (state-budget contribution, revenue by sector). Impact analysis, sector comparison, adjustment proposals and policy-change risk warnings are LLM analysis; no impact model. Document validity is not in the index. |
| UC138 Khuyến nghị ưu đãi đầu tư | partial | `bkt_dia_policy_advisor_documents` (`ưu đãi đầu tư`), `bkt_dia_policy_advisor_statistics` | Incentive documents plus regional statistics (by province). "Potential investment projects" has no entity in the index; region comparison of incentive effectiveness and new mechanisms are LLM analysis. |
| UC139 Khuyến nghị hỗ trợ R&D | partial | `bkt_dia_policy_advisor_documents` (`nghiên cứu và phát triển (R&D)`), `bkt_dia_policy_advisor_statistics` (e.g. `chi phí nghiên cứu`) | R&D documents and research-facility reports (by field, level, cost, cost allocation). Per-enterprise R&D investment efficiency is not indexed; priority fields and support mechanisms are LLM analysis. |
| UC144 Gợi ý chính sách hỗ trợ thị trường | partial | `bkt_dia_policy_advisor_documents` (`hỗ trợ mở rộng thị trường`), `bkt_dia_policy_advisor_statistics` | Market-support documents plus foreign revenue, exports, revenue by province/sector. Market opportunity analysis, cross-sector policy comparison and competition-risk warnings are LLM analysis. |
| UC140 Gợi ý chiến lược phát triển DN | partial | `bkt_dia_strategy_advisor_enterprise`, `bkt_dia_strategy_advisor_market` | Enterprise capability profile and sector market data; peer comparison via repeated enterprise calls or `focus`. Strategy proposals and risk warnings are LLM analysis. |
| UC141 Đề xuất cơ hội đầu tư | partial | `bkt_dia_strategy_advisor_market` | Market trends from yearly reports (revenue by sector, exports, products by group, bid packages by field, large problems). Profitability comparison between options is not possible (no such data); prioritisation is LLM analysis with shown criteria. |
| UC142 Đề xuất cơ hội hợp tác DN | partial | `bkt_dia_strategy_advisor_enterprise`, `bkt_dia_strategy_advisor_market` | Capability and field of activity of each enterprise. Partner proposals, cooperation-potential comparison and linkage-risk warnings are LLM analysis (candidate search lives in F025). |
| UC143 Khuyến nghị đào tạo nhân lực CLC | partial | `bkt_dia_strategy_advisor_market` (e.g. `nhân lực CNS theo trình độ`, `cơ sở giáo dục theo kế hoạch đào tạo`) | Workforce by province/qualification/age and education facilities by training plan. No skill-demand forecast; training-programme proposals and priorities are LLM analysis. |
| UC145 Đề xuất chiến lược sản phẩm mới | partial | `bkt_dia_strategy_advisor_market`, `bkt_dia_strategy_advisor_enterprise` | Products by group/provider, revenue by sector; enterprise's own products. Technology-trend analysis, competitive-advantage comparison and rollout-risk warnings are LLM analysis. |
| UC146 Đánh giá rủi ro chiến lược DN | partial | `bkt_dia_strategy_advisor_enterprise`, `bkt_dia_strategy_advisor_market` | Status, capital and sector aggregates only; no per-enterprise financial/risk indicators in the index (F016/F021 may add finance). Risk factors, mitigation, peer risk comparison and leader alerts are LLM analysis. |
| UC147 Matchmaking AI (gói thầu / nhu cầu kết nối) | partial | `bkt_dia_partner_matchmaking_tender`, `bkt_dia_partner_matchmaking_candidates` | Both UC flows are served by retrieval: bid package requirements, then candidates by capability/sector/province. Ranking is skill-guided LLM analysis with explicit criteria and "unknown" for missing fields, labelled "analysis, not a matching-service result". No matching/ranking service; shortlist save (`matching.shortlist.save`) not covered (no write path, read-only by design). |

## Verification

`scripts/run_tests.sh tests/plugins/bkt_dia/test_decision_support.py`:
```
[100.0% |     5/~5 | ✓21 | ✗ 0] ✓ tests\plugins\bkt_dia\test_decision_support.py (21✓, 25.5s)
=== Summary: 1 files, 21 tests passed, 0 failed (100% complete) in 25.6s (20 workers) ===
```
Tests per plugin (parametrized): manifest/MODULE contract via `validate_module_spec(MODULE, provides_tools=...)`, tags incl. `category:decision-support`, registered tools == `provides_tools`, toolset == manifest name, skill registered; per tool: happy path through the stub (exact question, `function_code`, `sources`) and a minimal-args template render (optional segments dropped, braces in values kept literal); per plugin: unset endpoint fails closed with zero requests, missing required argument fails closed with zero requests, HTTP 503 fails closed.

`hermes plugins validate plugins/<dir>` for the 3 dirs (plus the pilot as a control): each printed
```
✓ capability probe — register() ran in isolation
✓ declared tools — matches registrations
Validation passed.      (rc=0)
```
with the informational `⚠ private core imports (catalog rule 9) ... plugins.bkt_dia_common.*` warning already explained in the phase 01 report.

`python scripts/boundary_lint.py --check`: rc=0 (`module_to_core: 843`, `core_to_module: 20`, unchanged).

`python scripts/check`: 16 checks; only `health` fails, on the known pre-existing `apps/desktop/src/i18n/vi.ts:1 FILE_LINES 3370 > 2000`. Ruff and every other check are clean.

## Deviation / environment note (validate method)

The phase 01 method (runner setting `HERMES_HOME` in-process) no longer passes on this dev install: the capability probe spawns `sys.executable` (the base interpreter) with `HERMES_HOME=<probe scratch>`, and the PM environment's site-packages are derived from `HERMES_HOME`, so the probe failed with `No module named 'httpx'` for the pilot too. Working method: the scratch runner also prepends the active environment's site-packages (located in-process from `httpx.__file__`) to `PYTHONPATH`, which `_run_capability_probe` preserves. No repo file changed for this. Runner: `C:\Users\AD\AppData\Local\Temp\claude\d789bb703e4b96fb\5a8e2dce-2a98-4b17-9497-62b829bcb97d\scratchpad\validate07.py`, launched as `scripts/run-in-hermes-env python <runner> plugins validate plugins/<dir>`. Phase 09 will hit the same issue.

Status: DONE_WITH_CONCERNS

## Unresolved questions

- No UC in F023/F024/F025 is fully `covered`: the service is retrieval-only. Accept `partial` everywhere, or should a future analytics/matching service be planned?
- Phase file said `version: 0.1.0`; the pilot uses `1.0.0`. I followed the phase file. Phase 09 contract test should not pin a version.
- Legal documents in the index have no effective-date field, so "policy currently in force" cannot be verified; the skill tells the agent to say so.
