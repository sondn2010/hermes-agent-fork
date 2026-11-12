# Phase 06 report: analysis & forecast plugins (F021, F022)

Status: DONE_WITH_CONCERNS. Plan: `plans/261112-1101-bkt-modules-page-and-diaai-plugins/`. Nothing committed; no shared or core file touched.

## Delivered

| Plugin dir | Function | Tools (`provides_tools`) | Tags |
|---|---|---|---|
| `plugins/bkt-dia-finance-forecast/` | F021 | `bkt_dia_finance_forecast_history`, `bkt_dia_finance_forecast_benchmark` | `bkt, diaai, category:analysis-forecast, f021` |
| `plugins/bkt-dia-sector-forecast/` | F022 | `bkt_dia_sector_forecast_series`, `bkt_dia_sector_forecast_tenders` | `bkt, diaai, category:analysis-forecast, f022` |

Each dir holds `plugin.yaml` (version 0.1.0, `requires_plugins: bkt-dia-common`), `__init__.py` (`MODULE` + `register`) and `skills/<dir>/SKILL.md`. Tests: `tests/plugins/bkt_dia/test_analysis_forecast.py`.

Design: there is no forecasting/ML service, so every tool retrieves observed multi-period data only. Each SKILL.md requires the observed data first (table with period, unit, source), then a separate section headed `Phân tích tham khảo, không phải dự báo thống kê` that states the method (for example average annual growth or a straight-line trend), the periods used and the arithmetic, projects at most one period ahead and only with at least three consecutive observed periods, and states the uncertainty (no confidence interval, model or backtest).

## What the ES service actually holds (read from `app/core/es_mapping.py`, `app/services/es_prompts.py`)

- Per enterprise (`ResPartnerEntity`): yearly `TaiChinh_<2022..2025>_TongDoanhThuTNDN` and `_TongThueTNDN` (revenue and corporate income tax), charter capital, sector, province, status. No debt, liquidity, overdue debt, operating cost categories, or monthly/quarterly series.
- Industry `Report` types by `Year`: enterprise counts, workforce, revenue, profit, state budget contribution (each by sector), revenue by province, foreign-market revenue, GDP contribution (`dong-gop-gdp`), total import and export value plus export of phones, cameras and computers, workforce by province/gender/age/qualification, bid-package statistics by contract type/method/sector/location.
- `bid-packages` entities: bid number, name, price, status, location. No bidder results or enterprise capability data.

## Coverage table

| UC | Status | Tool | Note |
|---|---|---|---|
| UC126 Phân tích sức khỏe tài chính doanh nghiệp | partial | `bkt_dia_finance_forecast_history`, `bkt_dia_finance_forecast_benchmark` | Revenue/tax trend and sector peer baseline only. Debt, liquidity and repayment capacity are not indexed; the skill says so instead of estimating. |
| UC127 Dự báo doanh thu doanh nghiệp | partial | `bkt_dia_finance_forecast_history` | Yearly revenue (2022-2025) only, no monthly/quarterly. Projection is LLM-side, labelled reference analysis, not a statistical forecast. No chart (text/table only). |
| UC128 Dự báo chi phí hoạt động doanh nghiệp | partial | `bkt_dia_finance_forecast_history` | No operating-cost data by category is indexed; only revenue and income tax can be shown. Effectively a data-availability answer until cost data exists. |
| UC129 Phân tích rủi ro tài chính tổng quan | partial | `bkt_dia_finance_forecast_history`, `bkt_dia_finance_forecast_benchmark` | Risk remarks limited to revenue/tax trends versus the sector baseline. No financial statements, payment capacity or overdue debt data. |
| UC130 Dự báo nhu cầu nhân lực ngành công nghiệp số | partial | `bkt_dia_sector_forecast_series` | Workforce supply by qualification/province/sector over years. No demand series; demand projection is labelled LLM-side trend analysis; training/recruitment suggestions are labelled recommendations. |
| UC131 Phân tích nguồn cung lao động | partial | `bkt_dia_sector_forecast_series` | Totals by province/gender/age/qualification/sector. Skills and job positions per enterprise and cross-enterprise allocation are not indexed. |
| UC132 Dự báo thị trường xuất khẩu | partial | `bkt_dia_sector_forecast_series` | Total export value plus phones/cameras/computers by year; no destination markets, so "potential markets" cannot be identified from data. |
| UC133 Dự báo thị trường nhập khẩu | partial | `bkt_dia_sector_forecast_series` | Total import value by year only; no source countries, products or prices. |
| UC134 Phân tích tác động ngành CNS vào GDP | partial | `bkt_dia_sector_forecast_series` | Sector GDP contribution by year is indexed; per-enterprise and per-region contribution is not. Growth rates are computed LLM-side from returned values. |
| UC135 Tạo báo cáo dự báo tổng quan ngành | partial | `bkt_dia_sector_forecast_series` (one call per topic), `bkt_dia_sector_forecast_tenders` | Text/table synthesis of revenue, workforce, trade, GDP and tender statistics; no chart rendering; outlook labelled reference analysis. |
| UC136 Phân tích Gói thầu / Dự án Lớn | not covered | (`bkt_dia_sector_forecast_tenders` retrieves tender records only) | Spec §5.3: "capability/success" criteria, inputs and method are undefined; pending BA. The skill shows tender records and states the limit. |

