import { useId, type ReactNode } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Input } from "@nous-research/ui/ui/components/input";
import { Label } from "@nous-research/ui/ui/components/label";
import { cn } from "@/lib/utils";
import type { BktModulesPageStrings } from "@/i18n/types";
import {
  DEFAULT_FILTERS,
  STATUS_FILTERS,
  type BktModulesFilters,
  type StatusFilter,
} from "./bkt-modules-grouping";
import { categoryLabel } from "./bkt-modules-i18n";

const STATUS_LABEL_KEY: Record<StatusFilter, "statusAll" | "statusEnabled" | "statusDisabled"> = {
  all: "statusAll",
  enabled: "statusEnabled",
  disabled: "statusDisabled",
};

interface ToggleChipProps {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToggleChip({ pressed, onClick, children }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-7 cursor-pointer whitespace-nowrap border px-2.5 text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground/30",
        pressed
          ? "border-midground bg-midground text-background"
          : "border-midground/15 text-text-secondary hover:bg-midground/10 hover:text-midground",
      )}
    >
      {children}
    </button>
  );
}

export interface BktModulesFilterBarProps {
  filters: BktModulesFilters;
  /** Categories present among the installed modules, in display order. */
  categories: readonly string[];
  strings: BktModulesPageStrings;
  onChange: (next: BktModulesFilters) => void;
}

export function BktModulesFilterBar({ filters, categories, strings, onChange }: BktModulesFilterBarProps) {
  const searchId = useId();
  const categoryLabelId = useId();
  const statusLabelId = useId();
  const isDefault = !filters.q && filters.categories.length === 0 && filters.status === "all";

  const toggleCategory = (slug: string) => {
    const selected = filters.categories.includes(slug)
      ? filters.categories.filter((c) => c !== slug)
      : [...filters.categories, slug];
    onChange({ ...filters, categories: selected });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={searchId}>{strings.searchLabel}</Label>
        <Input
          id={searchId}
          type="search"
          value={filters.q}
          placeholder={strings.searchPlaceholder}
          onChange={(e) => onChange({ ...filters, q: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span id={categoryLabelId} className="text-xs text-muted-foreground">
          {strings.categoryFilterLabel}
        </span>
        <div role="group" aria-labelledby={categoryLabelId} className="flex flex-wrap gap-1.5">
          {categories.map((slug) => (
            <ToggleChip key={slug} pressed={filters.categories.includes(slug)} onClick={() => toggleCategory(slug)}>
              {categoryLabel(slug, strings).primary}
            </ToggleChip>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span id={statusLabelId} className="text-xs text-muted-foreground">
          {strings.statusFilterLabel}
        </span>
        <div role="group" aria-labelledby={statusLabelId} className="flex gap-1.5">
          {STATUS_FILTERS.map((status) => (
            <ToggleChip
              key={status}
              pressed={filters.status === status}
              onClick={() => onChange({ ...filters, status })}
            >
              {strings[STATUS_LABEL_KEY[status]]}
            </ToggleChip>
          ))}
        </div>
        {!isDefault ? (
          <Button ghost size="sm" className="ml-auto" onClick={() => onChange(DEFAULT_FILTERS)}>
            {strings.clearFilters}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
