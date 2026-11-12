---
title: "Plan: BKT Modules page and DIA AI plugins"
date: 2026-11-12
summary: "Brainstorm and parallel plan for a bkt-* show/hide dashboard page and 20 bkt-dia-* plugins"
---

# Plan: BKT Modules page and DIA AI plugins

## What happened
Brainstormed and planned the BKT Modules dashboard page and 20 DIA AI Hermes plugins. Plan: `plans/261112-1101-bkt-modules-page-and-diaai-plugins/`. Contract: `plans/reports/brainstorm-261112-0727-bkt-modules-page-and-diaai-plugins.md`.

## Findings
- No `bkt-*` Hermes plugins existed. `bkt-hermes-api-bridge` is a separate bridge, not a plugin.
- `GET /api/dashboard/plugins/hub` rows carry no tags. The plan adds a generic `tags` field, read from the manifest.
- `scripts/boundary_lint.py` does not count module-to-module imports, so the shared client lives in the in-tree module `plugins/bkt_dia_common`.
- The ES service (`cncns-mcp-chatbot-esquery`) only offers natural-language `POST /query`. F021, F022, F025 and F005 therefore ship partial coverage: retrieval plus a skill.

## Decisions
- The page goes in the web dashboard. Show/hide means enable/disable, effective next session.
- All 20 HERMES-tagged functions, backed by the ES service. Category is stored as `category:<slug>`.

## Next steps
Run `/ak-cook --parallel` on the plan: wave A (phases 01, 02), wave B (phases 03–08), wave C (phases 09, 10).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
