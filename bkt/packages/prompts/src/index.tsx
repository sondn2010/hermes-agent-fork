import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage, profileFetch, useProfiles } from "@bkt/shared/api";
import { MarkdownView } from "@bkt/shared/components/MarkdownView";
import { writeChatPrefill } from "@bkt/shared/prefill";
import { bundleProfile, navigateTo, registerPlugin, ui } from "@bkt/shared/sdk";
import { exportJson, fillVariables, matchesFilter, parseImport, parseTags, variablesOf } from "./template";
import type { Prompt, PromptDraft } from "./template";

const EMPTY: PromptDraft = { title: "", body: "", tags: [] };

function usePrompts(profile: string) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!profile) return;
    try {
      const data = await profileFetch<{ prompts: Prompt[] }>("/api/plugins/bkt-prompts/prompts", profile);
      setPrompts(data.prompts);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [profile]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { prompts, error, reload };
}

function Editor({ draft, onSave, onCancel }: {
  draft: PromptDraft & { id?: string };
  onSave: (draft: PromptDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const Button = ui("Button");
  const [title, setTitle] = useState(draft.title);
  const [tags, setTags] = useState(draft.tags.join(", "));
  const [body, setBody] = useState(draft.body);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const variables = useMemo(() => variablesOf(body), [body]);

  return (
    <div className="bkt-panel bkt-col">
      <label className="bkt-col">
        <span className="bkt-muted">Title</span>
        <input className="bkt-input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="bkt-col">
        <span className="bkt-muted">Tags (comma separated)</span>
        <input className="bkt-input" value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <div className="bkt-tabs" role="tablist">
        <button type="button" className="bkt-tab" role="tab" aria-selected={!preview} onClick={() => setPreview(false)}>Write</button>
        <button type="button" className="bkt-tab" role="tab" aria-selected={preview} onClick={() => setPreview(true)}>Preview</button>
      </div>
      {preview ? (
        <div className="bkt-prompts-preview"><MarkdownView>{body || "_Nothing to preview_"}</MarkdownView></div>
      ) : (
        <textarea className="bkt-textarea" value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Write the prompt. Use {{variable}} for values to fill in when using it." />
      )}
      <div className="bkt-muted">
        Variables: {variables.length ? variables.map((v) => <code key={v} className="bkt-var">{v}</code>) : "none"}
      </div>
      <div className="bkt-row">
        <Button disabled={busy || !title.trim() || !body.trim()} onClick={async () => {
          setBusy(true);
          try {
            await onSave({ title, body, tags: parseTags(tags) });
          } finally {
            setBusy(false);
          }
        }}>Save</Button>
        <Button outlined onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function UseDialog({ prompt, profile, onClose }: { prompt: Prompt; profile: string; onClose: () => void }) {
  const Dialog = ui("Dialog");
  const DialogContent = ui("DialogContent");
  const DialogHeader = ui("DialogHeader");
  const DialogTitle = ui("DialogTitle");
  const DialogFooter = ui("DialogFooter");
  const Button = ui("Button");
  const variables = variablesOf(prompt.body);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(variables.map((v) => [v, ""])));
  const text = fillVariables(prompt.body, values);

  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Use “{prompt.title}”</DialogTitle>
        </DialogHeader>
        <div className="bkt-col">
          {variables.map((name) => (
            <label key={name} className="bkt-col">
              <span className="bkt-muted">{name}</span>
              <input className="bkt-input" value={values[name] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))} />
            </label>
          ))}
          <div className="bkt-prompts-preview"><MarkdownView>{text}</MarkdownView></div>
        </div>
        <DialogFooter>
          <Button outlined onClick={onClose}>Cancel</Button>
          <Button disabled={variables.some((v) => !values[v]?.trim())} onClick={() => {
            writeChatPrefill({ text, profile });
            onClose();
            navigateTo("/bkt-chat");
          }}>Send to chat</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PromptsPage() {
  const Button = ui("Button");
  const { profiles } = useProfiles();
  const [profile, setProfile] = useState(bundleProfile() || "default");
  const { prompts, error, reload } = usePrompts(profile);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<(PromptDraft & { id?: string }) | null>(null);
  const [using, setUsing] = useState<Prompt | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const allTags = useMemo(() => [...new Set(prompts.flatMap((p) => p.tags))].sort(), [prompts]);
  const visible = prompts.filter((p) => matchesFilter(p, query, tag));

  async function act(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      setNotice(done);
      await reload();
    } catch (err) {
      setNotice(errorMessage(err));
    }
  }

  async function save(draft: PromptDraft) {
    const id = editing?.id;
    await act(
      () => id
        ? profileFetch("/api/plugins/bkt-prompts/prompts/:id", profile, { method: "PUT", params: { id }, body: { ...draft } })
        : profileFetch("/api/plugins/bkt-prompts/prompts", profile, { method: "POST", body: { ...draft } }),
      "Saved",
    );
    setEditing(null);
  }

  function download() {
    const blob = new Blob([exportJson(visible)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bkt-prompts-${profile}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    let drafts: PromptDraft[];
    try {
      drafts = parseImport(await file.text());
    } catch (err) {
      setNotice(errorMessage(err));
      return;
    }
    await act(
      () => profileFetch("/api/plugins/bkt-prompts/prompts/import", profile, { method: "POST", body: { prompts: drafts } }),
      `Imported ${drafts.length} prompt(s) into ${profile}`,
    );
  }

  return (
    <div className="bkt-page">
      <div className="bkt-row">
        <label className="bkt-row">
          <span className="bkt-muted">Profile</span>
          <select className="bkt-select bkt-prompts-profile" value={profile} onChange={(e) => setProfile(e.target.value)}>
            {(profiles.length ? profiles.map((p) => p.name) : [profile]).map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <input className="bkt-input bkt-grow bkt-prompts-search" placeholder="Search prompts" value={query}
          onChange={(e) => setQuery(e.target.value)} />
        <Button onClick={() => setEditing({ ...EMPTY })}>New prompt</Button>
        <Button outlined onClick={() => fileInput.current?.click()}>Import JSON</Button>
        <Button outlined disabled={!visible.length} onClick={download}>Export JSON</Button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importFile(file);
        }} />
      </div>
      {allTags.length > 0 && (
        <div className="bkt-row">
          <button type="button" className={`bkt-badge${tag === null ? " bkt-badge-ok" : ""}`} onClick={() => setTag(null)}>all</button>
          {allTags.map((t) => (
            <button type="button" key={t} className={`bkt-badge${tag === t ? " bkt-badge-ok" : ""}`} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
          ))}
        </div>
      )}
      {error && <div className="bkt-error">{error}</div>}
      {notice && <div className="bkt-muted">{notice}</div>}
      {editing && <Editor key={editing.id ?? "new"} draft={editing} onSave={save} onCancel={() => setEditing(null)} />}
      <div className="bkt-prompts-grid">
        {visible.map((p) => (
          <div key={p.id} className="bkt-panel bkt-col bkt-prompt-card">
            <div className="bkt-row">
              <strong className="bkt-grow">{p.title}</strong>
              {p.tags.map((t) => <span key={t} className="bkt-badge">{t}</span>)}
            </div>
            <div className="bkt-prompt-body bkt-muted">{p.body}</div>
            <div className="bkt-row">
              <Button size="sm" onClick={() => setUsing(p)}>Use</Button>
              <Button size="sm" outlined onClick={() => setEditing(p)}>Edit</Button>
              <Button size="sm" outlined onClick={() => {
                if (window.confirm(`Delete “${p.title}”?`)) {
                  void act(() => profileFetch("/api/plugins/bkt-prompts/prompts/:id", profile, { method: "DELETE", params: { id: p.id } }), "Deleted");
                }
              }}>Delete</Button>
            </div>
          </div>
        ))}
        {!visible.length && !error && <div className="bkt-muted">No prompts{prompts.length ? " match the filter" : " yet in this profile"}.</div>}
      </div>
      {using && <UseDialog prompt={using} profile={profile} onClose={() => setUsing(null)} />}
    </div>
  );
}

registerPlugin("bkt-prompts", PromptsPage);
