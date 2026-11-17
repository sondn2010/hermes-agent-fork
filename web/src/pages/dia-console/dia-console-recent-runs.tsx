import { Badge } from "@nous-research/ui/ui/components/badge";
import type { DiaConsolePageStrings } from "@/i18n/types";
import type { DiaRunLogEntry, DiaRunSource } from "@/lib/dia-console-api";
import { formatEpochSeconds } from "./dia-console-i18n";
import type { NewestFetch } from "./dia-console-newest-fetch";
import { DiaRefreshBar } from "./dia-console-refresh-bar";

export interface DiaRecentRunsProps {
  runs: NewestFetch<DiaRunLogEntry[]>;
  strings: DiaConsolePageStrings;
}

const SOURCE_LABEL: Record<DiaRunSource, (strings: DiaConsolePageStrings) => string> = {
  agent: (strings) => strings.recentRuns.sourceAgent,
  console: (strings) => strings.recentRuns.sourceConsole,
};

function Outcome({ run, strings }: { run: DiaRunLogEntry; strings: DiaConsolePageStrings }) {
  if (run.ok) return <Badge tone="success">{strings.status.runOk}</Badge>;
  return (
    <span className="flex flex-wrap items-center gap-1" title={run.error ?? undefined}>
      <Badge tone="destructive">{strings.status.runFailed}</Badge>
      {run.stage ? <span className="font-mono text-xs">{run.stage}</span> : null}
    </span>
  );
}

/** The active profile's run log (agent and console runs), newest first. */
export function DiaRecentRuns({ runs, strings }: DiaRecentRunsProps) {
  const rows = runs.data ?? [];
  const labels = strings.recentRuns;
  return (
    <div className="flex flex-col gap-3">
      <DiaRefreshBar
        loading={runs.loading}
        updatedAt={runs.updatedAt}
        error={runs.error}
        strings={strings}
        onRefresh={runs.reload}
      />
      {runs.data !== null && rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{strings.empty.noRuns}</p>
      ) : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="dia-recent-runs">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-1 font-medium">{labels.time}</th>
                <th className="px-2 py-1 font-medium">{labels.module}</th>
                <th className="px-2 py-1 font-medium">{labels.tool}</th>
                <th className="px-2 py-1 font-medium">{labels.source}</th>
                <th className="px-2 py-1 font-medium">{labels.outcome}</th>
                <th className="px-2 py-1 text-right font-medium">{labels.duration}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((run) => (
                <tr key={run.id} className="border-t border-border" title={run.question_preview ?? undefined}>
                  <td className="whitespace-nowrap px-2 py-1">{formatEpochSeconds(run.at)}</td>
                  <td className="px-2 py-1 font-mono text-xs">{run.module}</td>
                  <td className="px-2 py-1 font-mono text-xs">{run.tool}</td>
                  <td className="px-2 py-1">{SOURCE_LABEL[run.source]?.(strings) ?? run.source}</td>
                  <td className="px-2 py-1">
                    <Outcome run={run} strings={strings} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 text-right">{strings.durationMs(run.duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
