---
phase: 10
title: End-user & admin documentation
wave: C
status: done
depends_on: [02, 03, 04, 05, 06, 07, 08]
---

# Phase 10: End-user & admin documentation
<!-- Updated: Validation Session 1 - Confirmed Vietnamese primary guide with English executive summary and English website feature guide -->

## Inputs
- Coverage reports `plans/reports/phase-0{3..8}-coverage-261112-*.md` plus the phase 01 pilot notes.
- The final plugin manifests and SKILL.md files, and the page UI (take screenshots from a running dashboard if possible; otherwise omit images, never use mockups as screenshots).

## Files owned
- `docs/bkt-dia-modules-user-guide.md` (Vietnamese primary, with a short English summary at the top). Audience: end users and business admins.
- `docs/bkt-dia-modules-admin-setup.md`. Audience: operators.
- `website/docs/user-guide/features/bkt-modules.md` and its sidebar entry (user-facing feature guide; note that `tests/ci/test_docs_drift.py` tracks `DEFAULT_CONFIG` and slash commands, so verify if any core config keys were added).

## Content: user guide
1. What was delivered: the BKT Modules page and 20 DIA AI modules, in plain language.
2. Using the page: open it, filter by text, category and status, show or hide a module or a whole category, the "applies to new sessions" rule, why `bkt-dia-common` must stay on, and guidance on selectively enabling only needed domain modules to conserve prompt token budget.
3. One table per category: module, function code, what you can ask (2–3 example questions in Vietnamese), what it does **not** do yet (from the coverage tables), and the related UCs.
4. How answers work: they come from the DIA data service, sources are cited, and analysis or forecast text is LLM reasoning, not a statistical model.
5. FAQ and troubleshooting: the module does not appear, the service is unreachable, the answer has no data.

## Content: admin setup
- Config: `plugins.entries.bkt-dia-common.settings.endpoint`, `timeout_seconds` (default 15s), `max_sources`; the `.env` key `BKT_DIA_QUERY_API_KEY` (per-profile resolution); the CLI equivalents (`hermes plugins enable|disable <name>`); health check `GET /api/v1/query/test` and endpoint `POST /api/v1/query`.
- Per-profile note: each Hermes profile has its own enabled list.
- Full UC coverage matrix (F-code, UC, status, tool).

## Validation
- Every tool name, config key and path in the docs exists in the code (grep each one).
- `scripts/run_tests.sh tests/ci/test_docs_drift.py` passes.
- Each file stays under 800 lines.
