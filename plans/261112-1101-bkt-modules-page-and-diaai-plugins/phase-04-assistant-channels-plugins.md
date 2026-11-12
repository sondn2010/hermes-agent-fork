---
phase: 04
title: Assistant & channels plugins
wave: B
status: done
depends_on: [01]
---

# Phase 04: Assistant & channels plugins (`category:assistant-channels`)

## Context
- Read: root `AGENTS.md`, `plugins/AGENTS.md`, `plan.md` (architecture and contracts), the phase 01 template plugin and `plugins/bkt_dia_common/tool_factory.py`.
- Spec root: `D:\Sources\fish\outsources\ironman-all\ironman-diaai-system\docs\DIAAI_SPECS` (function catalog, `03-Function-Specs/`, `02-Function-Catalog/function-uc-mapping.md`).
- Data service contract: `POST /api/v1/query {"question"}` returns `{answer, question, type, sources}`.

## Files owned (exclusive)
- `plugins/bkt-dia-admin-assistant/`
- `plugins/bkt-dia-channel-assistant/`
- `plugins/bkt-dia-conversation-assistant/`
- `tests/plugins/bkt_dia/test_assistant_channels.py`

## Modules
| Fn | Plugin dir | UCs | Design notes |
|---|---|---|---|
| F010 | `bkt-dia-admin-assistant` | UC046-UC052 | Enterprise, product and legal-document Q&A plus document summarisation through `/query`. LLM/config administration already exists in the Hermes dashboard: do not duplicate it; the skill points admins there. Question templates (UC049) become skill examples. |
| F011 | `bkt-dia-channel-assistant` | UC053-UC063 | Voice, Zalo OA and the web embed are channels, not tools. Hermes has gateway platforms and TTS/STT config. Ship a skill for channel-appropriate answers (short, voice-friendly) plus one lookup tool. Mark channel connection and statistics UCs `not covered` and point to the gateway platform docs. |
| F012 | `bkt-dia-conversation-assistant` | UC073-UC081, UC092, UC094-UC096, UC106, UC116 | Mostly skill-driven behaviour: clarifying questions, goal tracking, summarising, read-aloud via the existing TTS. One general domain question tool. Do not duplicate F006 tools; the skill tells the agent to prefer F006 when it is enabled. |

## Shared procedure (identical in phases 03-08)
- **Template:** copy `plugins/bkt-dia-enterprise-profile/` (phase 01) and follow the contract docstring in `plugins/bkt_dia_common/tool_factory.py`. Each plugin is a `plugin.yaml` (`name`, `version: 0.1.0`, an English `description` with a Vietnamese subtitle, `tags: [bkt, diaai, category:assistant-channels, <function code lowercase>]`, and mandatory `provides_tools: [<tool_name>, ...]` matching registrations), an `__init__.py` holding the `MODULE` spec plus `register(ctx)`, and `skills/<dir>/SKILL.md`.
- **Read the spec** `DIAAI_SPECS/03-Function-Specs/<fNNN>-*.md` in full before designing tools. Turn each UC into a read-only tool (or a parameter of a shared tool) when the ES `/api/v1/query` service can answer it. Cap at **1-2 tools per plugin** (preferring a unified query tool with query parameters) to keep model prompt tokens bounded.
- **Never edit** `plugins/bkt_dia_common/**`. If the factory lacks something you need, stop and report `NEEDS_CONTEXT` with the exact gap.
- **SKILL.md** says when to use each tool, to cite `sources`, to state plainly when data is missing or the service is unreachable, and to label LLM-side reasoning as such. Write it in English with Vietnamese example questions.
- **Coverage table:** write it in the phase report `plans/reports/phase-04-coverage-261112-assistant-channels.md` as `UC | covered / partial / not covered | tool | note`. Phase 10 publishes it.
- **Tests** go in your one test file `tests/plugins/bkt_dia/test_assistant_channels.py`, using the phase 01 `conftest.py` stub server (`/api/v1/query`). For every plugin: the manifest is valid with matching `provides_tools`, the category tag is present, `register` adds the expected tools, a happy path through the stub returns `function_code` and `sources`, and an unset endpoint fails closed with no request made. Also add one template-rendering test per tool.
- **Validate:** `hermes plugins validate plugins/<dir>` for each dir (ensuring 0 undeclared tools); `scripts/run_tests.sh tests/plugins/bkt_dia/test_assistant_channels.py`; `python scripts/boundary_lint.py --check`.
- **Report** ends with `Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT`.

## Done means
- Every plugin in this phase validates, registers its tools, passes its tests and has a coverage table in the report.

## Risks / rollback
- The ES service may not index some entity types. Check `GET /api/v1/query/test` and read (only) the service's `app/core/es_mapping.py` and `app/services/es_prompts.py`, then record gaps as `not covered`. Never invent data.
- Rollback: delete the owned dirs and the test file.
