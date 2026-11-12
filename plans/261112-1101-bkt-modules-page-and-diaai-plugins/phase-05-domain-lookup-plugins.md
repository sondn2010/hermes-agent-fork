---
phase: 05
title: Domain lookup plugins
wave: B
status: done
depends_on: [01]
---

# Phase 05: Domain lookup plugins (`category:domain-lookup`)

## Context
- Read: root `AGENTS.md`, `plugins/AGENTS.md`, `plan.md` (architecture and contracts), the phase 01 template plugin and `plugins/bkt_dia_common/tool_factory.py`.
- Spec root: `D:\Sources\fish\outsources\ironman-all\ironman-diaai-system\docs\DIAAI_SPECS` (function catalog, `03-Function-Specs/`, `02-Function-Catalog/function-uc-mapping.md`).
- Data service contract: `POST /api/v1/query {"question"}` returns `{answer, question, type, sources}`.

## Files owned (exclusive)
- `plugins/bkt-dia-finance-tax/`
- `plugins/bkt-dia-import-export/`
- `plugins/bkt-dia-digital-products/`
- `plugins/bkt-dia-workforce/`
- `plugins/bkt-dia-tech-zones-projects/`
- `tests/plugins/bkt_dia/test_domain_lookup.py`

## Modules
| Fn | Plugin dir | UCs | Design notes |
|---|---|---|---|
| F016 | `bkt-dia-finance-tax` | UC098, UC101, UC102, UC108, UC111, UC112, UC120, UC121 | Financial statements, detailed indicators, tax and budget obligations, GDP contribution by enterprise, sector or period. |
| F017 | `bkt-dia-import-export` | UC099, UC109, UC125 | Trade value by enterprise, product, period or market; trading partners; trend comparison through two queries. |
| F018 | `bkt-dia-digital-products` | UC100, UC104, UC110, UC114, UC119, UC123, UC124 | Product and service catalogue, licensed or key products, market share, certifications, competitors. |
| F019 | `bkt-dia-workforce` | UC103, UC113, UC122 | Workforce size, distribution, qualifications and skills, demand by enterprise, sector or region. |
| F020 | `bkt-dia-tech-zones-projects` | UC105, UC115, UC117, UC118 | Digital tech zones, infrastructure, enterprises in a zone, investment projects, bid history. |

## Shared procedure (identical in phases 03-08)
- **Template:** copy `plugins/bkt-dia-enterprise-profile/` (phase 01) and follow the contract docstring in `plugins/bkt_dia_common/tool_factory.py`. Each plugin is a `plugin.yaml` (`name`, `version: 0.1.0`, an English `description` with a Vietnamese subtitle, `tags: [bkt, diaai, category:domain-lookup, <function code lowercase>]`, and mandatory `provides_tools: [<tool_name>, ...]` matching registrations), an `__init__.py` holding the `MODULE` spec plus `register(ctx)`, and `skills/<dir>/SKILL.md`.
- **Read the spec** `DIAAI_SPECS/03-Function-Specs/<fNNN>-*.md` in full before designing tools. Turn each UC into a read-only tool (or a parameter of a shared tool) when the ES `/api/v1/query` service can answer it. Cap at **1-2 tools per plugin** (preferring a unified query tool with query parameters) to keep model prompt tokens bounded.
- **Never edit** `plugins/bkt_dia_common/**`. If the factory lacks something you need, stop and report `NEEDS_CONTEXT` with the exact gap.
- **SKILL.md** says when to use each tool, to cite `sources`, to state plainly when data is missing or the service is unreachable, and to label LLM-side reasoning as such. Write it in English with Vietnamese example questions.
- **Coverage table:** write it in the phase report `plans/reports/phase-05-coverage-261112-domain-lookup.md` as `UC | covered / partial / not covered | tool | note`. Phase 10 publishes it.
- **Tests** go in your one test file `tests/plugins/bkt_dia/test_domain_lookup.py`, using the phase 01 `conftest.py` stub server (`/api/v1/query`). For every plugin: the manifest is valid with matching `provides_tools`, the category tag is present, `register` adds the expected tools, a happy path through the stub returns `function_code` and `sources`, and an unset endpoint fails closed with no request made. Also add one template-rendering test per tool.
- **Validate:** `hermes plugins validate plugins/<dir>` for each dir (ensuring 0 undeclared tools); `scripts/run_tests.sh tests/plugins/bkt_dia/test_domain_lookup.py`; `python scripts/boundary_lint.py --check`.
- **Report** ends with `Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT`.

## Done means
- Every plugin in this phase validates, registers its tools, passes its tests and has a coverage table in the report.

## Risks / rollback
- The ES service may not index some entity types. Check `GET /api/v1/query/test` and read (only) the service's `app/core/es_mapping.py` and `app/services/es_prompts.py`, then record gaps as `not covered`. Never invent data.
- Rollback: delete the owned dirs and the test file.
