import { useEffect, useState, type ComponentType } from "react";
import { CheckCircle2, CircleDashed, Clock, XCircle } from "lucide-react";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Markdown } from "@/components/Markdown";
import type { DiaConsolePageStrings } from "@/i18n/types";
import { DIA_STEP_KEYS, type DiaRunResponse, type DiaStepKey, type DiaStepStatus } from "@/lib/dia-console-api";
import { DiaRunSources } from "./dia-console-run-sources";
import type { DiaToolRunState } from "./dia-console-store";

type TimelineStatus = DiaStepStatus | "pending";

const STEP_ICONS: Record<TimelineStatus, { icon: ComponentType<{ className?: string }>; className: string }> = {
  ok: { icon: CheckCircle2, className: "text-success" },
  error: { icon: XCircle, className: "text-destructive" },
  skipped: { icon: CircleDashed, className: "text-muted-foreground" },
  pending: { icon: Clock, className: "text-muted-foreground" },
};

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

interface TimelineProps {
  result: DiaToolRunState;
  strings: DiaConsolePageStrings;
}

function StepTimeline({ result, strings }: TimelineProps) {
  const elapsed = useElapsedSeconds(result.startedAt, result.pending);
  const byKey = new Map((result.response?.steps ?? []).map((step) => [step.key, step]));
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {DIA_STEP_KEYS.map((key) => {
        const step = byKey.get(key);
        const status: TimelineStatus = result.pending ? "pending" : step?.status ?? "skipped";
        const { icon: Icon, className } = STEP_ICONS[status];
        const live = result.pending && key === LIVE_STEP;
        return (
          <li key={key} className="flex items-center gap-1" data-step={key} data-status={status}>
            {live ? <Spinner className="text-[0.75rem]" /> : <Icon className={`h-3.5 w-3.5 ${className}`} />}
            <span>{strings.steps[key]}</span>
            <span className="text-muted-foreground">
              {live ? strings.elapsed(elapsed) : step ? strings.durationMs(step.ms) : strings.stepStatus[status]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface FailureProps {
  response: DiaRunResponse;
  strings: DiaConsolePageStrings;
}

function RunFailure({ response, strings }: FailureProps) {
  const stageMessage = response.stage ? strings.stages[response.stage] : undefined;
  return (
    <div role="alert" className="flex flex-col gap-1 border border-destructive/50 px-3 py-2 text-sm" data-stage={response.stage}>
      <p className="font-medium text-destructive">{stageMessage ?? strings.runFailed(response.error ?? "")}</p>
      {response.error ? <p className="text-muted-foreground">{response.error}</p> : null}
      {response.hint ? (
        <p>
          <span className="font-medium">{strings.health.hint}:</span> {response.hint}
        </p>
      ) : null}
    </div>
  );
}

function RunAnswer({ response, strings }: FailureProps) {
  return (
    <div className="flex flex-col gap-2">
      {response.question ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">{strings.result.question}</p>
          <p className="text-sm">{response.question}</p>
        </div>
      ) : null}
      <div>
        <p className="text-xs font-medium text-muted-foreground">
          {strings.result.answer}
          {response.type ? <span className="ml-2 font-mono">{`${strings.result.type}: ${response.type}`}</span> : null}
        </p>
        <Markdown content={response.answer ?? ""} />
      </div>
      <DiaRunSources sources={response.sources ?? []} strings={strings} />
    </div>
  );
}

export interface DiaRunResultProps {
  result: DiaToolRunState;
  strings: DiaConsolePageStrings;
}

/** Step timeline, then the answer and sources, or the failing stage with its hint. */
export function DiaRunResult({ result, strings }: DiaRunResultProps) {
  const response = result.response;
  return (
    <div className="flex flex-col gap-2 bg-muted/20 px-3 py-2" aria-live="polite" aria-busy={result.pending}>
      <StepTimeline result={result} strings={strings} />
      {result.error ? (
        <p role="alert" className="text-sm text-destructive">
          {strings.runFailed(result.error)}
        </p>
      ) : null}
      {response && !response.ok ? <RunFailure response={response} strings={strings} /> : null}
      {response?.ok ? <RunAnswer response={response} strings={strings} /> : null}
    </div>
  );
}
