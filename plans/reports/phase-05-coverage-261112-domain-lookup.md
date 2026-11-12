# Phase 05 report: domain lookup plugins (F016-F020)

Status: DONE. Plan: `plans/261112-1101-bkt-modules-page-and-diaai-plugins/`. Nothing committed; no file outside the phase's ownership touched.

## Delivered

| Fn | Plugin dir | Tools (`provides_tools`) | Tags |
|---|---|---|---|
| F016 | `plugins/bkt-dia-finance-tax/` | `bkt_dia_finance_tax_enterprise_lookup`, `bkt_dia_finance_tax_sector_stats` | bkt, diaai, category:domain-lookup, f016 |
| F017 | `plugins/bkt-dia-import-export/` | `bkt_dia_import_export_lookup` | bkt, diaai, category:domain-lookup, f017 |
| F018 | `plugins/bkt-dia-digital-products/` | `bkt_dia_digital_products_search`, `bkt_dia_digital_products_stats` | bkt, diaai, category:domain-lookup, f018 |
| F019 | `plugins/bkt-dia-workforce/` | `bkt_dia_workforce_stats` | bkt, diaai, category:domain-lookup, f019 |
| F020 | `plugins/bkt-dia-tech-zones-projects/` | `bkt_dia_tech_zones_projects_zone_lookup`, `bkt_dia_tech_zones_projects_tender_lookup` | bkt, diaai, category:domain-lookup, f020 |

Each dir holds `plugin.yaml` (version 0.1.0 per the phase file, English description with a Vietnamese subtitle, `requires_plugins: bkt-dia-common`), `__init__.py` (`MODULE` + `register(ctx)` via `register_query_tools` / `register_module_skills`) and `skills/<dir>/SKILL.md` (English, Vietnamese example questions, a "What the data service does not hold" section, cite `sources`, report `ok: false` plainly, label LLM-side analysis). All tools are read-only. 8 tools total; 1 required parameter at most per tool; enums only where the service has a fixed vocabulary (trade flow, product stats breakdown, workforce breakdown).

Tests: `tests/plugins/bkt_dia/test_domain_lookup.py` (37 tests through real `PluginManager` discovery and the phase 01 `dia_stub`).

## How coverage was judged

From the ES service's `app/core/es_mapping.py` and `app/services/es_prompts.py` (read only):

- `ResPartnerEntity` (enterprise): name, tax code, address, province, field, charter capital, status, plus numeric `TaiChinh_<2022-2025>_TongDoanhThuTNDN` / `TongThueTNDN` and `<2022-2024>_TONG_THUE_TNCN`. No profit, VAT, line items, headcount, trade or GDP per enterprise.
- `products`: title, code, description only (no market share, license, key-product or certification fields).
- `digital-technology-park`: name, code, address, province, description (no member enterprises, area or infrastructure fields).
- `bid-packages`: name, bid number, price, status, district/province (no bidder/winner field).
- `nhan-luc-cns`: name, code, job title; `hr-digital-skill` is commented out (skills not indexed).
- `Report` types: industry revenue/profit/budget payments (total and per field: software, hardware, digital content, digital services), revenue by province / by field / from abroad, `dong-gop-gdp` (industry GDP contribution), `gia-tri-nhap-khau`, `gia-tri-xuat-khau`, export of phones/cameras/computers, counts of enterprises with foreign revenue, workforce (total, per field, per province/gender/age/qualification), product stats by group/provider, IT-zone counts, bid stats by contract type/method/field/location. Reports carry `Year`.
- No index for investment projects, trade partners/markets, market share or licensing.

`GET /api/v1/query/test` was not run: no live endpoint is configured in this environment (tests never leave loopback). Judgement is from the mapping and prompt sources only; the live index may hold fewer document types than the mapping declares.

## Coverage table

