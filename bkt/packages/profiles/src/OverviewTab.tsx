import { useCallback, useEffect, useState } from "react";
import { bktFetch, errorMessage, jsonInit, profileFetch } from "@bkt/shared/api";
import { FolderPickerDialog } from "@bkt/shared/components/FolderPickerDialog";
import { StatusDot } from "@bkt/shared/components/StatusDot";
import { ui } from "@bkt/shared/sdk";
import { ArchivePickerDialog } from "./ArchivePickerDialog";
import { exportArchivePath } from "./export-path";
import { profilePath } from "./profile-api";
import type { ModelOptions, StatusSummary, ToolsetRow, WorkbenchTabProps } from "./profile-api";

interface DescribeResult {
  ok: boolean;
  reason?: string | null;
  description?: string | null;
}

function ModelPicker({ profile, onSaved }: { profile: WorkbenchTabProps["profile"]; onSaved: () => void }) {
  const Button = ui("Button");
  const [options, setOptions] = useState<ModelOptions | null>(null);
  const [provider, setProvider] = useState(profile.provider ?? "");
  const [model, setModel] = useState(profile.model ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    profileFetch<ModelOptions>("/api/model/options", profile.name)
      .then((data) => live && setOptions(data))
      .catch((err) => live && setError(errorMessage(err)));
    return () => {
      live = false;
    };
  }, [profile.name]);

  const models = options?.providers.find((p) => p.slug === provider)?.models ?? [];

  async function save() {
    setSaving(true);
    try {
      await bktFetch(profilePath(profile.name, "/model"), jsonInit("PUT", { provider, model }));
      setError(null);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!options) return error ? <div className="bkt-error">{error}</div> : <div className="bkt-muted">Loading models…</div>;

  return (
    <div className="bkt-row">
      <select
        className="bkt-select bkt-profiles-narrow"
        aria-label="Provider"
        value={provider}
        onChange={(e) => {
          setProvider(e.target.value);
          setModel("");
        }}
      >
        <option value="">Provider…</option>
        {options.providers.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name}
            {p.authenticated === false ? " (not set up)" : ""}
          </option>
        ))}
      </select>
      <select className="bkt-select bkt-profiles-narrow" aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)}>
        <option value="">Model…</option>
        {[...new Set(model && !models.includes(model) ? [model, ...models] : models)].map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <Button size="sm" disabled={saving || !provider || !model} onClick={() => void save()}>
        Set model
      </Button>
      {error && <span className="bkt-error">{error}</span>}
    </div>
  );
}

