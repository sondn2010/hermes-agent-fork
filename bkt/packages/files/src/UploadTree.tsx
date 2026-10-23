import { useCallback, useRef, useState } from "react";
import { bktUpload } from "@bkt/shared/api";
import { ui } from "@bkt/shared/sdk";
import { joinPath, safeRelativePath } from "./paths";

/** A file and its path relative to the upload destination (``a/b/c.txt``). */
export interface UploadItem {
  file: File;
  relativePath: string;
}

export type UploadStatus = "pending" | "uploading" | "done" | "error" | "rejected";

export interface UploadRow {
  relativePath: string;
  status: UploadStatus;
  message?: string;
}

const CONCURRENCY = 3;

/** Files from an ``<input>``; folder pickers set ``webkitRelativePath`` (``folder/sub/x``). */
export function itemsFromFileList(files: FileList | readonly File[]): UploadItem[] {
  return Array.from(files).map((file) => ({ file, relativePath: file.webkitRelativePath || file.name }));
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  // readEntries returns at most ~100 entries per call; keep reading until it returns none.
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: UploadItem[]): Promise<void> {
  const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    out.push({ file, relativePath: rel });
    return;
  }
  if (entry.isDirectory) {
    const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
    for (const child of children) await walkEntry(child, rel, out);
  }
}

/**
 * Files and folders dropped from the OS. Entries must be taken synchronously inside the drop
 * handler (the item list is cleared afterwards), so call this before any ``await``.
 */
export function itemsFromDataTransfer(dt: DataTransfer): Promise<UploadItem[]> {
  const entries = Array.from(dt.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry?.() ?? null);
  if (entries.some((e) => e === null)) return Promise.resolve(itemsFromFileList(dt.files));
  return (async () => {
    const out: UploadItem[] = [];
    for (const entry of entries) if (entry) await walkEntry(entry, "", out);
    return out;
  })();
}

async function uploadOne(dest: string, item: UploadItem, overwrite: boolean): Promise<UploadRow> {
  const parts = safeRelativePath(item.relativePath);
  if (!parts) return { relativePath: item.relativePath, status: "rejected", message: "unsafe path" };
  const body = new FormData();
  body.append("file", item.file, parts[parts.length - 1]);
  body.append("path", joinPath(dest, ...parts));
  body.append("overwrite", overwrite ? "true" : "false");
  try {
    const res = await bktUpload("/api/files/upload-stream", body);
    if (res.ok) return { relativePath: item.relativePath, status: "done" };
    let message = `${res.status}`;
    try {
      const data = (await res.json()) as { detail?: unknown };
      if (typeof data.detail === "string") message = data.detail;
    } catch {
      // keep the status code
    }
    return { relativePath: item.relativePath, status: "error", message };
  } catch (err) {
    return { relativePath: item.relativePath, status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

/** Upload state shared by the toolbar buttons and OS drops onto the file list. */
export function useUploader(onFinished: () => void) {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [overwrite, setOverwrite] = useState(false);

  const start = useCallback(
    async (dest: string, items: UploadItem[]) => {
      if (items.length === 0) return;
      setBusy(true);
      setRows(items.map((i) => ({ relativePath: i.relativePath, status: "pending" })));
      const update = (index: number, row: UploadRow) =>
        setRows((prev) => prev.map((r, i) => (i === index ? row : r)));
      let cursor = 0;
      const worker = async () => {
        while (cursor < items.length) {
          const index = cursor++;
          update(index, { relativePath: items[index].relativePath, status: "uploading" });
          update(index, await uploadOne(dest, items[index], overwrite));
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
      setBusy(false);
      onFinished();
    },
    [overwrite, onFinished],
  );

  return { rows, busy, overwrite, setOverwrite, start, clear: () => setRows([]) };
}

export type Uploader = ReturnType<typeof useUploader>;

const FOLDER_PICKER_ATTRS = { webkitdirectory: "", directory: "" } as Record<string, string>;

/** Toolbar: upload files, upload a folder (subfolders kept), overwrite toggle. */
export function UploadButtons({ dest, uploader }: { dest: string | null; uploader: Uploader }) {
  const Button = ui("Button");
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const pick = (input: HTMLInputElement | null) => {
    if (!input?.files || !dest) return;
    void uploader.start(dest, itemsFromFileList(input.files));
    input.value = "";
  };
  return (
    <div className="bkt-row">
      <input ref={filesRef} type="file" multiple hidden onChange={(e) => pick(e.currentTarget)} data-testid="bkt-upload-files" />
      <input ref={folderRef} type="file" multiple hidden {...FOLDER_PICKER_ATTRS} onChange={(e) => pick(e.currentTarget)} data-testid="bkt-upload-folder" />
      <Button size="sm" outlined disabled={!dest || uploader.busy} onClick={() => filesRef.current?.click()}>
        Upload files
      </Button>
      <Button size="sm" outlined disabled={!dest || uploader.busy} onClick={() => folderRef.current?.click()}>
        Upload folder
      </Button>
      <label className="bkt-row bkt-muted">
        <input type="checkbox" checked={uploader.overwrite} onChange={(e) => uploader.setOverwrite(e.target.checked)} />
        Overwrite
      </label>
    </div>
  );
}

const STATUS_LABEL: Record<UploadStatus, string> = {
  pending: "waiting",
  uploading: "uploading…",
  done: "done",
  error: "failed",
  rejected: "rejected",
};

/** Progress list for the current upload batch. */
export function UploadProgress({ uploader }: { uploader: Uploader }) {
  if (uploader.rows.length === 0) return null;
  const done = uploader.rows.filter((r) => r.status === "done").length;
  return (
    <div className="bkt-panel bkt-files-upload" data-testid="bkt-upload-progress">
      <div className="bkt-row">
        <strong className="bkt-grow">
          Upload {done}/{uploader.rows.length}
        </strong>
        {!uploader.busy && (
          <button type="button" className="bkt-files-link" onClick={uploader.clear}>
            Dismiss
          </button>
        )}
      </div>
      <ul className="bkt-files-upload-list">
        {uploader.rows.map((row) => (
          <li key={row.relativePath} className={`is-${row.status}`}>
            <span className="bkt-mono bkt-grow">{row.relativePath}</span>
            <span>{STATUS_LABEL[row.status]}</span>
            {row.message && <span className="bkt-error">{row.message}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
