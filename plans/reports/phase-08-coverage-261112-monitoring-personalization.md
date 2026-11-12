# Phase 08 report: monitoring & personalization plugins (F026, F027)

Status: DONE. Category `monitoring-personalization`. No shared, pilot or core files touched; nothing committed.

## Files

- `plugins/bkt-dia-risk-monitor/` (`plugin.yaml`, `__init__.py`, `skills/bkt-dia-risk-monitor/SKILL.md`)
- `plugins/bkt-dia-personalization-insights/` (`plugin.yaml`, `__init__.py`, `skills/bkt-dia-personalization-insights/SKILL.md`)
- `tests/plugins/bkt_dia/test_monitoring_personalization.py` (17 tests)

Manifests: `version: 0.1.0`, tags `[bkt, diaai, category:monitoring-personalization, f026|f027]`, `requires_plugins: bkt-dia-common`, `provides_tools` = registered tools.

## What the data service can answer (basis for coverage)

From `cncns-mcp-chatbot-esquery` `app/core/es_mapping.py` / `app/services/es_prompts.py`: one index with enterprises (`ResPartnerEntity`: status, charter capital, revenue and CIT per year 2022-2025), products, digital-tech parks, legal documents, bid packages, big problems, digital-tech workforce records, research and education facilities, and `Report` statistics by year (enterprise counts, labour, revenue, profit, budget, export/import values incl. phones/cameras/computers, GDP share). Question types are search/count only.

Not indexed: bad debt, liquidity, compliance/violation records, real-time trade flows, labour demand, crawled news, record update timestamps as a guaranteed field, alert state, and any user behaviour or interaction log. The service returns facts, never risk scores or alerts.

## Tools

| Plugin | Tool | Rendered question (shape) |
|---|---|---|
| F026 `bkt-dia-risk-monitor` | `bkt_dia_risk_monitor_check(risk_area*, subject*, period?, compare_with?)` | "Dữ liệu về {risk_area} của {subject}[ trong giai đoạn {period}], theo từng năm kèm mức biến động giữa các kỳ[, so sánh với {compare_with}]." `risk_area` is an enum of five Vietnamese indicator phrases (finance, legal/policy, import-export, workforce, combined). |
| F026 | `bkt_dia_risk_monitor_freshness(subject*, data_type?)` | "Dữ liệu mới nhất hiện có về {subject}[ thuộc loại {data_type}] là của năm hoặc kỳ nào và được cập nhật khi nào?" |
| F027 `bkt-dia-personalization-insights` | `bkt_dia_personalization_insights_suggest(interests*, role?, exclude_topics?)` | "Thông tin, số liệu và văn bản mới nhất liên quan đến {interests}[, phù hợp với vai trò {role}][, ngoài các chủ đề {exclude_topics}]." |

