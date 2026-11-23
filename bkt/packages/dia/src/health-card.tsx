import { ui } from "@bkt/shared/sdk";
import type { DiaHealthResponse } from "./dia-api";
import type { NewestFetch } from "./dia-newest-fetch";
import { RefreshGlyph, Spinner } from "./dia-primitives";
import { VI } from "./dia-strings";

export interface HealthCardProps {
  health: NewestFetch<DiaHealthResponse>;
  /** Only the flag: the endpoint URL is never sent to, or shown in, the browser. */
  endpointConfigured: boolean | null;
  commonEnabled: boolean | null;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bkt-col bkt-dia-fact">
      <dt className="bkt-muted">{label}</dt>
      <dd className="bkt-mono">{value}</dd>
    </div>
  );
}

function HealthBody({ health }: Pick<HealthCardProps, "health">) {
  const result = health.data;
  if (result === null) {
    if (health.error) return <p role="alert" className="bkt-error">{health.error}</p>;
    return (
      <p className="bkt-row bkt-muted">
        <Spinner /> {VI.health.checking}
      </p>
    );
  }
  if (!result.ok) {
    return (
      <div role="alert" className="bkt-col" data-stage={result.stage}>
        <p className="bkt-dia-danger">{VI.stages[result.stage] ?? result.error}</p>
        <p className="bkt-muted">{result.error}</p>
        {result.hint ? (
          <p>
            <strong>{VI.health.hint}:</strong> {result.hint}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <dl className="bkt-dia-facts">
      <Fact label={VI.health.status} value={result.status} />
      <Fact label={VI.health.documents} value={result.total_documents === null ? "—" : String(result.total_documents)} />
      <Fact label={VI.health.latency} value={VI.durationMs(result.latency_ms)} />
    </dl>
  );
}

/** Query-service health: status, document count and latency, or the failing stage with its hint. */
export function HealthCard({ health, endpointConfigured, commonEnabled }: HealthCardProps) {
  const Badge = ui("Badge");
  const Button = ui("Button");
  const ok = health.data?.ok === true;
  return (
    <section className="bkt-panel bkt-col" data-testid="dia-health-card">
      <div className="bkt-row">
        <strong>{VI.health.title}</strong>
        {health.data ? <Badge tone={ok ? "success" : "destructive"}>{ok ? VI.health.ok : VI.health.error}</Badge> : null}
        {endpointConfigured === null ? null : (
          <Badge tone={endpointConfigured ? "outline" : "warning"}>
            {endpointConfigured ? VI.status.endpointConfigured : VI.status.endpointNotConfigured}
          </Badge>
        )}
        <span className="bkt-grow" />
        <Button size="sm" ghost disabled={health.loading} onClick={health.reload} aria-label={VI.buttons.refresh}>
          <RefreshGlyph spinning={health.loading} />
        </Button>
      </div>
      {commonEnabled === false ? <p className="bkt-dia-warn">{VI.status.commonDisabled}</p> : null}
      <HealthBody health={health} />
    </section>
  );
}