export function OverviewTab({ profile, profiles, reloadProfiles, selectProfile }: WorkbenchTabProps) {
  const Button = ui("Button");
  const name = profile.name;
  const [status, setStatus] = useState<StatusSummary | null>(null);
  const [toolsets, setToolsets] = useState<ToolsetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingModel, setEditingModel] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [cloneAll, setCloneAll] = useState(false);
  const [exportPicker, setExportPicker] = useState(false);
  const [importPicker, setImportPicker] = useState(false);
  const [importName, setImportName] = useState("");

  const load = useCallback(async () => {
    const [st, ts] = await Promise.allSettled([
      profileFetch<StatusSummary>("/api/status", name),
      profileFetch<ToolsetRow[]>("/api/tools/toolsets", name),
    ]);
    if (st.status === "fulfilled") setStatus(st.value);
    if (ts.status === "fulfilled") setToolsets(ts.value);
    const failed = [st, ts].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    setError(failed ? errorMessage(failed.reason) : null);
  }, [name]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    try {
      setNotice(await action());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
      setNotice(null);
    } finally {
      setBusy(false);
    }
  }

  const clone = () =>
    run(async () => {
      const target = cloneName.trim();
      await bktFetch("/api/profiles", jsonInit("POST", { name: target, clone_from: name, clone_all: cloneAll }));
      setCloneName("");
      await reloadProfiles();
      selectProfile(target);
      return `Created ${target} from ${name}.`;
    });

  const exportTo = (output: string) =>
    run(async () => {
      const res = await bktFetch<{ archive: string }>(profilePath(name, "/export"), jsonInit("POST", { output }));
      return `Exported to ${res.archive} (credentials excluded).`;
    });

  const importFrom = (archive: string) =>
    run(async () => {
      const res = await bktFetch<{ name: string }>(
        "/api/profiles/import",
        jsonInit("POST", { archive, name: importName.trim() || undefined }),
      );
      setImportName("");
      await reloadProfiles();
      selectProfile(res.name);
      return `Imported profile ${res.name}.`;
    });

  const describe = () =>
    run(async () => {
      const res = await bktFetch<DescribeResult>(profilePath(name, "/describe-auto"), jsonInit("POST", { overwrite: true }));
      if (!res.ok) throw new Error(res.reason || "Auto-describe failed.");
      await reloadProfiles();
      return "Description updated.";
    });

  const apiServer = status?.gateway_platforms?.api_server;
  const enabledToolsets = toolsets?.filter((t) => t.enabled).length;
  const cloneTaken = profiles.some((p) => p.name === cloneName.trim());

  return (
    <div className="bkt-col">
      {error && <div className="bkt-error">{error}</div>}
      {notice && <div className="bkt-success">{notice}</div>}

      <div className="bkt-panel bkt-col">
        <dl className="bkt-profiles-facts">
          <dt>Model</dt>
          <dd>
            <span className="bkt-mono">{profile.model || "—"}</span>
            {profile.provider && <span className="bkt-muted"> via {profile.provider}</span>}{" "}
            <button type="button" className="bkt-profiles-link" onClick={() => setEditingModel((v) => !v)}>
              {editingModel ? "Cancel" : "Change"}
            </button>
          </dd>
          <dt>Gateway</dt>
          <dd className="bkt-row">
            <StatusDot status={status?.gateway_running ? "ok" : "off"} />
            {status ? status.gateway_state ?? (status.gateway_running ? "running" : "stopped") : "…"}
            {status?.gateway_shared_with?.length ? (
              <span className="bkt-muted">shared with {status.gateway_shared_with.join(", ")}</span>
            ) : null}
          </dd>
          <dt>API server</dt>
          <dd>{apiServer ? apiServer.state ?? "configured" : "not running"}</dd>
          <dt>Skills</dt>
          <dd>{profile.skill_count ?? "—"}</dd>
          <dt>Toolsets</dt>
          <dd>{toolsets ? `${enabledToolsets} of ${toolsets.length} enabled` : "…"}</dd>
          <dt>Description</dt>
          <dd>
            {profile.description || <span className="bkt-muted">none</span>}{" "}
            <button type="button" className="bkt-profiles-link" disabled={busy} onClick={() => void describe()}>
              Auto-describe
            </button>
          </dd>
        </dl>
        {editingModel && (
          <ModelPicker
            profile={profile}
            onSaved={() => {
              setEditingModel(false);
              setNotice("Model updated. It applies to new sessions.");
              void reloadProfiles();
            }}
          />
        )}
      </div>

      <form
        className="bkt-panel bkt-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (cloneName.trim() && !cloneTaken) void clone();
        }}
      >
        <h2 className="bkt-profiles-subtitle">Clone</h2>
        <div className="bkt-row">
          <input
            className="bkt-input bkt-profiles-narrow"
            aria-label="New profile name"
            placeholder="new profile name"
            value={cloneName}
            onChange={(e) => setCloneName(e.target.value)}
          />
          <label className="bkt-row bkt-muted">
            <input type="checkbox" checked={cloneAll} onChange={(e) => setCloneAll(e.target.checked)} />
            copy everything (sessions, memories), not only config, skills and SOUL
          </label>
          <Button size="sm" type="submit" disabled={busy || !cloneName.trim() || cloneTaken}>
            Clone {name}
          </Button>
        </div>
        {cloneTaken && <span className="bkt-error">A profile named {cloneName.trim()} already exists.</span>}
      </form>

      <div className="bkt-panel bkt-col">
        <h2 className="bkt-profiles-subtitle">Export and import</h2>
        <div className="bkt-row">
          <Button size="sm" outlined disabled={busy} onClick={() => void exportTo("")}>
            Export to default location
          </Button>
          <Button size="sm" outlined disabled={busy} onClick={() => setExportPicker(true)}>
            Export to folder…
          </Button>
        </div>
        <div className="bkt-row">
          <input
            className="bkt-input bkt-profiles-narrow"
            aria-label="Imported profile name"
            placeholder="name (optional)"
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
          />
          <Button size="sm" outlined disabled={busy} onClick={() => setImportPicker(true)}>
            Import archive…
          </Button>
        </div>
      </div>

      <FolderPickerDialog
        open={exportPicker}
        title={`Export ${name} to…`}
        confirmLabel="Export here"
        onClose={() => setExportPicker(false)}
        onPick={(folder) => {
          setExportPicker(false);
          void exportTo(exportArchivePath(folder, name));
        }}
      />
      <ArchivePickerDialog
        open={importPicker}
        onClose={() => setImportPicker(false)}
        onPick={(archive) => {
          setImportPicker(false);
          void importFrom(archive);
        }}
      />
    </div>
  );
}
