import { useCallback, useEffect, useRef, useState } from "react";
import { bktFetch, errorMessage, profileFetch } from "@bkt/shared/api";
import { bundleProfile, registerPlugin, ui } from "@bkt/shared/sdk";
import { FlowGraph } from "./FlowGraph";
import { liveRunsByProfile, normalizeBoards, normalizeFlow, sinceFor, tasksForProfile, WINDOWS } from "./edges";
import type { BoardChoices, Flow, ProfileTask, WindowKey } from "./edges";

const REFRESH_MS = 15_000;
const WINDOW_LABELS: Record<WindowKey, string> = { "24h": "Last 24 hours", "7d": "Last 7 days", all: "All time" };

/** A read from the bundled kanban plugin, naming this bundle's profile like every bkt call. */
function kanbanFetch<T>(path: string, query: Record<string, string | undefined> = {}): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) search.set(key, value);
  const profile = bundleProfile();
  if (profile) search.set("profile", profile);
  const qs = search.toString();
  return bktFetch<T>(`/api/plugins/kanban${path}${qs ? `?${qs}` : ""}`);
}

function kanbanHref(): string {
  const raw = window.__HERMES_BASE_PATH__ ?? "";
  const base = raw ? (raw.startsWith("/") ? raw : `/${raw}`).replace(/\/+$/, "") : "";
  return `${base}/kanban`;
}

/** Client-side navigation: the dashboard's router follows history changes on popstate. */
function openKanban(): void {
  window.history.pushState({}, "", kanbanHref());
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const EMPTY_FLOW: Flow = { nodes: [], edges: [] };

function KanbanFlowPage() {
  const Button = ui("Button");
  const [choices, setChoices] = useState<BoardChoices | null>(null);
  const [board, setBoard] = useState("");
  const [windowKey, setWindowKey] = useState<WindowKey>("7d");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [liveRuns, setLiveRuns] = useState<Map<string, number>>(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    kanbanFetch<unknown>("/boards")
      .then((raw) => {
        const parsed = normalizeBoards(raw);
        setChoices(parsed);
        setBoard((selected) => selected || parsed.current || parsed.boards[0]?.slug || "");
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const refresh = useCallback(async () => {
    if (!board) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    const [flowResult, liveResult] = await Promise.allSettled([
      profileFetch<unknown>("/api/plugins/bkt-kanban-workflow/flow", bundleProfile(), {
        query: { board, since: sinceFor(windowKey, Date.now()) },
      }),
      kanbanFetch<unknown>("/workers/active", { board }),
    ]);
    if (seq !== requestSeq.current) return; // a newer board or window superseded this read
    if (flowResult.status === "fulfilled") {
      setFlow(normalizeFlow(flowResult.value));
      setError(null);
    } else {
      setError(errorMessage(flowResult.reason));
    }
    if (liveResult.status === "fulfilled") {
      setLiveRuns(liveRunsByProfile(liveResult.value));
      setLiveError(null);
    } else {
      setLiveError(errorMessage(liveResult.reason));
    }
    setUpdatedAt(new Date());
    setLoading(false);
  }, [board, windowKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const tick = () => {
      if (!document.hidden) void refresh();
    };
    const timer = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [autoRefresh, refresh]);

  const loadTasks = useCallback(
    async (profile: string): Promise<ProfileTask[]> =>
      tasksForProfile(await kanbanFetch<unknown>("/board", { board }), profile),
    [board],
  );

  const shown = flow ?? EMPTY_FLOW;

  return (
    <div className="bkt-page bkt-kanban-flow">
      <div className="bkt-row bkt-flow-toolbar">
        <label className="bkt-row">
          <span className="bkt-muted">Board</span>
          <select
            className="bkt-select bkt-flow-select"
            value={board}
            disabled={!choices}
            onChange={(event) => {
              setFlow(null);
              setBoard(event.target.value);
            }}
          >
            {(choices?.boards ?? []).map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <div className="bkt-tabs" role="tablist" aria-label="Time window">
          {(Object.keys(WINDOWS) as WindowKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              className="bkt-tab"
              aria-selected={windowKey === key}
              title={WINDOW_LABELS[key]}
              onClick={() => setWindowKey(key)}
            >
              {key}
            </button>
          ))}
        </div>
        <label className="bkt-row bkt-muted">
          <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
          Auto-refresh (15s)
        </label>
        <span className="bkt-grow" />
        {updatedAt && <span className="bkt-muted">Updated {updatedAt.toLocaleTimeString()}</span>}
        <Button size="sm" outlined disabled={loading || !board} onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      {error && <div className="bkt-error">{error}</div>}
      {liveError && <div className="bkt-muted">Live runs unavailable: {liveError}</div>}
      {!flow && !error && <div className="bkt-muted">Loading…</div>}
      {flow && shown.nodes.length === 0 && (
        <div className="bkt-panel bkt-muted">No assigned work on this board ({WINDOW_LABELS[windowKey].toLowerCase()}).</div>
      )}
      {flow && shown.nodes.length > 0 && (
        <FlowGraph
          flow={shown}
          liveRuns={liveRuns}
          boardKey={board}
          loadTasks={loadTasks}
          kanbanHref={kanbanHref()}
          onOpenKanban={openKanban}
        />
      )}
    </div>
  );
}

registerPlugin("bkt-kanban-workflow", KanbanFlowPage);
