import { useMemo } from "react";
import { ui } from "@bkt/shared/sdk";
import type { DiaModule, DiaRunLogEntry } from "./dia-api";
import { latestRunByModule } from "./dia-grouping";
import type { DiaModuleGroup } from "./dia-grouping";
import { VI, categoryLabel, formatEpochSeconds } from "./dia-strings";

export interface ModuleGridProps {
  groups: readonly DiaModuleGroup[];
  runs: readonly DiaRunLogEntry[];
}

function LastRun({ lastRun }: { lastRun: DiaRunLogEntry | undefined }) {
  if (!lastRun) return <span>{VI.status.neverRun}</span>;
  return (
    <span title={formatEpochSeconds(lastRun.at)}>
      {VI.status.lastRun}:{" "}
      <span className={lastRun.ok ? "bkt-success" : "bkt-dia-danger"}>
        {lastRun.ok ? VI.status.runOk : `${VI.status.runFailed}${lastRun.stage ? ` (${lastRun.stage})` : ""}`}
      </span>
    </span>
  );
}

function ModuleTile({ module, label, lastRun }: { module: DiaModule; label: string; lastRun: DiaRunLogEntry | undefined }) {
  const Badge = ui("Badge");
  return (
    <li className="bkt-dia-tile" data-module={module.name}>
      <div className="bkt-row">
        {module.emoji ? <span aria-hidden="true">{module.emoji}</span> : null}
        <span className="bkt-grow bkt-dia-tile-title">{module.title || module.name}</span>
        <Badge tone={module.enabled ? "success" : "secondary"}>
          {module.enabled ? VI.status.enabled : VI.status.disabled}
        </Badge>
      </div>
      <div className="bkt-row bkt-muted">
        {module.function_code ? <span className="bkt-mono">{module.function_code}</span> : null}
        <span>{label}</span>
        <LastRun lastRun={lastRun} />
      </div>
    </li>
  );
}

/** Overview of every visible module with its category, state and last logged outcome. */
export function ModuleGrid({ groups, runs }: ModuleGridProps) {
  const latest = useMemo(() => latestRunByModule(runs), [runs]);
  return (
    <ul className="bkt-dia-grid">
      {groups.flatMap((group) => {
        const label = categoryLabel(group.slug, group.category);
        return group.modules.map((module) => (
          <ModuleTile key={module.name} module={module} label={label} lastRun={latest.get(module.name)} />
        ));
      })}
    </ul>
  );
}
