import { ui } from "@bkt/shared/sdk";
import type { DiaRunLogEntry, DiaRunSource } from "./dia-api";
import type { NewestFetch } from "./dia-newest-fetch";
import { VI, formatEpochSeconds } from "./dia-strings";
import { RefreshBar } from "./refresh-bar";

const SOURCE_LABEL: Record<DiaRunSource, string> = {
  agent: VI.recentRuns.sourceAgent,
  console: VI.recentRuns.sourceConsole,
};

function Outcome({ run }: { run: DiaRunLogEntry }) {
  const Badge = ui("Badge");
  if (run.ok) return <Badge tone="success">{VI.status.runOk}</Badge>;
  return (
    <span className="bkt-row" title={run.error ?? undefined}>
      <Badge tone="destructive">{VI.status.runFailed}</Badge>
      {run.stage ? <span className="bkt-mono">{run.stage}</span> : null}
    </span>
  );
}

/** The active profile's run log (agent and console runs), newest first. */
export function RecentRuns({ runs }: { runs: NewestFetch<DiaRunLogEntry[]> }) {
  const rows = runs.data ?? [];
  const labels = VI.recentRuns;
  return (
    <div className="bkt-col">
      <RefreshBar loading={runs.loading} updatedAt={runs.updatedAt} error={runs.error} onRefresh={runs.reload} />
      {runs.data !== null && rows.length === 0 ? <p className="bkt-muted bkt-dia-empty-line">{VI.empty.noRuns}</p> : null}
      {rows.length > 0 ? (
        <div className="bkt-dia-scroll">
          <table className="bkt-dia-table" data-testid="dia-recent-runs">
            <thead>
              <tr>
                <th>{labels.time}</th>
                <th>{labels.module}</th>
                <th>{labels.tool}</th>
                <th>{labels.source}</th>
                <th>{labels.outcome}</th>
                <th className="bkt-dia-num">{labels.duration}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((run) => (
                <tr key={run.id} title={run.question_preview ?? undefined}>
                  <td className="bkt-dia-nowrap">{formatEpochSeconds(run.at)}</td>
                  <td className="bkt-mono">{run.module}</td>
                  <td className="bkt-mono">{run.tool}</td>
                  <td>{SOURCE_LABEL[run.source] ?? run.source}</td>
                  <td>
                    <Outcome run={run} />
                  </td>
                  <td className="bkt-dia-num bkt-dia-nowrap">{VI.durationMs(run.duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
