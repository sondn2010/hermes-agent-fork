import { useMemo } from "react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import type { DiaConsolePageStrings } from "@/i18n/types";
import type { DiaModule, DiaRunLogEntry } from "@/lib/dia-console-api";
import { latestRunByModule, type DiaModuleGroup } from "./dia-console-grouping";
import { diaCategoryLabel, formatEpochSeconds } from "./dia-console-i18n";

export interface DiaModuleGridProps {
  groups: readonly DiaModuleGroup[];
  runs: readonly DiaRunLogEntry[];
  strings: DiaConsolePageStrings;
}

interface ModuleTileProps {
  module: DiaModule;
  categoryLabel: string;
  lastRun: DiaRunLogEntry | undefined;
  strings: DiaConsolePageStrings;
}

function LastRun({ lastRun, strings }: Pick<ModuleTileProps, "lastRun" | "strings">) {
  if (!lastRun) return <span>{strings.status.neverRun}</span>;
  return (
    <span title={formatEpochSeconds(lastRun.at)}>
      {strings.status.lastRun}:{" "}
      <span className={lastRun.ok ? "text-success" : "text-destructive"}>
        {lastRun.ok ? strings.status.runOk : `${strings.status.runFailed}${lastRun.stage ? ` (${lastRun.stage})` : ""}`}
      </span>
    </span>
  );
}

function ModuleTile({ module, categoryLabel, lastRun, strings }: ModuleTileProps) {
  return (
    <li className="flex flex-col gap-1 border border-border px-3 py-2" data-module={module.name}>
      <div className="flex items-center gap-2">
        {module.emoji ? <span aria-hidden>{module.emoji}</span> : null}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{module.title || module.name}</span>
        <Badge tone={module.enabled ? "success" : "secondary"}>
          {module.enabled ? strings.status.enabled : strings.status.disabled}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        {module.function_code ? <span className="font-mono">{module.function_code}</span> : null}
        <span>{categoryLabel}</span>
        <LastRun lastRun={lastRun} strings={strings} />
      </div>
    </li>
  );
}

/** Status-tab overview: every visible module with its category, state and last logged outcome. */
export function DiaModuleGrid({ groups, runs, strings }: DiaModuleGridProps) {
  const latest = useMemo(() => latestRunByModule(runs), [runs]);
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {groups.flatMap((group) => {
        const label = diaCategoryLabel(group.slug, group.category).primary;
        return group.modules.map((module) => (
          <ModuleTile
            key={module.name}
            module={module}
            categoryLabel={label}
            lastRun={latest.get(module.name)}
            strings={strings}
          />
        ));
      })}
    </ul>
  );
}