## Verification (exact outputs)

`scripts/run_tests.sh tests/plugins/bkt_dia/test_analysis_forecast.py`
```
[100.0% |     5/~5 | ✓16 | ✗ 0] ✓ tests\plugins\bkt_dia\test_analysis_forecast.py (16✓, 37.1s)
=== Summary: 1 files, 16 tests passed, 0 failed (100% complete) in 37.3s (20 workers) ===
```
Tests per plugin: load through real discovery with matching `provides_tools`, category and `f0NN` tags, `validate_module_spec(MODULE, provides_tools=...)`, toolset and skill; stub happy path returns `function_code` and `sources`; unset endpoint fails closed with zero requests. Plus 8 template-rendering cases (2 per tool: full args, optional segments dropped; one checks literal braces in a value), and missing-required / HTTP 502 fail-closed for the two required-arg tools.

`hermes plugins validate plugins/bkt-dia-finance-forecast` and `plugins/bkt-dia-sector-forecast` (rc=0 each):
```
✓ capability probe — register() ran in isolation
✓ declared tools — matches registrations
Validation passed.
```
Same informational `⚠ private core imports ... plugins.bkt_dia_common.*` warning as the pilot.

`python scripts/boundary_lint.py --check`: rc=0 (`module_to_core: 843`, `core_to_module: 20`).

`python scripts/check`: 16 checks, only `health` fails on the known pre-existing `apps/desktop/src/i18n/vi.ts:1 FILE_LINES 3370 > 2000`. Ruff and the other checks pass.

## How validate was run (refines phase 01 pitfall 8)

The capability probe child runs `sys.executable` with a scratch `HERMES_HOME`, and this dev install resolves its venv site-packages from `HERMES_HOME`, so setting only `HERMES_HOME` in the runner made the probe fail with `No module named 'httpx'` (the pilot failed the same way). The working runner (scratchpad, not committed) puts the venv `site-packages` entries from `sys.path` on `PYTHONPATH`, then sets `HERMES_HOME` to a scratch dir in-process and calls `hermes_cli.main.main()` with `plugins validate <dir>`, launched via `scripts/run-in-hermes-env python <runner>`.

## Concerns

- Spec §5.3/§6.1 of F021 says the LLM must not estimate financial values itself and every forecast needs a confidence interval, horizon and model/version. The plan's accepted risk overrides this with labelled LLM-side analysis; the skills keep projections to one period, require ≥3 observed periods, show the arithmetic and state that no confidence interval exists. Stakeholders should confirm this is acceptable until an analytics service exists.
- `version: 0.1.0` and the `diaai` / `f0NN` tags follow the phase file; the pilot uses `1.0.0` and only `bkt`, `category:*`. Phase 09 may want to align them.

## Unresolved questions

- UC136: BA definition of "khả năng đáp ứng / thành công", its inputs and calculation.
- Will the ES index gain enterprise cost, debt and liquidity fields, trade partner breakdowns and workforce demand data? Coverage for UC126-UC133 stays partial until then.