| UC | Coverage | Tool | Note |
|---|---|---|---|
| UC098 Enterprise financial situation | partial | `bkt_dia_finance_tax_enterprise_lookup` | Revenue (CIT-taxable) and CIT by year 2022-2025, charter capital. No profit or growth data; charts, risk/decline warnings not provided (growth computed LLM-side is labelled analysis). |
| UC101 State-budget obligations | partial | `bkt_dia_finance_tax_enterprise_lookup`, `bkt_dia_finance_tax_sector_stats` | Enterprise CIT and PIT by year; industry budget payments by field. No VAT, no per-period or per-tax-type breakdown below year; peer comparison only by repeated lookups. |
| UC102 GDP contribution of enterprise or industry | partial | `bkt_dia_finance_tax_sector_stats` | Industry-level GDP contribution by year only. Enterprise-level GDP not indexed; forecast not covered (F021). |
| UC108 Detailed financial indicators | not covered | `bkt_dia_finance_tax_enterprise_lookup` | No financial-statement line items or debt/equity/margin ratios indexed; the skill tells the user so. |
| UC111 Tax information by enterprise | partial | `bkt_dia_finance_tax_enterprise_lookup` | CIT and PIT by year. No VAT; tax/revenue ratio is LLM-side analysis; tax-law change notices not covered. |
| UC112 GDP contribution of the digital industry | partial | `bkt_dia_finance_tax_sector_stats` | Industry GDP contribution per year (year-on-year change derivable). No split by region or field; forecast not covered. |
| UC120 Industry financial report | partial | `bkt_dia_finance_tax_sector_stats` | Industry revenue, profit, budget payments, per field and per year; revenue by province. Enterprise efficiency ranking and risk warnings not provided. |
| UC121 Tax and budget Q&A | partial | `bkt_dia_finance_tax_enterprise_lookup` | Overview of CIT/PIT per enterprise. No VAT; late-payment / non-compliance warnings not covered. |
| UC099 Enterprise import/export data | partial | `bkt_dia_import_export_lookup` | Industry-level import and export values by year only. Enterprise-level trade and trading partners by market not indexed; risk warnings not covered. |
| UC109 Import/export by product | partial | `bkt_dia_import_export_lookup` | Export values of phones, cameras, computers by year. Imports by product, peer comparison and per-market trends not indexed. |
| UC125 Digital-product import/export Q&A | partial | `bkt_dia_import_export_lookup` | Same data as UC109 plus foreign-market revenue statistics. Main-market analysis and peer comparison not indexed. |
| UC100 Enterprise products and market | partial | `bkt_dia_digital_products_search` | Products by name or provider. Market value, segment and competition not indexed; alternatives are keyword-search results, labelled as such. |
| UC104 Digital product/service catalogue | partial | `bkt_dia_digital_products_search`, `bkt_dia_digital_products_stats` | Search by enterprise/field/keyword; counts by group/provider. Market-share leaders not indexed; standards/certifications only if stated in the description. |
| UC110 Detailed product market Q&A | not covered | `bkt_dia_digital_products_search` | Distribution by market, market value and share are not indexed; only keyword-based alternative products are returned. |
| UC114 Digital product catalogue | partial | `bkt_dia_digital_products_search`, `bkt_dia_digital_products_stats` | Product list and similar products. Market share/popularity not indexed; standards only from description text. |
| UC119 Digital-tech market overview | partial | `bkt_dia_digital_products_stats` | Product counts by group and provider. Market value, share and growth not indexed; opportunity suggestions are LLM-side analysis. |
| UC123 Licensed (sandbox) products | not covered | — | No license/sandbox or transfer-restriction status in the data; the skill says so instead of searching. |
| UC124 Key digital products | not covered | — | No key/strategic-product flag or economic-value data; the skill says so. |
| UC103 Digital-tech workforce Q&A | partial | `bkt_dia_workforce_stats` | Industry headcount, per field, province and qualification, by year (trend derivable). Single-enterprise headcount not indexed; shortage/training warnings LLM-side only. |
| UC113 Workforce by region | partial | `bkt_dia_workforce_stats` | Headcount by province and by qualification. Skill analysis and enterprise comparison not indexed. |
| UC122 Workforce by skill | partial | `bkt_dia_workforce_stats` | By qualification level only; the skills index is disabled in the service. Shortage/surplus comparison and training suggestions not covered. |
| UC105 Concentrated digital-tech zones | partial | `bkt_dia_tech_zones_projects_zone_lookup` | Zone list, location, description, zone counts. Member enterprises and dominant-field analysis not indexed; suitability suggestions are LLM-side analysis. |
| UC115 Zone details | partial | `bkt_dia_tech_zones_projects_zone_lookup` | Location and description; area/infrastructure only if the description states them. Member enterprise list not indexed. |
| UC117 Digital-tech investment projects | not covered | `bkt_dia_tech_zones_projects_tender_lookup` (adjacent) | No investment-project index. Upcoming procurement needs are visible only as not-yet-tendered bid packages; progress/effectiveness analysis not covered. |
| UC118 Tender history | partial | `bkt_dia_tech_zones_projects_tender_lookup` | Package name, number, value, status, location, plus bid statistics by field/method/location. Comparison by participating bidder and violation/delay warnings not indexed. |

