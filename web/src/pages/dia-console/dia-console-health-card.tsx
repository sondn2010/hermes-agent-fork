import { Activity, RefreshCw } from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card } from "@nous-research/ui/ui/components/card";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import type { DiaConsolePageStrings } from "@/i18n/types";
import type { DiaHealthResponse } from "@/lib/dia-console-api";
import type { NewestFetch } from "./dia-console-newest-fetch";

export interface DiaHealthCardProps {
  health: NewestFetch<DiaHealthResponse>;
  /** Only the flag: the endpoint URL is never sent to, or shown in, the browser. */
  endpointConfigured: boolean | null;
  commonEnabled: boolean | null;
  strings: DiaConsolePageStrings;
}

interface FactProps {
  label: string;
  value: string;
}

function Fact({ label, value }: FactProps) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm">{value}</dd>
    </div>
  );
}

function HealthBody({ health, strings }: Pick<DiaHealthCardProps, "health" | "strings">) {
  const result = health.data;
  if (result === null) {
    if (health.error) return <p role="alert" className="text-sm text-destructive">{health.error}</p>;
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> {strings.health.checking}
      </p>
    );
  }
  if (!result.ok) {
    return (
      <div role="alert" className="flex flex-col gap-1 text-sm" data-stage={result.stage}>
        <p className="font-medium text-destructive">{strings.stages[result.stage] ?? result.error}</p>
        <p className="text-muted-foreground">{result.error}</p>
        {result.hint ? (
          <p>
            <span className="font-medium">{strings.health.hint}:</span> {result.hint}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <dl className="grid grid-cols-3 gap-3">
      <Fact label={strings.health.status} value={result.status} />
      <Fact label={strings.health.documents} value={result.total_documents === null ? "—" : String(result.total_documents)} />
      <Fact label={strings.health.latency} value={strings.durationMs(result.latency_ms)} />
    </dl>
  );
}

/** Query-service health: status, document count and latency, or the failing stage with its hint. */
export function DiaHealthCard({ health, endpointConfigured, commonEnabled, strings }: DiaHealthCardProps) {
  const ok = health.data?.ok === true;
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="dia-health-card">
      <div className="flex flex-wrap items-center gap-2">
        <Activity aria-hidden className="h-4 w-4" />
        <span className="font-medium">{strings.health.title}</span>
        {health.data ? (
          <Badge tone={ok ? "success" : "destructive"}>{ok ? strings.health.ok : strings.health.error}</Badge>
        ) : null}
        {endpointConfigured === null ? null : (
          <Badge tone={endpointConfigured ? "outline" : "warning"}>
            {endpointConfigured ? strings.status.endpointConfigured : strings.status.endpointNotConfigured}
          </Badge>
        )}
        <Button
          size="sm"
          ghost
          className="ml-auto"
          disabled={health.loading}
          onClick={health.reload}
          aria-label={strings.buttons.refresh}
        >
          <RefreshCw aria-hidden className="h-3.5 w-3.5" />
        </Button>
      </div>
      {commonEnabled === false ? <p className="text-sm text-warning">{strings.status.commonDisabled}</p> : null}
      <HealthBody health={health} strings={strings} />
    </Card>
  );
}
