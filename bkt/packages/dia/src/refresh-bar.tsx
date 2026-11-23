import { ui } from "@bkt/shared/sdk";
import { RefreshGlyph } from "./dia-primitives";
import { VI, formatClock } from "./dia-strings";

export interface RefreshBarProps {
  loading: boolean;
  /** Epoch milliseconds of the last successful load. */
  updatedAt: number | null;
  error: string | null;
  onRefresh: () => void;
}

/** Manual refresh with the last-updated time: these views never poll on their own. */
export function RefreshBar({ loading, updatedAt, error, onRefresh }: RefreshBarProps) {
  const Button = ui("Button");
  return (
    <div className="bkt-row bkt-muted">
      <Button size="sm" outlined disabled={loading} onClick={onRefresh}>
        <RefreshGlyph spinning={loading} /> {VI.buttons.refresh}
      </Button>
      {updatedAt !== null ? <span>{VI.lastUpdated(formatClock(updatedAt))}</span> : null}
      {error ? (
        <span role="alert" className="bkt-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
