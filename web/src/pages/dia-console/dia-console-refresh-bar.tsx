import { RefreshCw } from "lucide-react";
import { Button } from "@nous-research/ui/ui/components/button";
import type { DiaConsolePageStrings } from "@/i18n/types";

export interface DiaRefreshBarProps {
  loading: boolean;
  /** Epoch milliseconds of the last successful load. */
  updatedAt: number | null;
  error: string | null;
  strings: DiaConsolePageStrings;
  onRefresh: () => void;
}

/** Manual refresh with the last-updated time: these views never poll on their own. */
export function DiaRefreshBar({ loading, updatedAt, error, strings, onRefresh }: DiaRefreshBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <Button size="sm" outlined disabled={loading} onClick={onRefresh}>
        <RefreshCw aria-hidden className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        {strings.buttons.refresh}
      </Button>
      {updatedAt !== null ? <span>{strings.lastUpdated(new Date(updatedAt).toLocaleTimeString())}</span> : null}
      {error ? (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
