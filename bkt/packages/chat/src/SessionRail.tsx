import { useEffect, useState } from "react";
import { errorMessage } from "@bkt/shared/api";
import type { ProfileSummary } from "@bkt/shared/api";
import { sdk, ui } from "@bkt/shared/sdk";

export interface StoredSession {
  id: string;
  title: string | null;
  preview: string | null;
  model: string | null;
  last_active: number;
  is_active: boolean;
}

interface PaginatedSessions {
  sessions: StoredSession[];
  total: number;
}

type GetSessions = (limit: number, offset: number, profile: string, order: "created" | "recent") => Promise<PaginatedSessions>;

/** Recent sessions of one profile, read through the host client (`GET /api/sessions?profile=`). */
function getSessions(profile: string): Promise<PaginatedSessions> {
  const api = sdk().api as unknown as { getSessions?: GetSessions };
  if (typeof api.getSessions !== "function") return Promise.reject(new Error("The host SDK has no api.getSessions"));
  return api.getSessions(30, 0, profile, "recent");
}

export interface ModelChoice {
  provider: string;
  model: string;
}

interface SessionRailProps {
  profile: string;
  profiles: ProfileSummary[];
  onProfile: (profile: string) => void;
  activeStoredId: string | null;
  /** Re-read the list when this changes (a turn ended, a title arrived, a session opened). */
  version: number;
  onResume: (storedId: string, title: string | null) => void;
  onNew: () => void;
  models: Array<{ provider: string; label: string; models: string[] }>;
  model: ModelChoice | null;
  onModel: (choice: ModelChoice | null) => void;
  currentModel: string | null;
}

function when(epochSeconds: number): string {
  if (!epochSeconds) return "";
  try {
    return sdk().utils.timeAgo(epochSeconds);
  } catch {
    return new Date(epochSeconds * 1000).toLocaleString();
  }
}

export function SessionRail(props: SessionRailProps) {
  const { profile, profiles, onProfile, activeStoredId, version, onResume, onNew, models, model, onModel, currentModel } = props;
  const Button = ui("Button");
  const [sessions, setSessions] = useState<StoredSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getSessions(profile)
      .then((data) => {
        if (!live) return;
        setSessions(data.sessions ?? []);
        setError(null);
      })
      .catch((err) => live && setError(errorMessage(err)));
    return () => {
      live = false;
    };
  }, [profile, version]);

  const modelValue = model ? `${model.provider}\u0000${model.model}` : "";

  return (
    <aside className="bkt-chat-rail bkt-panel bkt-col">
      <label className="bkt-col bkt-chat-field">
        <span className="bkt-muted">Profile</span>
        <select className="bkt-select" value={profile} onChange={(e) => onProfile(e.target.value)} aria-label="Profile">
          {!profiles.some((p) => p.name === profile) && <option value={profile}>{profile}</option>}
          {profiles.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="bkt-col bkt-chat-field">
        <span className="bkt-muted">Model for new chats</span>
        <select
          className="bkt-select"
          value={modelValue}
          aria-label="Model for new chats"
          onChange={(e) => {
            const [provider, name] = e.target.value.split("\u0000");
            onModel(name ? { provider, model: name } : null);
          }}
        >
          <option value="">Profile default{currentModel ? ` (now: ${currentModel})` : ""}</option>
          {models.map((group) => (
            <optgroup key={group.provider} label={group.label}>
              {group.models.map((m) => (
                <option key={`${group.provider}/${m}`} value={`${group.provider}\u0000${m}`}>
                  {m}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <Button type="button" size="sm" onClick={onNew}>
        New chat
      </Button>
      <div className="bkt-muted">Recent sessions</div>
      {error && <div className="bkt-error">{error}</div>}
      {!sessions && !error && <div className="bkt-muted">Loading…</div>}
      {sessions && !sessions.length && <div className="bkt-muted">No sessions yet.</div>}
      <ul className="bkt-list bkt-chat-sessions">
        {sessions?.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={`bkt-list-item bkt-chat-session${s.id === activeStoredId ? " is-active" : ""}`}
              aria-current={s.id === activeStoredId ? "true" : undefined}
              onClick={() => onResume(s.id, s.title)}
              title={s.preview ?? s.id}
            >
              <span className="bkt-col bkt-grow">
                <span className="bkt-chat-session-title">{s.title || s.preview || s.id}</span>
                <span className="bkt-muted">{when(s.last_active)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
