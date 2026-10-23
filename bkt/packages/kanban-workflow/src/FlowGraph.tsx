import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "@bkt/shared/api";
import { MarkdownView } from "@bkt/shared/components/MarkdownView";
import { flowToMermaid, nodeState } from "./edges";
import type { Flow, NodeState, ProfileTask } from "./edges";

const STATE_LABEL: Record<NodeState, string> = {
  live: "Running now",
  recent: "Finished work in this window",
  idle: "Idle",
};

interface FlowGraphProps {
  flow: Flow;
  liveRuns: Map<string, number>;
  /** Changes whenever the drill-down should reload (board switch). */
  boardKey: string;
  loadTasks: (profile: string) => Promise<ProfileTask[]>;
  /** The kanban tab; plain clicks navigate inside the dashboard instead of reloading it. */
  kanbanHref: string;
  onOpenKanban: () => void;
}

interface Drill {
  profile: string;
  tasks: ProfileTask[] | null;
  error: string | null;
}

/**
 * The mermaid graph plus a clickable profile list. Strict-mode mermaid drops click
 * directives, so drill-down lives in these buttons rather than on the SVG nodes.
 */
export function FlowGraph({ flow, liveRuns, boardKey, loadTasks, kanbanHref, onOpenKanban }: FlowGraphProps) {
  const source = useMemo(() => flowToMermaid(flow, liveRuns), [flow, liveRuns]);
  const [selected, setSelected] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [boardKey]);

  useEffect(() => {
    if (!selected) {
      setDrill(null);
      return;
    }
    let live = true;
    setDrill({ profile: selected, tasks: null, error: null });
    loadTasks(selected)
      .then((tasks) => live && setDrill({ profile: selected, tasks, error: null }))
      .catch((err) => live && setDrill({ profile: selected, tasks: null, error: errorMessage(err) }));
    return () => {
      live = false;
    };
  }, [selected, loadTasks]);

  return (
    <div className="bkt-flow">
      <div className="bkt-panel bkt-flow-graph">
        <MarkdownView>{"```mermaid\n" + source + "\n```"}</MarkdownView>
        <div className="bkt-row bkt-muted bkt-flow-legend">
          <span>→ task link handoffs</span>
          <span>⇢ reassignments</span>
          <span className="bkt-flow-key bkt-flow-key-live">running</span>
          <span className="bkt-flow-key bkt-flow-key-recent">finished recently</span>
        </div>
      </div>
      <div className="bkt-col bkt-flow-side">
        <div className="bkt-panel bkt-col">
          <h2 className="bkt-flow-title">Profiles</h2>
          <ul className="bkt-list">
            {flow.nodes.map((node) => {
              const runs = liveRuns.get(node.profile) ?? 0;
              const state = nodeState(node, runs);
              return (
                <li key={node.profile}>
                  <button
                    type="button"
                    className={`bkt-list-item bkt-flow-node bkt-flow-node-${state}`}
                    aria-pressed={selected === node.profile}
                    title={STATE_LABEL[state]}
                    onClick={() => setSelected(selected === node.profile ? null : node.profile)}
                  >
                    <span className={`bkt-flow-ring bkt-flow-ring-${state}`} aria-hidden />
                    <span className="bkt-grow bkt-mono">{node.profile}</span>
                    <span className="bkt-muted">
                      {Math.max(runs, node.active)} running · {node.recentDone} done
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {drill && (
          <div className="bkt-panel bkt-col" aria-live="polite">
            <div className="bkt-row">
              <h2 className="bkt-flow-title bkt-grow">
                Tasks of <span className="bkt-mono">{drill.profile}</span>
              </h2>
              <a
                className="bkt-flow-link"
                href={kanbanHref}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  onOpenKanban();
                }}
              >
                Open Kanban
              </a>
            </div>
            {drill.error && <div className="bkt-error">{drill.error}</div>}
            {!drill.tasks && !drill.error && <div className="bkt-muted">Loading…</div>}
            {drill.tasks && drill.tasks.length === 0 && <div className="bkt-muted">No tasks on this board.</div>}
            {drill.tasks && drill.tasks.length > 0 && (
              <ul className="bkt-list">
                {drill.tasks.map((task) => (
                  <li key={task.id} className="bkt-row bkt-flow-task">
                    <span className="bkt-badge">{task.status}</span>
                    <span className="bkt-grow">{task.title}</span>
                    <span className="bkt-muted bkt-mono">{task.id}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