Totals: 25 UCs; 0 covered, 20 partial, 5 not covered (UC108, UC110, UC123, UC124, UC117).

## Verification

`scripts/run_tests.sh tests/plugins/bkt_dia/test_domain_lookup.py`
```
[100.0% |     6/~6 | ✓37 | ✗ 0] ✓ tests\plugins\bkt_dia\test_domain_lookup.py (37✓, 43.7s)
=== Summary: 1 files, 37 tests passed, 0 failed (100% complete) in 43.8s (20 workers) ===
```
Tests per module: manifest `provides_tools` == registered tools and `validate_module_spec(MODULE, provides_tools=...)`; tags include `bkt`, `diaai`, `category:domain-lookup`, `f0NN`; toolset == manifest name; skill registered; every tool renders the exact question received by the stub (one case with all optional segments filled, one with them dropped; a literal `{status}` in a value stays literal) and returns `function_code` + `sources`; unset endpoint fails closed with zero requests; HTTP 503 fails closed with no `answer`/`sources`; a missing required argument fails closed with zero requests.

`hermes plugins validate plugins/<dir>` for all 5 dirs (scratch `HERMES_HOME` set inside the Python process via a runner launched by `scripts/run-in-hermes-env`, as in the phase 01 report): each printed
```
✓ capability probe — register() ran in isolation
✓ declared tools — matches registrations
Validation passed.   (rc=0)
```
plus the known informational `⚠ private core imports (catalog rule 9) ... plugins.bkt_dia_common.*`. The first attempt for finance-tax and import-export failed with `No module named 'httpx'` while the shared dev environment was being re-synced by a concurrent run; both re-runs passed unchanged.

`python scripts/boundary_lint.py --check`: rc=0 (`module_to_core: 843`, `core_to_module: 20`, unchanged).

`python scripts/check`: 16 checks, only `health` fails on the pre-existing `apps/desktop/src/i18n/vi.ts:1 FILE_LINES 3370 > 2000`; ruff and the other checks pass.

## Deviations / notes

- `version: 0.1.0` follows the phase file; the pilot and the factory docstring use 1.0.0. Phase 09 may want one value across all modules.
- Tags add `diaai` and the lowercase function code (phase file), which the pilot does not carry.

## Unresolved questions

- No live `GET /api/v1/query/test` check was possible; should someone with the deployed endpoint confirm which document types the live index actually holds (especially `Report` GDP/import-export types and `nhan-luc-cns`)?
- Should version be aligned (0.1.0 vs pilot 1.0.0) across all 20 modules in phase 09?
