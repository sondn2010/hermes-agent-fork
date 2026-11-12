import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Card } from "@nous-research/ui/ui/components/card";
import { cn } from "@/lib/utils";
import type { BktModulesPageStrings } from "@/i18n/types";
import type { BktCategoryGroup, CategorySwitchState } from "./bkt-modules-grouping";
import { needsDiaCommonWarning } from "./bkt-modules-grouping";
import { categoryLabel } from "./bkt-modules-i18n";
import { BktModulesRow } from "./bkt-modules-row";

const ARIA_CHECKED: Record<CategorySwitchState, "true" | "false" | "mixed"> = {
  on: "true",
  off: "false",
  mixed: "mixed",
};

const THUMB_POSITION: Record<CategorySwitchState, string> = {
  on: "translate-x-4 bg-midground",
  off: "translate-x-0.5 bg-midground/40",
  mixed: "translate-x-2 bg-midground/70",
};

interface CategorySwitchProps {
  state: CategorySwitchState;
  label: string;
  disabled: boolean;
  onToggle: () => void;
}

/**
 * Switch-styled tri-state control. `role="switch"` cannot express "partially on", so this is a
 * checkbox with `aria-checked="mixed"`; Space/Enter come from the native button.
 */
function CategorySwitch({ state, label, disabled, onToggle }: CategorySwitchProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={ARIA_CHECKED[state]}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center border transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        state === "off" ? "border-midground/20 bg-background" : "border-midground/30 bg-midground/15",
      )}
    >
      <span aria-hidden className={cn("pointer-events-none block h-3.5 w-3.5 transition-transform", THUMB_POSITION[state])} />
    </button>
  );
}

export interface BktModulesCategorySectionProps {
  group: BktCategoryGroup;
  strings: BktModulesPageStrings;
  pending: ReadonlySet<string>;
  busy: boolean;
  diaCommonInactive: boolean;
  onToggleModule: (name: string, next: boolean) => void;
  onToggleCategory: (slug: string, names: readonly string[], next: boolean) => void;
}

export function BktModulesCategorySection({
  group,
  strings,
  pending,
  busy,
  diaCommonInactive,
  onToggleModule,
  onToggleCategory,
}: BktModulesCategorySectionProps) {
  const [expanded, setExpanded] = useState(true);
  const regionId = useId();
  const label = categoryLabel(group.slug, strings);
  // Off or mixed → switch everything on; fully on → switch everything off.
  const next = group.state !== "on";
  const targets = group.modules.filter((m) => m.enabled !== next).map((m) => m.name);

  return (
    <Card className="overflow-hidden" data-category={group.slug} aria-busy={busy}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={regionId}
          onClick={() => setExpanded((open) => !open)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground/30"
        >
          {expanded ? <ChevronDown aria-hidden className="h-4 w-4 shrink-0" /> : <ChevronRight aria-hidden className="h-4 w-4 shrink-0" />}
          <span className="font-medium">{label.primary}</span>
          {label.vi ? <span className="truncate text-xs text-muted-foreground">{label.vi}</span> : null}
        </button>
        <Badge tone={group.enabledCount > 0 ? "success" : "secondary"}>
          {strings.categoryCount(group.enabledCount, group.modules.length)}
        </Badge>
        {busy ? <span className="text-xs text-muted-foreground">{strings.updating}</span> : null}
        <CategorySwitch
          state={group.state}
          label={strings.toggleCategoryLabel(label.primary)}
          disabled={busy || group.modules.some((m) => pending.has(m.name))}
          onToggle={() => onToggleCategory(group.slug, targets, next)}
        />
      </div>
      <ul id={regionId} hidden={!expanded} className="border-t border-border">
        {group.modules.map((module) => (
          <BktModulesRow
            key={module.name}
            module={module}
            strings={strings}
            disabled={busy || pending.has(module.name)}
            showCommonWarning={needsDiaCommonWarning(module, diaCommonInactive)}
            onToggle={onToggleModule}
          />
        ))}
      </ul>
    </Card>
  );
}
