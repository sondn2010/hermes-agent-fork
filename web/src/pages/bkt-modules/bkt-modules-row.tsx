import { AlertTriangle } from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Switch } from "@nous-research/ui/ui/components/switch";
import type { BktModulesPageStrings } from "@/i18n/types";
import type { BktModule } from "./bkt-modules-grouping";

export interface BktModulesRowProps {
  module: BktModule;
  strings: BktModulesPageStrings;
  disabled: boolean;
  /** DIA module enabled while bkt-dia-common is off. */
  showCommonWarning: boolean;
  onToggle: (name: string, next: boolean) => void;
}

export function BktModulesRow({ module, strings, disabled, showCommonWarning, onToggle }: BktModulesRowProps) {
  const descriptionId = `bkt-module-${module.name}-description`;
  return (
    <li className="flex items-start gap-3 border-t border-border px-4 py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm">{module.name}</span>
          {module.version ? <Badge tone="outline">v{module.version}</Badge> : null}
          <Badge tone={module.enabled ? "success" : "secondary"}>
            {module.enabled ? strings.enabled : strings.disabled}
          </Badge>
          {showCommonWarning ? (
            <Badge tone="warning" title={strings.diaCommonWarningHint}>
              <AlertTriangle aria-hidden className="mr-1 inline h-3 w-3" />
              {strings.diaCommonWarning}
            </Badge>
          ) : null}
        </div>
        {module.description ? (
          <p id={descriptionId} className="mt-1 text-xs text-muted-foreground">
            {module.description}
          </p>
        ) : null}
      </div>
      <Switch
        checked={module.enabled}
        disabled={disabled}
        aria-label={strings.toggleModuleLabel(module.name)}
        aria-describedby={module.description ? descriptionId : undefined}
        onCheckedChange={(next) => onToggle(module.name, next)}
      />
    </li>
  );
}
