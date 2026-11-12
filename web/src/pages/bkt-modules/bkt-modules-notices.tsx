import { Info, PackageOpen } from "lucide-react";
import { Button } from "@nous-research/ui/ui/components/button";
import type { BktModulesPageStrings } from "@/i18n/types";
import { BKT_BANNER_VI } from "./bkt-modules-i18n";

interface StringsProps {
  strings: BktModulesPageStrings;
}

/** Always-visible notice: toggles reach new sessions only, and DIA modules need bkt-dia-common. */
export function BktModulesBanner({ strings }: StringsProps) {
  return (
    <div role="note" className="flex gap-3 border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
      <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="flex flex-col gap-1">
        <p>
          {strings.bannerSessions} {strings.bannerCommon}
        </p>
        <p lang="vi" className="text-xs text-muted-foreground">
          {BKT_BANNER_VI.sessions} {BKT_BANNER_VI.common}
        </p>
      </div>
    </div>
  );
}

export function BktModulesEmptyState({ strings }: StringsProps) {
  return (
    <div className="flex flex-col items-center gap-2 border border-dashed border-border px-6 py-10 text-center">
      <PackageOpen aria-hidden className="h-8 w-8 text-muted-foreground" />
      <p className="font-medium">{strings.emptyTitle}</p>
      <p className="text-sm text-muted-foreground">{strings.emptyHint}</p>
    </div>
  );
}

interface LoadErrorProps extends StringsProps {
  detail: string;
  retryLabel: string;
  onRetry: () => void;
}

export function BktModulesLoadError({ strings, detail, retryLabel, onRetry }: LoadErrorProps) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 border border-destructive/50 px-4 py-3 text-sm">
      <span>
        {strings.loadFailed} <span className="text-muted-foreground">{detail}</span>
      </span>
      <Button size="sm" outlined onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