Scheduled monitoring (F026): the skill shows `hermes cron create ... --skill bkt-dia-risk-monitor:bkt-dia-risk-monitor` (plugin skills load in cron through `skill_view`'s qualified `plugin:skill` form). No new scheduler, alert store or notifier.
Preferences and the proactive-mode switch (F027): user-controlled Hermes `memory` (`target: "user"`), saved only on explicit request, default off, effective from the next session (prompt-cache rule).

## Coverage table

| UC | Status | Tool | Note |
|---|---|---|---|
| UC148 Financial risk alert | partial | `bkt_dia_risk_monitor_check` (finance) | Revenue, CIT, capital and operating status per year, plus same-sector comparison via `compare_with`. No debt/liquidity data, so no bad-debt or liquidity alert; push alerts are not covered (cron gives scheduled reports only). Preventive measures are LLM advice, labelled. |
| UC149 Policy / legal violation alert | partial | `bkt_dia_risk_monitor_check` (legal/policy) | Retrieves applicable legal documents and the enterprise status for a human to compare. The service holds no compliance records, so there is no automated violation check. Notifying managers is not covered. The skill forbids a violation conclusion. |
| UC150 Abnormal import-export alert | partial | `bkt_dia_risk_monitor_check` (import-export) | Yearly export/import statistics and period-over-period changes; the LLM flags large swings with a stated threshold. Not real-time, no anomaly model, and notification of agencies is not covered. |
| UC151 Severe workforce shortage alert | partial | `bkt_dia_risk_monitor_check` (workforce) | Labour counts by sector/province and workforce/education facility data (supply side only). No demand data, so a shortage cannot be computed; training/recruitment suggestions are LLM advice. |
| UC156 Cross-source integrated risk alert | partial | `bkt_dia_risk_monitor_check` (combined) | One combined query plus optional single-area calls; integration and prioritised measures are LLM-side analysis, labelled. No scoring engine, no multi-dimensional alert delivery. |
| UC158 Strategic data obsolescence alert | partial | `bkt_dia_risk_monitor_freshness` | Reports the latest year/period held (and update time only if the service returns one). The spec's news-crawl comparison is not covered (no news index), and the UC itself is under-specified (spec 4: processing flow must be added). |
| UC031 Proactive discovery | partial | `bkt_dia_personalization_insights_suggest` + `memory` | "What to ask next" suggestions grounded in the latest data on saved interests; proactive mode on/off as a memory flag the user controls. Silent behaviour remembering is replaced by explicit, user-stated preferences. |
| UC152 Learning from user behaviour | not covered | — | No behaviour collection or analysis, and no model updates (spec 5.3 also rules out auto fine-tuning). Only explicit preferences in memory, which is not behaviour learning. |
| UC153 Personalized advisory content | partial | `bkt_dia_personalization_insights_suggest` (`role`) | Answers and suggestions tailored to a role and topics the user stated. No automatic user classification/segmentation; feedback updates topics only after user confirmation. |
| UC155 Suggestions from lookup history | partial | `bkt_dia_personalization_insights_suggest` (`exclude_topics`) | Uses the user's saved topics and topics in the current conversation; no stored lookup history analysis or habit-based alerts. |
| UC157 Real-time interaction monitoring | not covered | — | No interaction monitoring, anomalous-query detection or security alerts; the skill says so plainly. Needs an analytics/audit backend that does not exist. |

Totals: 0 covered, 9 partial, 2 not covered.

## Verification (outputs)

`scripts/run_tests.sh tests/plugins/bkt_dia/test_monitoring_personalization.py`
```
✓ tests\plugins\bkt_dia\test_monitoring_personalization.py (17✓, 30.0s)
=== Summary: 1 files, 17 tests passed, 0 failed (100% complete) in 30.2s (20 workers) ===
```
Tests: manifest valid via `validate_module_spec(MODULE, provides_tools=...)` + name/category/tags/requires (2); discovery registers exact tools and skill (2); stub happy path returns `function_code` + `sources` and sends the exact rendered question (3); unset endpoint fails closed with zero requests (3); HTTP 503 fails closed (3); missing required argument makes no request (1); one template-rendering test per tool incl. dropped optional segments (3).

`hermes plugins validate plugins/<dir>` for both dirs (scratch `HERMES_HOME` set inside the runner process):
```
✓ capability probe — register() ran in isolation
✓ declared tools — matches registrations
Validation passed.   (rc=0)
```
Plus the known informational warning `⚠ private core imports ... plugins.bkt_dia_common.tool_factory.*` (same as the pilot).

`python scripts/boundary_lint.py --check`: rc=0 (`module_to_core: 843`, `core_to_module: 20`).

`python scripts/check`: 16 checks, only `health` fails on the pre-existing `apps/desktop/src/i18n/vi.ts:1 FILE_LINES 3370 > 2000`. Ruff on the three owned paths: "All checks passed!".

## Notes for other phases

- Validate-probe pitfall (addendum to phase 01 pitfall 8): on this install `run-in-hermes-env python` is a wrapper, so `sys.executable` is the bare interpreter and the capability probe subprocess cannot see the venv's `site-packages` (`No module named 'httpx'`). The runner must also export `PYTHONPATH` with the `site-packages` entries of its own `sys.path` before calling `hermes_cli.main.main()`. Runner used:
  ```python
  import os, sys
  os.environ["HERMES_HOME"] = sys.argv[1]
  os.environ["PYTHONPATH"] = os.pathsep.join(p for p in sys.path if p.endswith("site-packages"))
  sys.argv = ["hermes"] + sys.argv[2:]
  from hermes_cli.main import main
  main()
  ```
- The factory does not enforce JSON-schema `enum` at call time; a model passing a free-text `risk_area` still renders a valid question (capped at 500 chars). Acceptable for a read-only query.

## Unresolved questions

- UC158: what processing flow (owner, threshold, news source) should define "outdated"? The spec flags it as under-specified.
- Should the phase 10 docs present "partial" UCs as "evidence retrieval + labelled analysis" consistently across F021-F027?
