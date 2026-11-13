import { useEffect, useState } from "react";
import { errorMessage } from "@bkt/shared/api";
import { MarkdownView } from "@bkt/shared/components/MarkdownView";
import type { FileEntry } from "@bkt/shared/files";
import { ui } from "@bkt/shared/sdk";
import { fetchFileBlob, isConflict, writeText } from "./api";
import { fileKind, formatBytes } from "./paths";

/** Text larger than this is not previewed or edited inline (download it instead). */
export const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
const MEDIA_PREVIEW_MAX_BYTES = 50 * 1024 * 1024;

type Loaded =
  | { kind: "text"; text: string }
  | { kind: "url"; url: string }
  | { kind: "none"; reason: string };

const PDF_TYPE = "application/pdf";

async function loadPreview(entry: FileEntry, signal: AbortSignal): Promise<Loaded> {
  const kind = fileKind(entry.name, entry.mime_type);
  const size = entry.size ?? 0;
  if (kind === "binary") return { kind: "none", reason: "No preview for this file type." };
  if ((kind === "markdown" || kind === "text") && size > TEXT_PREVIEW_MAX_BYTES) {
    return { kind: "none", reason: `Too large to preview (${formatBytes(size)}).` };
  }
  if (size > MEDIA_PREVIEW_MAX_BYTES) return { kind: "none", reason: `Too large to preview (${formatBytes(size)}).` };
  const blob = await fetchFileBlob(entry.path, signal);
  if (kind === "markdown" || kind === "text") {
    return { kind: "text", text: new TextDecoder("utf-8").decode(await blob.arrayBuffer()) };
  }
  // Re-type the blob so an <iframe> renders the PDF inline instead of offering a download.
  const typed = kind === "pdf" ? new Blob([blob], { type: PDF_TYPE }) : blob;
  return { kind: "url", url: URL.createObjectURL(typed) };
}

function usePreview(entry: FileEntry | null, version: number) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLoaded(null);
    setError(null);
    if (!entry || entry.is_directory) return;
    const controller = new AbortController();
    let url: string | null = null;
    loadPreview(entry, controller.signal)
      .then((result) => {
        if (result.kind === "url") url = result.url;
        if (!controller.signal.aborted) setLoaded(result);
        else if (url) URL.revokeObjectURL(url);
      })
      .catch((err) => !controller.signal.aborted && setError(errorMessage(err)));
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [entry, version]);
  return { loaded, error, setLoaded };
}

function TextEditor({ entry, initial, onSaved, onCancel }: {
  entry: FileEntry;
  initial: string;
  onSaved: (text: string, mtime: number) => void;
  onCancel: () => void;
}) {
  const Button = ui("Button");
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    try {
      const result = await writeText(entry.path, text, entry.mtime);
      onSaved(text, result.mtime);
    } catch (err) {
      setError(isConflict(err) ? "The file changed on disk since it was opened. Reload it before saving." : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bkt-col">
      <textarea className="bkt-textarea bkt-files-editor" value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} />
      {error && <div className="bkt-error">{error}</div>}
      <div className="bkt-row">
        <Button size="sm" disabled={busy || text === initial} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" outlined disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function PreviewBody({ entry, loaded }: { entry: FileEntry; loaded: Loaded }) {
  if (loaded.kind === "none") return <div className="bkt-muted">{loaded.reason}</div>;
  const kind = fileKind(entry.name, entry.mime_type);
  if (loaded.kind === "text") {
    return kind === "markdown" ? (
      <MarkdownView>{loaded.text}</MarkdownView>
    ) : (
      <pre className="bkt-code bkt-files-code">
        <code>{loaded.text}</code>
      </pre>
    );
  }
  // The blob is typed application/pdf, so only the browser's PDF viewer renders it. Chrome
  // refuses to run that viewer inside a sandboxed frame, hence no sandbox attribute.
  if (kind === "pdf") return <iframe className="bkt-files-pdf" src={loaded.url} title={entry.name} />;
  return <img className="bkt-files-image" src={loaded.url} alt={entry.name} />;
}

interface PreviewPaneProps {
  entry: FileEntry | null;
  /** Called after a save with the new mtime so the listing stays in sync. */
  onSaved: (entry: FileEntry, mtime: number) => void;
}

/** Markdown (with mermaid), code/text, image and PDF preview, plus inline text editing. */
export function PreviewPane({ entry, onSaved }: PreviewPaneProps) {
  const Button = ui("Button");
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const { loaded, error, setLoaded } = usePreview(entry, version);
  useEffect(() => setEditing(false), [entry?.path]);

  if (!entry) return <div className="bkt-muted">Select a file to preview it.</div>;
  if (entry.is_directory) return <div className="bkt-muted">{entry.name} is a folder.</div>;
  const editable = loaded?.kind === "text";

  return (
    <div className="bkt-col bkt-files-preview" data-testid="bkt-preview">
      <div className="bkt-row">
        <strong className="bkt-grow bkt-files-ellipsis" title={entry.path}>
          {entry.name}
        </strong>
        <span className="bkt-muted">{formatBytes(entry.size)}</span>
        {editable && !editing && (
          <Button size="sm" outlined onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
        <Button size="sm" ghost onClick={() => setVersion((v) => v + 1)}>
          Reload
        </Button>
      </div>
      {error && <div className="bkt-error">{error}</div>}
      {!loaded && !error && <div className="bkt-muted">Loading…</div>}
      {loaded && editing && loaded.kind === "text" ? (
        <TextEditor
          entry={entry}
          initial={loaded.text}
          onCancel={() => setEditing(false)}
          onSaved={(text, mtime) => {
            setLoaded({ kind: "text", text });
            setEditing(false);
            onSaved(entry, mtime);
          }}
        />
      ) : (
        loaded && <PreviewBody entry={entry} loaded={loaded} />
      )}
    </div>
  );
}
