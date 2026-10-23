import { useCallback, useEffect, useMemo, useState } from "react";
import { bktFetch, errorMessage, jsonInit } from "@bkt/shared/api";
import { MarkdownView } from "@bkt/shared/components/MarkdownView";
import { ui } from "@bkt/shared/sdk";
import { diffStats, lineDiff } from "./line-diff";
import { profilePath } from "./profile-api";
import type { WorkbenchTabProps } from "./profile-api";

interface SoulResponse {
  content: string;
  exists: boolean;
}

export function SoulTab({ profile }: WorkbenchTabProps) {
  const Button = ui("Button");
  const Dialog = ui("Dialog");
  const DialogContent = ui("DialogContent");
  const DialogHeader = ui("DialogHeader");
  const DialogTitle = ui("DialogTitle");
  const DialogDescription = ui("DialogDescription");
  const DialogFooter = ui("DialogFooter");

  const [saved, setSaved] = useState<SoulResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await bktFetch<SoulResponse>(profilePath(profile.name, "/soul"));
      setSaved(data);
      setDraft(data.content);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [profile.name]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = saved !== null && draft !== saved.content;
  const diff = useMemo(() => (reviewing && saved ? lineDiff(saved.content, draft) : []), [reviewing, saved, draft]);
  const stats = diffStats(diff);

  async function save() {
    setSaving(true);
    try {
      await bktFetch(profilePath(profile.name, "/soul"), jsonInit("PUT", { content: draft }));
      setSaved({ content: draft, exists: true });
      setReviewing(false);
      setNotice("SOUL.md saved. It applies to new sessions of this profile.");
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!saved) return error ? <div className="bkt-error">{error}</div> : <div className="bkt-muted">Loading…</div>;

  return (
    <div className="bkt-col">
      <div className="bkt-row">
        <span className="bkt-muted bkt-grow">
          {saved.exists ? "SOUL.md defines this profile's persona." : "This profile has no SOUL.md yet."}
        </span>
        <Button size="sm" outlined disabled={!dirty} onClick={() => setDraft(saved.content)}>
          Discard
        </Button>
        <Button size="sm" disabled={!dirty} onClick={() => setReviewing(true)}>
          Review and save
        </Button>
      </div>
      {error && <div className="bkt-error">{error}</div>}
      {notice && !dirty && <div className="bkt-success">{notice}</div>}
      <div className="bkt-profiles-editor">
        <textarea
          className="bkt-textarea bkt-profiles-soul-input"
          aria-label="SOUL.md"
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="bkt-panel bkt-profiles-preview">
          {draft.trim() ? <MarkdownView>{draft}</MarkdownView> : <div className="bkt-muted">Nothing to preview.</div>}
        </div>
      </div>

      <Dialog open={reviewing} onOpenChange={(open: boolean) => !open && setReviewing(false)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Save SOUL.md for {profile.name}?</DialogTitle>
            <DialogDescription>
              {stats.added} line(s) added, {stats.removed} line(s) removed.
            </DialogDescription>
          </DialogHeader>
          <pre className="bkt-profiles-diff" aria-label="Changes">
            {diff.map((line, i) => (
              <div key={i} className={`bkt-profiles-diff-${line.kind}`}>
                {line.kind === "add" ? "+ " : line.kind === "del" ? "- " : "  "}
                {line.text}
              </div>
            ))}
          </pre>
          <DialogFooter>
            <Button outlined onClick={() => setReviewing(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
