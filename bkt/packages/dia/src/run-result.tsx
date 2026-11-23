import { useEffect, useState } from "react";
import { MarkdownView } from "@bkt/shared/components/MarkdownView";
import { DIA_STEP_KEYS } from "./dia-api";
import type { DiaRunResponse, DiaStepKey, DiaStepStatus } from "./dia-api";
import { Spinner } from "./dia-primitives";
import { VI } from "./dia-strings";
import type { DiaToolRunState } from "./dia-store";
import { RunSources } from "./run-sources";

type TimelineStatus = DiaStepStatus | "pending";

const STEP_GLYPHS: Record<TimelineStatus, string> = { ok: "✓", error: "✕", skipped: "○", pending: "◷" };

/** Step that carries the elapsed timer while a run is in flight: the DIA query dominates its time. */
const LIVE_STEP: DiaStepKey = "query";
const TICK_MS = 100;

/** Seconds since `startedAt`, ticking while `active`. */
function useElapsedSeconds(startedAt: number, active: boolean): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [active]);
  return (Math.max(0, now - startedAt) / 1000).toFixed(1);
}

function StepTimeline({ result }: { result: DiaToolRunState }) {
  const elapsed = useElapsedSeconds(result.startedAt, result.pending);
  const byKey = new Map((result.response?.steps ?? []).map((step) => [step.key, step]));
  return (
    <ol className="bkt-dia-steps">
      {DIA_STEP_KEYS.map((key) => {
        const step = byKey.get(key);
        const status: TimelineStatus = result.pending ? "pending" : step?.status ?? "skipped";
        const live = result.pending && key === LIVE_STEP;
        return (
          <li key={key} className={`bkt-dia-step bkt-dia-step-${status}`} data-step={key} data-status={status}>
            {live ? <Spinner /> : <span aria-hidden="true">{STEP_GLYPHS[status]}</span>}
            <span>{VI.steps[key]}</span>
            <span className="bkt-muted">
              {live ? VI.elapsed(elapsed) : step ? VI.durationMs(step.ms) : VI.stepStatus[status]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function RunFailure({ response }: { response: DiaRunResponse }) {
  const stageMessage = response.stage ? VI.stages[response.stage] : undefined;
  return (
    <div role="alert" className="bkt-dia-failure bkt-col" data-stage={response.stage}>
      <p className="bkt-dia-danger">{stageMessage ?? VI.runFailed(response.error ?? "")}</p>
      {response.error ? <p className="bkt-muted">{response.error}</p> : null}
      {response.hint ? (
        <p>
          <strong>{VI.health.hint}:</strong> {response.hint}
        </p>
      ) : null}
    </div>
  );
}

function RunAnswer({ response }: { response: DiaRunResponse }) {
  return (
    <div className="bkt-col">
      {response.question ? (
        <div>
          <p className="bkt-muted">{VI.result.question}</p>
          <p>{response.question}</p>
        </div>
      ) : null}
      <div>
        <p className="bkt-muted">
          {VI.result.answer}
          {response.type ? <span className="bkt-mono bkt-dia-type">{`${VI.result.type}: ${response.type}`}</span> : null}
        </p>
        <MarkdownView>{response.answer ?? ""}</MarkdownView>
      </div>
      <RunSources sources={response.sources ?? []} />
    </div>
  );
}

/** Step timeline, then the answer and sources, or the failing stage with its hint. */
export function RunResult({ result }: { result: DiaToolRunState }) {
  const response = result.response;
  return (
    <div className="bkt-dia-result bkt-col" aria-live="polite" aria-busy={result.pending}>
      <StepTimeline result={result} />
      {result.error ? (
        <p role="alert" className="bkt-error">
          {VI.runFailed(result.error)}
        </p>
      ) : null}
      {response && !response.ok ? <RunFailure response={response} /> : null}
      {response?.ok ? <RunAnswer response={response} /> : null}
    </div>
  );
}
