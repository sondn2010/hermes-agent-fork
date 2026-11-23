import { ui } from "@bkt/shared/sdk";
import type { CronJobRun } from "./dia-api";
import type { MonitorRow } from "./dia-monitors";
import type { NewestFetch } from "./dia-newest-fetch";
import { RouteLink } from "./dia-primitives";
import { VI, formatIso } from "./dia-strings";
import { RefreshBar } from "./refresh-bar";

/** Script-only fires have no session; their output lives on the Cron page. */
const SCRIPT_OUTPUT_SOURCE = "cron_output";
const CRON_PATH = "/cron";
const PREVIEW_CHARS = 160;

/** Agent runs are sessions the embedded chat can reopen; script output is on the Cron page. */
function outputPath(run: CronJobRun): string {
  return run.source === SCRIPT_OUTPUT_SOURCE ? CRON_PATH : `/chat?resume=${encodeURIComponent(run.id)}`;
}

function LastRunCell({ row }: { row: MonitorRow }) {
  const Badge = ui("Badge");
  const { job, lastRun } = row;
  if (!lastRun && !job.last_run_at) return <span className="bkt-muted">{VI.status.neverRun}</span>;
  const preview = lastRun?.preview ? lastRun.preview.slice(0, PREVIEW_CHARS) : null;
  return (
    <div className="bkt-col">
      <span className="bkt-row">
        {job.last_status ? <Badge tone={job.last_status === "ok" ? "success" : "destructive"}>{job.last_status}</Badge> : null}
        {job.last_run_at ? <span className="bkt-muted">{formatIso(job.last_run_at)}</span> : null}
        {lastRun ? <RouteLink to={outputPath(lastRun)}>{VI.monitoring.viewOutput}</RouteLink> : null}
      </span>
      {preview ? <span className="bkt-muted">{preview}</span> : null}
    </div>
  );
}

function EmptyMonitors() {
  return (
    <div className="bkt-dia-empty">
      <p>
        <strong>{VI.empty.noMonitors}</strong>
      </p>
      <p className="bkt-muted">{VI.empty.noMonitorsHint}</p>
    </div>
  );
}

/** Cron jobs that load a `bkt-dia-*` skill, with their schedule and newest output. */
export function Monitoring({ monitors }: { monitors: NewestFetch<MonitorRow[]> }) {
  const Badge = ui("Badge");
  const rows = monitors.data ?? [];
  const labels = VI.monitoring;
  return (
    <div className="bkt-col">
      <RefreshBar loading={monitors.loading} updatedAt={monitors.updatedAt} error={monitors.error} onRefresh={monitors.reload} />
      {monitors.data !== null && rows.length === 0 ? <EmptyMonitors /> : null}
      {rows.length > 0 ? (
        <div className="bkt-dia-scroll">
          <table className="bkt-dia-table" data-testid="dia-monitoring">
            <thead>
              <tr>
                <th>{labels.name}</th>
                <th>{labels.schedule}</th>
                <th>{labels.state}</th>
                <th>{labels.lastRun}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.job.id}>
                  <td>
                    <strong>{row.job.name || row.job.id}</strong>
                    <span className="bkt-mono bkt-muted bkt-dia-block">{(row.job.skills ?? []).join(", ")}</span>
                  </td>
                  <td className="bkt-mono">{row.job.schedule_display || row.job.schedule?.display || row.job.schedule?.expr || "—"}</td>
                  <td>
                    <Badge tone={row.job.enabled ? "success" : "secondary"}>{row.job.enabled ? labels.active : labels.paused}</Badge>
                  </td>
                  <td>
                    <LastRunCell row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
