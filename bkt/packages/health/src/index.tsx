import { Fragment, useCallback, useState } from "react";
import { bktFetch, errorMessage, profileFetch } from "@bkt/shared/api";
import type { ProfileSummary } from "@bkt/shared/api";
import { StatusDot } from "@bkt/shared/components/StatusDot";
import type { Status } from "@bkt/shared/components/StatusDot";
import { bundleProfile, navigateTo, registerPlugin, ui } from "@bkt/shared/sdk";
import { gatewayStatus, platformStatus, summarise, worst } from "./health";
import type { PlatformsResponse } from "./health";
import { usePolling } from "./usePolling";

const POLL_MS = 15_000;

function fetchPlatforms(profile: string) {
  return profileFetch<PlatformsResponse>("/api/messaging/platforms", profile);
}

function timeLabel(at: number | null) {
  return at ? new Date(at).toLocaleTimeString() : "never";
}

function ProfileDetail({ profile, data, error, checkedAt }: {
  profile: string;
  data: PlatformsResponse | null;
  error: string | null;
  checkedAt: number | null;
}) {
  const Button = ui("Button");
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  async function test(id: string) {
    setTestResult((r) => ({ ...r, [id]: "Testing…" }));
    try {
      const out = await profileFetch<{ ok: boolean; message: string }>(
        "/api/messaging/platforms/:id/test", profile, { method: "POST", params: { id } });
      setTestResult((r) => ({ ...r, [id]: `${out.ok ? "OK" : "Failed"}: ${out.message}` }));
    } catch (err) {
      setTestResult((r) => ({ ...r, [id]: errorMessage(err) }));
    }
  }

  if (error) return <div className="bkt-error">{error}</div>;
  if (!data) return <div className="bkt-muted">Loading…</div>;
  const { enabled, apiServerInfo } = summarise(data.platforms);
  const rows = apiServerInfo?.enabled ? [...enabled, apiServerInfo] : enabled;
  return (
    <div className="bkt-col">
      {rows.length === 0 && <div className="bkt-muted">No messaging platform or API server is enabled.</div>}
      {rows.map((p) => (
        <div key={p.id} className="bkt-row bkt-health-platform">
          <StatusDot status={platformStatus(p)} title={p.state ?? undefined} />
          <span className="bkt-health-name">{p.name}</span>
          <span className="bkt-muted bkt-grow">{p.error_message ?? p.state ?? ""}</span>
          {testResult[p.id] && <span className="bkt-muted">{testResult[p.id]}</span>}
          <Button size="sm" outlined onClick={() => void test(p.id)}>Test</Button>
        </div>
      ))}
      <div className="bkt-muted">Last checked {timeLabel(checkedAt)}</div>
    </div>
  );
}

function ProfileRow({ profile, expanded, onToggle, refreshKey }: {
  profile: ProfileSummary;
  expanded: boolean;
  onToggle: () => void;
  refreshKey: number;
}) {
  const [data, setData] = useState<PlatformsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  // Collapsed rows only show the gateway; platform columns load for expanded rows.
  usePolling(async () => {
    if (!expanded) return;
    try {
      setData(await fetchPlatforms(profile.name));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
    setCheckedAt(Date.now());
  }, POLL_MS, [expanded, profile.name, refreshKey]);
  const summary: { messaging: Status; apiServer: Status } | null = error
    ? { messaging: "fail", apiServer: "fail" }
    : data ? summarise(data.platforms) : null;

  return (
    <Fragment>
      <tr className="bkt-health-row" onClick={onToggle}>
        <td>
          <button type="button" className="bkt-health-toggle" aria-expanded={expanded}>{expanded ? "▾" : "▸"}</button>
          {profile.name}
        </td>
        <td><StatusDot status={gatewayStatus(profile.gateway_running)} /> {profile.gateway_running ? "running" : "stopped"}</td>
        <td>{expanded && summary ? <StatusDot status={summary.messaging} /> : <span className="bkt-muted">—</span>}</td>
        <td>{expanded && summary ? <StatusDot status={summary.apiServer} /> : <span className="bkt-muted">—</span>}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4}>
            <ProfileDetail profile={profile.name} data={data} error={error} checkedAt={checkedAt} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function HealthPage() {
  const Button = ui("Button");
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [status, setStatus] = useState<{ active_sessions?: number; gateway_running?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([bundleProfile() || "default"]));
  const [refreshKey, setRefreshKey] = useState(0);

  const poll = useCallback(async () => {
    try {
      const [list, machine] = await Promise.all([
        bktFetch<{ profiles: ProfileSummary[] }>("/api/profiles"),
        bktFetch<{ active_sessions?: number; gateway_running?: boolean }>("/api/status"),
      ]);
      setProfiles(list.profiles);
      setStatus(machine);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
    setCheckedAt(Date.now());
  }, []);
  usePolling(poll, POLL_MS, [refreshKey]);

  const toggle = (name: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });

  return (
    <div className="bkt-page">
      <div className="bkt-row">
        <div className="bkt-grow bkt-muted">
          {status ? `${status.active_sessions ?? 0} active session(s)` : ""} · checked {timeLabel(checkedAt)} · refreshes every 15 s
        </div>
        <Button outlined onClick={() => setRefreshKey((k) => k + 1)}>Refresh now</Button>
      </div>
      {error && <div className="bkt-error">{error}</div>}
      <div className="bkt-panel">
        <table className="bkt-health-table">
          <thead>
            <tr>
              <th>Profile</th>
              <th>Gateway</th>
              <th>Messaging</th>
              <th>API server</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <ProfileRow key={p.name} profile={p} expanded={expanded.has(p.name)}
                onToggle={() => toggle(p.name)} refreshKey={refreshKey} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeaderDot() {
  const profile = bundleProfile() || "default";
  const [status, setStatus] = useState<Status>("off");
  const [label, setLabel] = useState("Checking health");

  usePolling(async () => {
    try {
      const [list, platforms] = await Promise.all([
        bktFetch<{ profiles: ProfileSummary[] }>("/api/profiles"),
        fetchPlatforms(profile),
      ]);
      const running = list.profiles.find((p) => p.name === profile)?.gateway_running;
      const { messaging, apiServer } = summarise(platforms.platforms);
      const overall = running ? worst([messaging, apiServer, "ok"].filter((s) => s !== "off") as Status[]) : "off";
      setStatus(overall);
      setLabel(`${profile}: gateway ${running ? "running" : "stopped"}${overall === "fail" ? ", a service is failing" : ""}`);
    } catch (err) {
      setStatus("fail");
      setLabel(`Health check failed: ${errorMessage(err)}`);
    }
  }, POLL_MS, [profile]);

  return (
    <button type="button" className="bkt-health-dot" title={label} aria-label={label} onClick={() => navigateTo("/bkt-health")}>
      <StatusDot status={status} title={label} />
    </button>
  );
}

registerPlugin("bkt-health", HealthPage, [{ slot: "header-right", component: HeaderDot }]);
