import { Link } from "react-router";
import { Badge } from "@nous-research/ui/ui/components/badge";
import type { DiaConsolePageStrings } from "@/i18n/types";
import { api, getManagementProfile, type CronJob } from "@/lib/api";
import { getCronJobRuns, type CronJobRun } from "@/lib/dia-console-api";
import { diaMonitoringJobs } from "./dia-console-grouping";
import { DIA_CONSOLE_VI } from "./dia-console-i18n";
import { useNewestFetch } from "./dia-console-newest-fetch";
import { DiaRefreshBar } from "./dia-console-refresh-bar";

interface MonitorRow {
  job: CronJob;
  /** Newest execution, or `null` when the job never ran or its history could not be read. */
  lastRun: CronJobRun | null;
}

/** Script-only fires have no session; their output lives on the Cron page. */
const SCRIPT_OUTPUT_SOURCE = "cron_output";
const CRON_PATH = "/cron";
const PREVIEW_CHARS = 160;

async function loadMonitors(): Promise<MonitorRow[]> {
  const profile = getManagementProfile();
  const jobs = diaMonitoringJobs(await api.getCronJobs(profile));
  return Promise.all(
    jobs.map(async (job) => {
      try {
        const { runs } = await getCronJobRuns(job.id, job.profile ?? profile);
        return { job, lastRun: runs[0] ?? null };
      } catch {
        // History is supplementary: the job row (status, schedule) still renders without it.
        return { job, lastRun: null };
      }
    }),
  );
}

/** Agent runs are sessions the embedded chat can reopen; script output is on the Cron page. */
function outputPath(run: CronJobRun): string {
  return run.source === SCRIPT_OUTPUT_SOURCE ? CRON_PATH : `/chat?resume=${encodeURIComponent(run.id)}`;
}

function LastRunCell({ row, strings }: { row: MonitorRow; strings: DiaConsolePageStrings }) {
  const { job, lastRun } = row;
  if (!lastRun && !job.last_run_at) return <span className="text-muted-foreground">{strings.status.neverRun}</span>;
  const preview = lastRun?.preview ? lastRun.preview.slice(0, PREVIEW_CHARS) : null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-2">
        {job.last_status ? (
          <Badge tone={job.last_status === "ok" ? "success" : "destructive"}>{job.last_status}</Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {job.last_run_at ? new Date(job.last_run_at).toLocaleString() : null}
        </span>
        {lastRun ? (
          <Link to={outputPath(lastRun)} className="text-xs underline">
            {strings.monitoring.viewOutput}
          </Link>
        ) : null}
      </span>
      {preview ? <span className="text-xs text-muted-foreground">{preview}</span> : null}
    </div>
  );
}

function EmptyMonitors({ strings }: { strings: DiaConsolePageStrings }) {
  return (
    <div className="flex flex-col items-center gap-1 border border-dashed border-border px-6 py-8 text-center">
      <p className="font-medium">{strings.empty.noMonitors}</p>
      <p className="text-sm text-muted-foreground">{strings.empty.noMonitorsHint}</p>
      <p lang="vi" className="text-xs text-muted-foreground">
        {DIA_CONSOLE_VI.noMonitorsHint}
      </p>
    </div>
  );
}

/** Cron jobs that load a `bkt-dia-*` skill, with their schedule and newest output. */
export function DiaMonitoring({ strings }: { strings: DiaConsolePageStrings }) {
  const monitors = useNewestFetch(loadMonitors);
  const rows = monitors.data ?? [];
  const labels = strings.monitoring;
  return (
    <div className="flex flex-col gap-3">
      <DiaRefreshBar
        loading={monitors.loading}
        updatedAt={monitors.updatedAt}
        error={monitors.error}
        strings={strings}
        onRefresh={monitors.reload}
      />
      {monitors.data !== null && rows.length === 0 ? <EmptyMonitors strings={strings} /> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="dia-monitoring">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-1 font-medium">{labels.name}</th>
                <th className="px-2 py-1 font-medium">{labels.schedule}</th>
                <th className="px-2 py-1 font-medium">{labels.state}</th>
                <th className="px-2 py-1 font-medium">{labels.lastRun}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.job.id} className="border-t border-border align-top">
                  <td className="px-2 py-1">
                    <span className="font-medium">{row.job.name || row.job.id}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{(row.job.skills ?? []).join(", ")}</span>
                  </td>
                  <td className="px-2 py-1 font-mono text-xs">
                    {row.job.schedule_display || row.job.schedule?.display || row.job.schedule?.expr || "—"}
                  </td>
                  <td className="px-2 py-1">
                    <Badge tone={row.job.enabled ? "success" : "secondary"}>
                      {row.job.enabled ? labels.active : labels.paused}
                    </Badge>
                  </td>
                  <td className="px-2 py-1">
                    <LastRunCell row={row} strings={strings} />
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
