---
title: BKT dashboard plugins planned
date: 2026-10-23
summary: "Planned 9 additive bkt-* dashboard plugins plus theme in an 8-phase plan"
---

# BKT dashboard plugins planned

## What happened
Brainstormed and planned the BKT (BachKhoa Technology) dashboard extensions for the Hermes fork. The plan is at `plans/261023-0357-bkt-dashboard-plugins/` and has 8 phases.

## Decision
- The fork stays additive only. No existing tracked file is modified, and `bkt/scripts/check-additive.mjs` enforces that.
- The TypeScript source lives in a `bkt/` esbuild workspace with shared helpers. It builds IIFE bundles into `plugins/bkt-*/dashboard/dist`, where the dashboard discovers them as bundled plugins.
- The theme can only load from `HERMES_HOME/dashboard-themes`, so `bkt/install` copies it there.
- The logo is shown through a `header-left` slot plugin, `bkt-brand`.
- `bkt-chat` is a React chat over the `/api/ws` JSON-RPC sidecar, because the PTY chat does not run on native Windows. A contract test against `gateway-contract.openrpc.json` guards upstream syncs.
- The file operations (move, copy, rename, unzip, zip, folder upload) reuse the core managed-files policy helpers. Every Hermes internal that BKT code imports is tracked in `bkt/UPSTREAM-SEAMS.md`.

## Next steps
Run `/ak:cook` on phase 1, the workspace foundation. Then phases 2 to 6 can run in parallel.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
