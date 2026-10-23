import {
  flowToMermaid,
  liveRunsByProfile,
  mermaidLabel,
  nodeState,
  normalizeBoards,
  normalizeFlow,
  sinceFor,
  tasksForProfile,
} from "./edges";

describe("normalizeFlow", () => {
  it("maps the /flow payload and sorts nodes and edges", () => {
    const flow = normalizeFlow({
      nodes: [
        { profile: "bob", active: 1, recent_done: 0 },
        { profile: "alice", active: 0, recent_done: 3 },
      ],
      edges: [
        { from: "bob", to: "alice", count: 1, kind: "link" },
        { from: "alice", to: "bob", count: 4, kind: "reassign" },
      ],
    });
    expect(flow.nodes).toEqual([
      { profile: "alice", active: 0, recentDone: 3 },
      { profile: "bob", active: 1, recentDone: 0 },
    ]);
    expect(flow.edges.map((e) => [e.from, e.to, e.count, e.kind])).toEqual([
      ["alice", "bob", 4, "reassign"],
      ["bob", "alice", 1, "link"],
    ]);
  });

  it("drops malformed entries and merges duplicate edges", () => {
    const flow = normalizeFlow({
      nodes: [null, { profile: "" }, { profile: "a", active: -2, recent_done: "x" }],
      edges: [
        { from: "a", to: "a", count: 2, kind: "link" },
        { from: "a", to: "a", count: 3, kind: "link" },
        { from: "a", to: "b", count: 0, kind: "link" },
        { from: "a", to: "b", count: 1, kind: "teleport" },
        { from: 7, to: "b", count: 1, kind: "link" },
      ],
    });
    expect(flow.nodes).toEqual([{ profile: "a", active: 0, recentDone: 0 }]);
    expect(flow.edges).toEqual([{ from: "a", to: "a", count: 5, kind: "link" }]);
  });

  it("gives every edge endpoint a node", () => {
    const flow = normalizeFlow({ nodes: [], edges: [{ from: "x", to: "y", count: 1, kind: "link" }] });
    expect(flow.nodes.map((n) => n.profile)).toEqual(["x", "y"]);
  });

  it("treats a non-object payload as an empty flow", () => {
    expect(normalizeFlow(null)).toEqual({ nodes: [], edges: [] });
    expect(normalizeFlow({ nodes: "nope", edges: {} })).toEqual({ nodes: [], edges: [] });
  });
});

describe("kanban plugin payloads", () => {
  it("counts live workers per profile, falling back to the task assignee", () => {
    const counts = liveRunsByProfile({
      workers: [{ profile: "a" }, { profile: "a" }, { profile: null, task_assignee: "b" }, { profile: null }],
    });
    expect([...counts]).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });

  it("lists live boards and the active slug", () => {
    expect(
      normalizeBoards({
        boards: [{ slug: "default", name: "Default" }, { slug: "old", archived: true }, { slug: "sprint" }],
        current: "sprint",
      }),
    ).toEqual({
      boards: [
        { slug: "default", name: "Default" },
        { slug: "sprint", name: "sprint" },
      ],
      current: "sprint",
    });
  });

  it("picks one profile's tasks out of the board columns", () => {
    const board = {
      columns: [
        { name: "ready", tasks: [{ id: "t1", title: "One", status: "ready", assignee: "a" }] },
        { name: "done", tasks: [{ id: "t2", title: "Two", status: "done", assignee: "b" }, { id: "t3", status: "done", assignee: "a" }] },
      ],
    };
    expect(tasksForProfile(board, "a")).toEqual([
      { id: "t1", title: "One", status: "ready" },
      { id: "t3", title: "t3", status: "done" },
    ]);
  });
});

describe("flowToMermaid", () => {
  const flow = normalizeFlow({
    nodes: [
      { profile: "alice", active: 0, recent_done: 2 },
      { profile: "bob", active: 0, recent_done: 0 },
      { profile: "carol", active: 0, recent_done: 0 },
    ],
    edges: [
      { from: "alice", to: "bob", count: 3, kind: "link" },
      { from: "bob", to: "bob", count: 1, kind: "link" },
      { from: "carol", to: "alice", count: 2, kind: "reassign" },
    ],
  });

  it("draws counted edges, dashed reassignments and state classes", () => {
    const source = flowToMermaid(flow, new Map([["carol", 1]]));
    expect(source.split("\n")).toEqual([
      "flowchart LR",
      "  classDef bktLive stroke:#00ADEF,stroke-width:3px",
      "  classDef bktRecent stroke:#A2D149,stroke-width:3px",
      '  n0["alice"]',
      '  n1["bob"]',
      '  n2["carol"]',
      "  n0 -->|3| n1",
      "  n2 -.->|2| n0",
      "  n1 -->|1| n1",
      "  class n0 bktRecent",
      "  class n2 bktLive",
    ]);
  });

  it("keeps profile names out of the mermaid syntax", () => {
    expect(mermaidLabel('a"]-->x<b>')).toBe("a#34;#93;--#62;x#60;b#62;");
  });
});

describe("nodeState and sinceFor", () => {
  it("prefers live runs over recent completions", () => {
    expect(nodeState({ profile: "a", active: 0, recentDone: 1 }, 1)).toBe("live");
    expect(nodeState({ profile: "a", active: 1, recentDone: 1 }, 0)).toBe("live");
    expect(nodeState({ profile: "a", active: 0, recentDone: 1 }, 0)).toBe("recent");
    expect(nodeState({ profile: "a", active: 0, recentDone: 0 }, 0)).toBe("idle");
  });

  it("turns a window into unix seconds", () => {
    const now = 1_000_000_000_500;
    expect(sinceFor("24h", now)).toBe(1_000_000_000 - 86_400);
    expect(sinceFor("7d", now)).toBe(1_000_000_000 - 7 * 86_400);
    expect(sinceFor("all", now)).toBeUndefined();
  });
});
