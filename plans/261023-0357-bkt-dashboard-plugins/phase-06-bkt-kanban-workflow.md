---
phase: 6
title: "bkt-kanban-workflow"
status: pending
priority: P2
effort: "0.75d"
dependencies: [1]
---

# Phase 6: bkt-kanban-workflow

## Goal

Visualize how kanban work flows between profiles, showing which profile hands tasks to which.
Add live run overlays and a board filter.

## Context

The tab reads only from the bundled kanban plugin's API under `/api/plugins/kanban/`:
- `GET /boards` and `GET /board?board=` return the tasks, their assignees and their links.
- `GET /assignees`, `GET /workers/active` and `GET /stats` supply profiles, live runs and
  totals.
- `GET /tasks/{id}/log` holds the reassignment history. Confirm the event names before using
  them.

The plan adds no backend. If deriving edges client-side becomes too heavy, add a small
`plugin_api.py` that uses the `hermes_cli.kanban_db` read helpers.

## Files to create

- `plugins/bkt-kanban-workflow/dashboard/manifest.json` declares the `/bkt-kanban-flow` tab,
  placed `after:kanban`, with icon `Activity`.
- `bkt/packages/kanban-workflow/src/` contains:
  - `edges.ts` derives profile nodes and weighted edges. The edges come from two sources:
    - The assignee pairs of linked parent and child tasks.
    - Reassignment events in the task logs.
  - `FlowGraph.tsx` renders a mermaid `flowchart LR` through the shared `MarkdownView` mermaid
    path:
    - Edge labels show counts.
    - Profiles with active runs pulse cyan, and profiles that finished work recently get a lime
      ring.
    - Clicking a node lists that profile's tasks, linking to the kanban tab.
  - `index.tsx` adds a board selector, a time window filter (24h, 7d, all) and auto-refresh.
- `bkt/packages/kanban-workflow/src/edges.test.ts` holds pure tests for edge derivation, using
  fixtures for a linked chain, a reassignment, a self-loop and unassigned tasks.

## Verification

- The vitest tests are green.
- With a temporary `HERMES_HOME` holding two profiles and three linked tasks, the graph shows
  the expected edges and counts.

## Risks

- The kanban payload shape may change upstream. Mitigate by keeping the readers in `edges.ts`
  and fixture-testing them.
