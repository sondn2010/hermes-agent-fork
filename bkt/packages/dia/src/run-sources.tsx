import { useState } from "react";
import { ui } from "@bkt/shared/sdk";
import type { DiaSource } from "./dia-api";
import { VI } from "./dia-strings";

/** Sources shown before "show more"; the server already caps the list at `max_sources`. */
const SOURCES_COLLAPSED_COUNT = 5;

/** Keys rendered as the source's heading, in priority order. */
const HEADING_KEYS = ["title", "name", "code"] as const;
const SCORE_KEY = "score";
const MAX_VALUE_CHARS = 120;

function scalarText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}

function scoreText(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : null;
}

function SourceItem({ source }: { source: DiaSource }) {
  const headings = HEADING_KEYS.map((key) => scalarText(source[key])).filter(Boolean);
  const score = scoreText(source[SCORE_KEY]);
  const shown = new Set<string>([...HEADING_KEYS, SCORE_KEY]);
  const rest = Object.entries(source).filter(([key, value]) => !shown.has(key) && value !== null && value !== "");
  return (
    <li className="bkt-dia-source">
      <div className="bkt-row">
        {headings.length > 0 ? <strong>{headings.join(" · ")}</strong> : null}
        {score ? <span className="bkt-mono bkt-muted">{score}</span> : null}
      </div>
      {rest.length > 0 ? (
        <p className="bkt-muted bkt-dia-wrap">{rest.map(([key, value]) => `${key}: ${scalarText(value)}`).join(" · ")}</p>
      ) : null}
    </li>
  );
}

export function RunSources({ sources }: { sources: readonly DiaSource[] }) {
  const Button = ui("Button");
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = Math.max(0, sources.length - SOURCES_COLLAPSED_COUNT);
  const visible = expanded ? sources : sources.slice(0, SOURCES_COLLAPSED_COUNT);
  return (
    <div className="bkt-col" data-testid="dia-run-sources">
      <p className="bkt-muted">{VI.result.sources}</p>
      {sources.length === 0 ? (
        <p className="bkt-muted">{VI.empty.noSources}</p>
      ) : (
        <ul className="bkt-list">
          {visible.map((source, index) => (
            <SourceItem key={index} source={source} />
          ))}
        </ul>
      )}
      {hiddenCount > 0 ? (
        <div>
          <Button size="sm" ghost onClick={() => setExpanded((open) => !open)}>
            {expanded ? VI.result.showFewerSources : VI.result.showMoreSources(hiddenCount)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
