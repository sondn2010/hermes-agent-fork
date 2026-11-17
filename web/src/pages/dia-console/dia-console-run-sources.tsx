import { useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import type { DiaConsolePageStrings } from "@/i18n/types";
import type { DiaSource } from "@/lib/dia-console-api";

/** Sources shown before "Show more"; the server already caps the list at `max_sources`. */
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
    <li className="flex flex-col gap-0.5 border-l-2 border-border pl-2 text-xs">
      <div className="flex flex-wrap items-baseline gap-2">
        {headings.length > 0 ? <span className="font-medium">{headings.join(" · ")}</span> : null}
        {score ? <span className="font-mono text-muted-foreground">{score}</span> : null}
      </div>
      {rest.length > 0 ? (
        <p className="break-words text-muted-foreground">
          {rest.map(([key, value]) => `${key}: ${scalarText(value)}`).join(" · ")}
        </p>
      ) : null}
    </li>
  );
}

export interface DiaRunSourcesProps {
  sources: readonly DiaSource[];
  strings: DiaConsolePageStrings;
}

export function DiaRunSources({ sources, strings }: DiaRunSourcesProps) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = Math.max(0, sources.length - SOURCES_COLLAPSED_COUNT);
  const visible = expanded ? sources : sources.slice(0, SOURCES_COLLAPSED_COUNT);
  return (
    <div className="flex flex-col gap-1" data-testid="dia-run-sources">
      <p className="text-xs font-medium text-muted-foreground">{strings.result.sources}</p>
      {sources.length === 0 ? (
        <p className="text-xs text-muted-foreground">{strings.empty.noSources}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {visible.map((source, index) => (
            <SourceItem key={index} source={source} />
          ))}
        </ul>
      )}
      {hiddenCount > 0 ? (
        <div>
          <Button size="xs" ghost onClick={() => setExpanded((open) => !open)}>
            {expanded ? strings.result.showFewerSources : strings.result.showMoreSources(hiddenCount)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
