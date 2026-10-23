import { useCallback, useEffect, useState } from "react";
import { errorMessage, profileFetch } from "@bkt/shared/api";
import { StatusDot } from "@bkt/shared/components/StatusDot";
import type { Status } from "@bkt/shared/components/StatusDot";
import { ui } from "@bkt/shared/sdk";
import { TelegramWizard, WhatsAppWizard } from "./OnboardingWizards";
import type { MessagingPlatform, WorkbenchTabProps } from "./profile-api";

interface PlatformsResponse {
  platforms: MessagingPlatform[];
  gateway_start_command?: string;
}

interface TestResult {
  ok: boolean;
  state: string | null;
  message: string;
}

const STATE_DOT: Record<string, Status> = {
  connected: "ok",
  pending_restart: "busy",
  connecting: "busy",
  disabled: "off",
  not_configured: "off",
  gateway_stopped: "off",
};

function stateLabel(state: string | null): string {
  return (state ?? "unknown").replace(/_/g, " ");
}

function ConfigureDialog({
  profile,
  platform,
  onClose,
}: {
  profile: string;
  platform: MessagingPlatform | null;
  onClose: (saved: boolean) => void;
}) {
  const Button = ui("Button");
  const Dialog = ui("Dialog");
  const DialogContent = ui("DialogContent");
  const DialogHeader = ui("DialogHeader");
  const DialogTitle = ui("DialogTitle");
  const DialogDescription = ui("DialogDescription");
  const DialogFooter = ui("DialogFooter");
  const [values, setValues] = useState<Record<string, string>>({});
  const [cleared, setCleared] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    // List values come back in clear text; secrets only as a redacted preview, never prefilled.
    setValues(Object.fromEntries((platform?.env_vars ?? []).filter((v) => v.is_list && v.value).map((v) => [v.key, v.value ?? ""])));
    setCleared([]);
    setError(null);
  }, [platform]);

  if (!platform) return null;

  async function save() {
    if (!platform) return;
    setSaving(true);
    try {
      const env = Object.fromEntries(Object.entries(values).filter(([k, v]) => v.trim() && !cleared.includes(k)));
      await profileFetch("/api/messaging/platforms/:id", profile, {
        method: "PUT",
        params: { id: platform.id },
        body: { env, clear_env: cleared },
      });
      onClose(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const fields = platform.env_vars.filter((v) => showAdvanced || !v.advanced || v.required);

  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onClose(false)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Configure {platform.name}</DialogTitle>
          <DialogDescription>
            Saved to {profile}'s .env. Leave a secret blank to keep its current value.
          </DialogDescription>
        </DialogHeader>
        <div className="bkt-col bkt-profiles-form">
          {error && <div className="bkt-error">{error}</div>}
          {fields.map((field) => (
            <label key={field.key} className="bkt-col">
              <span>
                {field.prompt || field.key}
                {field.required && " *"} <span className="bkt-muted bkt-mono">{field.key}</span>
              </span>
              <div className="bkt-row">
                <input
                  className="bkt-input bkt-grow bkt-mono"
                  type={field.is_password ? "password" : "text"}
                  autoComplete="off"
                  placeholder={field.is_set ? field.redacted_value || "set" : ""}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
                {field.is_set && (
                  <label className="bkt-row bkt-muted">
                    <input
                      type="checkbox"
                      checked={cleared.includes(field.key)}
                      onChange={(e) =>
                        setCleared((c) => (e.target.checked ? [...c, field.key] : c.filter((k) => k !== field.key)))
                      }
                    />
                    clear
                  </label>
                )}
              </div>
              {field.description && <span className="bkt-muted">{field.description}</span>}
            </label>
          ))}
          {platform.env_vars.some((v) => v.advanced && !v.required) && (
            <button type="button" className="bkt-profiles-link" onClick={() => setShowAdvanced((s) => !s)}>
              {showAdvanced ? "Hide advanced settings" : "Show advanced settings"}
            </button>
          )}
        </div>
        <DialogFooter>
          <Button outlined onClick={() => onClose(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MessagingTab({ profile }: WorkbenchTabProps) {
  const Button = ui("Button");
  const name = profile.name;
  const [platforms, setPlatforms] = useState<MessagingPlatform[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<MessagingPlatform | null>(null);
  const [wizard, setWizard] = useState<"telegram" | "whatsapp" | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await profileFetch<PlatformsResponse>("/api/messaging/platforms", name);
      setPlatforms(data.platforms);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [name]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(platform: MessagingPlatform) {
    setBusy(platform.id);
    try {
      await profileFetch("/api/messaging/platforms/:id", name, {
        method: "PUT",
        params: { id: platform.id },
        body: { enabled: !platform.enabled },
      });
      setNotice(`${platform.name} ${platform.enabled ? "disabled" : "enabled"}. Restart the gateway to apply.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function test(platform: MessagingPlatform) {
    setBusy(platform.id);
    try {
      const result = await profileFetch<TestResult>("/api/messaging/platforms/:id/test", name, {
        method: "POST",
        params: { id: platform.id },
      });
      setTests((t) => ({ ...t, [platform.id]: result }));
    } catch (err) {
      setTests((t) => ({ ...t, [platform.id]: { ok: false, state: null, message: errorMessage(err) } }));
    } finally {
      setBusy(null);
    }
  }

  if (!platforms) return error ? <div className="bkt-error">{error}</div> : <div className="bkt-muted">Loading…</div>;

  const ordered = [...platforms].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));

  return (
    <div className="bkt-col">
      {error && <div className="bkt-error">{error}</div>}
      {notice && <div className="bkt-success">{notice}</div>}
      <div className="bkt-profiles-cards">
        {ordered.map((platform) => {
          const result = tests[platform.id];
          return (
            <div key={platform.id} className="bkt-panel bkt-col bkt-profiles-card">
              <div className="bkt-row">
                <StatusDot status={platform.error_message ? "fail" : STATE_DOT[platform.state ?? ""] ?? "busy"} title={stateLabel(platform.state)} />
                <strong className="bkt-grow">{platform.name}</strong>
                <span className="bkt-badge">{stateLabel(platform.state)}</span>
              </div>
              {platform.description && <div className="bkt-muted">{platform.description}</div>}
              {platform.error_message && <div className="bkt-error">{platform.error_message}</div>}
              {result && <div className={result.ok ? "bkt-success" : "bkt-error"}>{result.message}</div>}
              <div className="bkt-row">
                <Button size="sm" outlined onClick={() => setConfiguring(platform)}>
                  Configure
                </Button>
                {platform.id === "telegram" && (
                  <Button size="sm" outlined onClick={() => setWizard("telegram")}>
                    QR setup
                  </Button>
                )}
                {platform.id === "whatsapp" && (
                  <Button size="sm" outlined onClick={() => setWizard("whatsapp")}>
                    Link device
                  </Button>
                )}
                <Button size="sm" outlined disabled={busy === platform.id} onClick={() => void test(platform)}>
                  Test
                </Button>
                <Button size="sm" outlined disabled={busy === platform.id} onClick={() => void toggle(platform)}>
                  {platform.enabled ? "Disable" : "Enable"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <ConfigureDialog
        profile={name}
        platform={configuring}
        onClose={(saved) => {
          setConfiguring(null);
          if (saved) {
            setNotice("Saved. Restart the gateway to apply.");
            void load();
          }
        }}
      />
      <TelegramWizard profile={name} open={wizard === "telegram"} onClose={(applied) => { setWizard(null); if (applied) void load(); }} />
      <WhatsAppWizard profile={name} open={wizard === "whatsapp"} onClose={(applied) => { setWizard(null); if (applied) void load(); }} />
    </div>
  );
}
