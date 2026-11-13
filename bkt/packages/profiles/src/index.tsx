import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { useProfiles } from "@bkt/shared/api";
import { StatusDot } from "@bkt/shared/components/StatusDot";
import { registerPlugin } from "@bkt/shared/sdk";
import { ApiKeyTab } from "./ApiKeyTab";
import { MessagingTab } from "./MessagingTab";
import { OverviewTab } from "./OverviewTab";
import { PairingTab } from "./PairingTab";
import type { WorkbenchTabProps } from "./profile-api";
import { SoulTab } from "./SoulTab";

const TABS: Array<{ id: string; label: string; component: ComponentType<WorkbenchTabProps> }> = [
  { id: "overview", label: "Overview", component: OverviewTab },
  { id: "soul", label: "SOUL", component: SoulTab },
  { id: "messaging", label: "Messaging", component: MessagingTab },
  { id: "pairing", label: "Pairing", component: PairingTab },
  { id: "api-key", label: "API key", component: ApiKeyTab },
];

function ProfileWorkbench() {
  const { profiles, error, loading, reload } = useProfiles();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState(TABS[0].id);

  useEffect(() => {
    if (profiles.length && !profiles.some((p) => p.name === selected)) {
      setSelected((profiles.find((p) => p.is_active) ?? profiles[0]).name);
    }
  }, [profiles, selected]);

  const profile = profiles.find((p) => p.name === selected) ?? null;
  const Active = (TABS.find((t) => t.id === tab) ?? TABS[0]).component;

  return (
    <div className="bkt-page bkt-profiles">
      <div className="bkt-split">
        <aside className="bkt-panel bkt-col" aria-label="Profiles">
          <div className="bkt-muted">Profiles</div>
          {loading && !profiles.length && <div className="bkt-muted">Loading…</div>}
          {error && <div className="bkt-error">{error}</div>}
          <ul className="bkt-list" role="listbox" aria-label="Profiles">
            {profiles.map((p) => (
              <li key={p.name}>
                <button
                  type="button"
                  role="option"
                  className="bkt-list-item"
                  aria-selected={p.name === selected}
                  onClick={() => setSelected(p.name)}
                >
                  <StatusDot status={p.gateway_running ? "ok" : "off"} title={p.gateway_running ? "Gateway running" : "Gateway stopped"} />
                  <span className="bkt-grow bkt-profiles-name">{p.name}</span>
                  {p.is_default && <span className="bkt-badge">default</span>}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <section className="bkt-col bkt-profiles-main">
          {profile ? (
            <>
              <div className="bkt-row">
                <h1 className="bkt-profiles-title">{profile.name}</h1>
                {profile.description && <span className="bkt-muted">{profile.description}</span>}
              </div>
              <div className="bkt-tabs" role="tablist">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    className="bkt-tab"
                    aria-selected={t.id === tab}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div role="tabpanel">
                {/* Keyed by profile so per-tab state never carries over to another profile. */}
                <Active
                  key={profile.name}
                  profile={profile}
                  profiles={profiles}
                  reloadProfiles={reload}
                  selectProfile={setSelected}
                />
              </div>
            </>
          ) : (
            !loading && <div className="bkt-muted">No profile selected.</div>
          )}
        </section>
      </div>
    </div>
  );
}

registerPlugin("bkt-profiles", ProfileWorkbench);
