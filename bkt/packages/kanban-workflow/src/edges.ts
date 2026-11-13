// Payload shapes for the flow graph, normalized in one place: the bkt /flow route and the
// bundled kanban plugin's /workers/active, /boards and /board reads.

export type EdgeKind = "link" | "reassign";

export interface FlowNode {
  profile: string;
  /** Tasks of this profile currently in the ``running`` column. */
  active: number;
  /** Tasks this profile finished inside the selected time window. */
  recentDone: number;
}

export interface FlowEdge {
  from: string;
  to: string;
  count: number;
  kind: EdgeKind;
}

export interface Flow {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface BoardOption {
  slug: string;
  name: string;
}

export interface BoardChoices {
  boards: BoardOption[];
  current: string;
}

export interface ProfileTask {
  id: string;
  title: string;
  status: string;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function list(raw: unknown, key: string): unknown[] {
  if (!isObject(raw)) return [];
  const value = raw[key];
  return Array.isArray(value) ? value : [];
}

/**
 * ``GET /flow`` -> {@link Flow}. Malformed entries are dropped, duplicate edges are merged,
 * and every edge endpoint is guaranteed a node.
 */
export function normalizeFlow(raw: unknown): Flow {
  const nodes = new Map<string, FlowNode>();
  const node = (profile: string) => {
    let entry = nodes.get(profile);
    if (!entry) {
      entry = { profile, active: 0, recentDone: 0 };
      nodes.set(profile, entry);
    }
    return entry;
  };

  for (const item of list(raw, "nodes")) {
    if (!isObject(item)) continue;
    const profile = text(item.profile);
    if (!profile) continue;
    const entry = node(profile);
    entry.active += count(item.active);
    entry.recentDone += count(item.recent_done);
  }

  const edges = new Map<string, FlowEdge>();
  for (const item of list(raw, "edges")) {
    if (!isObject(item)) continue;
    const from = text(item.from);
    const to = text(item.to);
    const n = count(item.count);
    const kind: EdgeKind | null = item.kind === "link" || item.kind === "reassign" ? item.kind : null;
    if (!from || !to || !n || !kind) continue;
    node(from);
    node(to);
    const key = JSON.stringify([from, to, kind]);
    const existing = edges.get(key);
    if (existing) existing.count += n;
    else edges.set(key, { from, to, count: n, kind });
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => a.profile.localeCompare(b.profile)),
    edges: [...edges.values()].sort((a, b) => b.count - a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
  };
}

/** ``GET /api/plugins/kanban/workers/active`` -> live worker count per profile. */
export function liveRunsByProfile(raw: unknown): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of list(raw, "workers")) {
    if (!isObject(item)) continue;
    const profile = text(item.profile) ?? text(item.task_assignee);
    if (profile) counts.set(profile, (counts.get(profile) ?? 0) + 1);
  }
  return counts;
}

/** ``GET /api/plugins/kanban/boards`` -> selectable boards and the active slug. */
export function normalizeBoards(raw: unknown): BoardChoices {
  const boards: BoardOption[] = [];
  for (const item of list(raw, "boards")) {
    if (!isObject(item) || item.archived === true) continue;
    const slug = text(item.slug);
    if (slug) boards.push({ slug, name: text(item.name) ?? slug });
  }
  const current = isObject(raw) ? text(raw.current) ?? "" : "";
  return { boards, current };
}

/** ``GET /api/plugins/kanban/board`` -> the tasks assigned to ``profile``, column order kept. */
export function tasksForProfile(raw: unknown, profile: string): ProfileTask[] {
  const tasks: ProfileTask[] = [];
  for (const column of list(raw, "columns")) {
    for (const item of list(column, "tasks")) {
      if (!isObject(item) || item.assignee !== profile) continue;
      const id = text(item.id);
      if (id) tasks.push({ id, title: text(item.title) ?? id, status: text(item.status) ?? "" });
    }
  }
  return tasks;
}

export type NodeState = "live" | "recent" | "idle";

/** Live runs (cyan pulse) win over recently finished work (lime ring). */
export function nodeState(node: FlowNode, liveRuns: number): NodeState {
  if (liveRuns > 0 || node.active > 0) return "live";
  if (node.recentDone > 0) return "recent";
  return "idle";
}

/** Mermaid label text: anything outside a small safe set becomes a ``#code;`` entity. */
export function mermaidLabel(value: string): string {
  return [...value].map((ch) => (/[\w .@-]/.test(ch) ? ch : `#${ch.codePointAt(0)};`)).join("");
}

const CLASS_BY_STATE: Record<Exclude<NodeState, "idle">, string> = { live: "bktLive", recent: "bktRecent" };

/** ``flowchart LR`` source. Node ids are positional, so profile names never reach the syntax. */
export function flowToMermaid(flow: Flow, liveRuns: Map<string, number>): string {
  const ids = new Map(flow.nodes.map((n, i) => [n.profile, `n${i}`]));
  const lines = [
    "flowchart LR",
    "  classDef bktLive stroke:#00ADEF,stroke-width:3px",
    "  classDef bktRecent stroke:#A2D149,stroke-width:3px",
  ];
  for (const node of flow.nodes) lines.push(`  ${ids.get(node.profile)}["${mermaidLabel(node.profile)}"]`);
  for (const edge of flow.edges) {
    const arrow = edge.kind === "reassign" ? "-.->" : "-->";
    lines.push(`  ${ids.get(edge.from)} ${arrow}|${edge.count}| ${ids.get(edge.to)}`);
  }
  for (const node of flow.nodes) {
    const state = nodeState(node, liveRuns.get(node.profile) ?? 0);
    if (state !== "idle") lines.push(`  class ${ids.get(node.profile)} ${CLASS_BY_STATE[state]}`);
  }
  return lines.join("\n");
}

export const WINDOWS = { "24h": 86_400, "7d": 7 * 86_400, all: null } as const;
export type WindowKey = keyof typeof WINDOWS;

/** ``since`` query value for a window, in unix seconds; undefined = all time. */
export function sinceFor(window: WindowKey, nowMs: number): number | undefined {
  const span = WINDOWS[window];
  return span === null ? undefined : Math.floor(nowMs / 1000) - span;
}
