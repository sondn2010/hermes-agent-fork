---
phase: 6
title: "bkt-kanban-workflow"
status: completed
priority: P2
effort: "1d"
dependencies: [1]
---

# Phase 6: bkt-kanban-workflow

## Goal

Visualize how kanban work flows between profiles, showing which profile hands tasks to which.
Add live run overlays and a board filter.

## Context

The bundled kanban plugin's API (`plugins/kanban/dashboard/plugin_api.py`) does not return
the data the graph needs in one read:
- `GET /board` returns only `link_counts` per card, not the linked task IDs (`:303-306,330,351-353`).
- The link pairs and the task `events` (including `assigned` reassignments) come only from
  `GET /tasks/{id}` (`:379-405`). Reassignments are recorded as task events
  (`hermes_cli/kanban_db.py:1479`).
- `GET /tasks/{id}/log` is worker stdout/stderr (up to 2 MiB, `:1255-1267`), not
  reassignment history. bkt-kanban-workflow never reads it.
- `GET /boards`, `GET /assignees`, `GET /workers/active` and `GET /stats` (`:1411,1247,920,1240`)
  supply boards, profiles, live runs and totals.
<!-- Red Team: /board has no link pairs; /log is worker output; backend is mandatory -->

Building edges client-side would need one `GET /tasks/{id}` per task on every refresh. The
plugin therefore ships a small read-only backend.

## Files to create

- `plugins/bkt-kanban-workflow/dashboard/manifest.json` declares the `/bkt-kanban-flow` tab with
  icon `Activity`, `"api": "plugin_api.py"`, and position `end`. `after:kanban` is not used,
  because discovery sorts `bkt-kanban-workflow` before `kanban`
  (`hermes_cli/web_server_dashboard.py:575-576`), so that target would not exist yet.
- `plugins/bkt-kanban-workflow/dashboard/plugin_api.py`:
  - `GET /flow?board=&since=` opens the board read-only with
    `hermes_cli.kanban_db_connect.connect_closing(board=...)`
    (`hermes_cli/kanban_db_connect.py:788`), the same connection path the kanban plugin uses.
    `hermes_cli.kanban_db` has no public bulk reader for links, and `list_events`
    (`hermes_cli/kanban_db.py:1830`) works per task. The route therefore runs three bounded
    `SELECT` statements over the `tasks`, `task_links` and `task_events` tables
    (`kanban_db.py:12,879`), filtering `task_events` by the `assigned` kind and `since`. It
    returns `{nodes: [{profile, active, recent_done}], edges: [{from, to, count, kind}]}`. The
    table and column names are recorded as a seam.
  - It is read-only and runs through `asyncio.to_thread`.
  - The helpers it imports are listed in `bkt/UPSTREAM-SEAMS.md`.
- `bkt/packages/kanban-workflow/src/` contains:
  - `edges.ts` normalizes the `/flow` payload, so the shape lives in one place.
  - `FlowGraph.tsx` renders a mermaid `flowchart LR` through the shared `MarkdownView` mermaid
    path:
    - Edge labels show counts.
    - Profiles with active runs pulse cyan, and profiles that finished work recently get a lime
      ring.
    - Clicking a node lists that profile's tasks, linking to the kanban tab.
  <!-- Updated: Validation Session 1 - user kept the time window filter and node drill-down -->
  - `index.tsx` adds a board selector, a time window filter (24h, 7d, all) and auto-refresh.
    Auto-refresh polls `/flow` and `/workers/active` only, every 15 seconds, and pauses while the
    tab is hidden.
- `bkt/packages/kanban-workflow/src/edges.test.ts` holds pure tests for the payload
  normalization.
- `tests/plugins/bkt_kanban_workflow/test_flow.py` uses a temporary `HERMES_HOME` and covers a
  linked chain, a reassignment, a self-loop, unassigned tasks and the `since` window.

## Verification

- The vitest and pytest tests are green.
- With a temporary `HERMES_HOME` holding two profiles and three linked tasks, the graph shows
  the expected edges and counts.

## Risks

- `kanban_db` helpers may change upstream. Mitigate by keeping the reads in one function,
  listing the helpers in seams, and testing against a real temporary board.
