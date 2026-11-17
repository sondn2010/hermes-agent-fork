import { AlertTriangle } from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Switch } from "@nous-research/ui/ui/components/switch";
import type { BktModulesPageStrings } from "@/i18n/types";
import type { BktModule } from "./bkt-modules-grouping";
import { rowLabel } from "./bkt-modules-i18n";

interface LabeledSwitchProps {
  caption: string;
  checked: boolean;
  disabled: boolean;
  ariaLabel: string;
  describedBy: string | undefined;
  onCheckedChange: (next: boolean) => void;
}

/** A row switch with its visible caption, so the two switches of a row read apart. */
function LabeledSwitch({ caption, checked, disabled, ariaLabel, describedBy, onCheckedChange }: LabeledSwitchProps) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="text-xs text-muted-foreground">
        {caption}
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export interface BktModulesRowProps {
  module: BktModule;
  strings: BktModulesPageStrings;
  /** Enabled switch locked (its request or the category bulk toggle is in flight). */
  disabled: boolean;
  /** Show UI switch locked. */
  uiDisabled: boolean;
  /** DIA module enabled while bkt-dia-common is off. */
  showCommonWarning: boolean;
  onToggle: (name: string, next: boolean) => void;
  onToggleShowUi: (name: string, show: boolean) => void;
}

export function BktModulesRow({
  module,
  strings,
  disabled,
  uiDisabled,
  showCommonWarning,
  onToggle,
  onToggleShowUi,
}: BktModulesRowProps) {
  const descriptionId = `bkt-module-${module.name}-description`;
  const describedBy = module.description ? descriptionId : undefined;
  const label = rowLabel(module, strings);
  const isAgent = module.kind === "agent";
  return (
    <li className="flex items-start gap-3 border-t border-border px-4 py-3 first:border-t-0" data-row-kind={module.kind}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {label ? (
            <span className="text-sm font-medium">
              {label.primary}
              {label.vi ? (
                <span lang="vi" className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {label.vi}
                </span>
              ) : null}
            </span>
          ) : null}
          <span className="font-mono text-sm">{module.name}</span>
          {module.version ? <Badge tone="outline">v{module.version}</Badge> : null}
          {isAgent ? (
            <Badge tone={module.enabled ? "success" : "secondary"}>
              {module.enabled ? strings.enabled : strings.disabled}
            </Badge>
          ) : (
            <Badge tone="outline">{strings.dashboardTab}</Badge>
          )}
          {module.hasUi && module.uiHidden ? <Badge tone="secondary">{strings.uiHidden}</Badge> : null}
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
      <div className="flex shrink-0 flex-col items-end gap-2">
        {isAgent ? (
          <LabeledSwitch
            caption={strings.enabled}
            checked={module.enabled}
            disabled={disabled}
            ariaLabel={strings.toggleModuleLabel(module.name)}
            describedBy={describedBy}
            onCheckedChange={(next) => onToggle(module.name, next)}
          />
        ) : null}
        {module.hasUi ? (
          <LabeledSwitch
            caption={strings.showUi}
            checked={!module.uiHidden}
            disabled={uiDisabled}
            ariaLabel={strings.toggleShowUiLabel(module.name)}
            describedBy={describedBy}
            onCheckedChange={(show) => onToggleShowUi(module.name, show)}
          />
        ) : null}
      </div>
    </li>
  );
}
