---
title: Planned DIA AI Console and unified UI visibility
date: 2026-11-17
summary: "Five-phase plan for a /dia console page, Show UI toggles on BKT Modules, and the floor-only URL check for the DIA endpoint."
---

# Planned DIA AI Console and unified UI visibility

## What happened
Brainstormed and planned the DIA AI Console (core web page /dia) and a single show/hide place on the BKT Modules page.
Plan: plans/261117-1315-dia-console-and-unified-ui-visibility/plan.md (5 phases, frozen plugin API contract).

## Decision
- Data comes only from the DIA query service plus Hermes-side state; the service has no endpoints for steps, documents, forecasts or monitoring runs.
- Console backend lives in bkt-dia-common as a hidden-tab dashboard plugin_api (no core->plugin import); agent tools and console share run_query_tool and a 500-row per-profile run log.
- Visibility reuses dashboard.hidden_plugins (no new config key); the /dia nav hides when the bkt-dia-common manifest is absent.
- web/src/lib/api.ts is already over the 2000-line cap, so the new client goes in lib/dia-console-api.ts.
- M1 settled: the DIA endpoint uses is_always_blocked_url (floor only) instead of is_safe_url, so private endpoints no longer need the global allow_private_urls.

## Next steps
/ak-cook the plan; phases 01+02 in parallel, then 03+04, then 05.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
