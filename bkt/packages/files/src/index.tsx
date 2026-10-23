import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, MouseEvent } from "react";
import { errorMessage } from "@bkt/shared/api";
import { FolderPickerDialog } from "@bkt/shared/components/FolderPickerDialog";
import { listFiles } from "@bkt/shared/files";
import type { FileListing } from "@bkt/shared/files";
import { registerPlugin, ui } from "@bkt/shared/sdk";
import { describeSkipped, withConflictChoice } from "./actions";
import type { Conflict, SearchResult } from "./api";
import {
  copyPaths, deletePath, fetchFileBlob, fetchZip, makeDir, movePaths, renamePath, saveBlob, searchFiles, unzipPath,
} from "./api";
import { ActionDialog, ContextMenu } from "./ContextMenu";
import type { MenuAction } from "./ContextMenu";
import { DropFolder, isInternalDrag, startDrag } from "./DragMove";
import { FolderTree, itemsOf } from "./FolderTree";
import type { Item } from "./FolderTree";
import { breadcrumbs, formatBytes, joinPath, parentOf } from "./paths";
import { PreviewPane } from "./PreviewPane";
import { itemsFromDataTransfer, UploadButtons, UploadProgress, useUploader } from "./UploadTree";
import { useSelection } from "./useSelection";

type Dialog =
  | { kind: "rename"; item: Item }
  | { kind: "mkdir" }
  | { kind: "delete"; items: Item[] }
  | { kind: "conflict"; message: string; resolve: (mode: Conflict | null) => void };

interface Status {
  text: string;
  error?: boolean;
}

function useListing(path: string | undefined, version: number) {
  const [listing, setListing] = useState<FileListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    listFiles(path)
      .then((data) => {
        if (!live) return;
        setListing(data);
        setError(null);
      })
      .catch((err) => live && setError(errorMessage(err)));
    return () => {
      live = false;
    };
  }, [path, version]);
  return { listing, error };
}

function Breadcrumbs({ listing, onNavigate, onMove }: {
  listing: FileListing;
  onNavigate: (path: string) => void;
  onMove: (sources: string[], dest: string) => void;
}) {
  return (
    <div className="bkt-files-crumbs" aria-label="Breadcrumb">
      {breadcrumbs(listing.path, listing.locked_root).map((crumb, i, all) => (
        <DropFolder key={crumb.path} path={crumb.path} onMove={onMove} className="bkt-files-crumb">
          <button type="button" className="bkt-files-link" onClick={() => onNavigate(crumb.path)}>
            {crumb.label}
          </button>
          {i < all.length - 1 && <span className="bkt-muted">›</span>}
        </DropFolder>
      ))}
    </div>
  );
}

interface FileListProps {
  items: Item[];
  selected: ReadonlySet<string>;
  onClick: (item: Item, event: MouseEvent) => void;
  onOpen: (item: Item) => void;
  onMenu: (item: Item, event: MouseEvent) => void;
  onMove: (sources: string[], dest: string) => void;
}

function FileRow({ item, props }: { item: Item; props: FileListProps }) {
  const isSelected = props.selected.has(item.path);
  const row = (
    <div
      role="row"
      aria-selected={isSelected}
      className={`bkt-files-row${isSelected ? " is-selected" : ""}`}
      draggable
      data-path={item.path}
      onDragStart={(e) => startDrag(e, isSelected ? [...props.selected] : [item.path])}
      onClick={(e) => props.onClick(item, e)}
      onDoubleClick={() => props.onOpen(item)}
      onContextMenu={(e) => props.onMenu(item, e)}
    >
      <span className="bkt-files-icon" aria-hidden>
        {item.is_directory ? "📁" : "📄"}
      </span>
      <span className="bkt-grow bkt-files-ellipsis">{item.name}</span>
      <span className="bkt-muted bkt-files-size">{item.is_directory ? "" : formatBytes(item.size)}</span>
    </div>
  );
  return item.is_directory ? (
    <DropFolder path={item.path} onMove={props.onMove}>
      {row}
    </DropFolder>
  ) : (
    row
  );
}

function FileList(props: FileListProps) {
  if (props.items.length === 0) return <div className="bkt-muted bkt-files-empty">This folder is empty. Drop files here to upload.</div>;
  return (
    <div role="grid" className="bkt-files-list" aria-multiselectable>
      {props.items.map((item) => (
        <FileRow key={item.path} item={item} props={props} />
      ))}
    </div>
  );
}

function SearchResults({ result, onPick, onClose }: {
  result: SearchResult;
  onPick: (path: string, isDir: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="bkt-col">
      <div className="bkt-row bkt-muted">
        <span className="bkt-grow">
          {result.results.length} match{result.results.length === 1 ? "" : "es"}
          {result.truncated ? " (search stopped early, refine the query)" : ""}
        </span>
        <button type="button" className="bkt-files-link" onClick={onClose}>
          Back to folder
        </button>
      </div>
      <ul className="bkt-list">
        {result.results.map((hit) => (
          <li key={hit.path}>
            <button type="button" className="bkt-list-item" onClick={() => onPick(hit.path, hit.is_directory)} title={hit.path}>
              <span aria-hidden>{hit.is_directory ? "📁" : "📄"}</span>
              <span className="bkt-files-ellipsis bkt-mono">{hit.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilesPage() {
  const Button = ui("Button");
  const [path, setPath] = useState<string | undefined>(undefined);
  const [version, setVersion] = useState(0);
  const { listing, error } = useListing(path, version);
  const [treeRoot, setTreeRoot] = useState<string | null>(null);
  const [preview, setPreview] = useState<Item | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [picker, setPicker] = useState<{ mode: "move" | "copy"; sources: string[] } | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchResult | null>(null);
  const dropDepth = useRef(0);
  const [osDrop, setOsDrop] = useState(false);

  const items = useMemo(() => (listing ? itemsOf(listing) : []), [listing]);
  const keys = useMemo(() => items.map((i) => i.path), [items]);
  const selection = useSelection(keys);
  const { selectOnly, clear: clearSelection } = selection;
  const selectedItems = useMemo(() => items.filter((i) => selection.selected.has(i.path)), [items, selection.selected]);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const uploader = useUploader(refresh);

  useEffect(() => {
    if (listing && treeRoot === null) setTreeRoot(listing.locked_root ?? listing.path);
  }, [listing, treeRoot]);

  useEffect(() => {
    if (!pendingPreview) return;
    const found = items.find((i) => i.path === pendingPreview);
    if (!found) return;
    setPendingPreview(null);
    setPreview(found);
    selectOnly(found.path);
  }, [items, pendingPreview, selectOnly]);

  const navigate = useCallback((next: string) => {
    setPath(next);
    setPreview(null);
    setSearch(null);
    clearSelection();
  }, [clearSelection]);

  const run = useCallback(async (work: () => Promise<string | null>) => {
    try {
      const text = await work();
      if (text) setStatus({ text });
    } catch (err) {
      setStatus({ text: errorMessage(err), error: true });
    } finally {
      refresh();
    }
  }, [refresh]);

  const chooseConflict = useCallback(
    (message: string) => new Promise<Conflict | null>((resolve) => setDialog({ kind: "conflict", message, resolve })),
    [],
  );

  const moveTo = useCallback((sources: string[], dest: string) => run(async () => {
    const result = await withConflictChoice((mode) => movePaths(sources, dest, mode), chooseConflict);
    if (!result) return null;
    return [`Moved ${result.moved.length} item(s).`, describeSkipped(result.skipped)].filter(Boolean).join(" ");
  }), [run, chooseConflict]);

  const copyTo = useCallback((sources: string[], dest: string) => run(async () => {
    const result = await withConflictChoice((mode) => copyPaths(sources, dest, mode), chooseConflict);
    if (!result) return null;
    return [`Copied ${result.copied} file(s).`, describeSkipped(result.skipped)].filter(Boolean).join(" ");
  }), [run, chooseConflict]);

  const open = useCallback((item: Item) => {
    if (item.is_directory) navigate(item.path);
    else setPreview(item);
  }, [navigate]);

  const downloadZip = useCallback((paths: string[]) => run(async () => {
    const zip = await fetchZip(paths);
    saveBlob(zip.blob, zip.filename);
    return [`Downloaded ${zip.filename}.`, describeSkipped(zip.skipped, zip.skippedCount)].filter(Boolean).join(" ");
  }), [run]);

  const actions: Record<MenuAction, (targets: Item[]) => void> = {
    open: (t) => open(t[0]),
    rename: (t) => setDialog({ kind: "rename", item: t[0] }),
    copy: (t) => setPicker({ mode: "copy", sources: t.map((i) => i.path) }),
    move: (t) => setPicker({ mode: "move", sources: t.map((i) => i.path) }),
    unzip: (t) => void run(async () => {
      const result = await withConflictChoice((mode) => unzipPath(t[0].path, null, mode), chooseConflict);
      return result ? `Extracted ${result.files} file(s) into ${result.dest_dir}.` : null;
    }),
    download: (t) => void run(async () => {
      saveBlob(await fetchFileBlob(t[0].path), t[0].name);
      return null;
    }),
    zip: (t) => void downloadZip(t.map((i) => i.path)),
    delete: (t) => setDialog({ kind: "delete", items: t }),
  };

  const onRowClick = (item: Item, e: MouseEvent) => {
    selection.click(item.path, { shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey });
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) setPreview(item);
  };

  const onRowMenu = (item: Item, e: MouseEvent) => {
    e.preventDefault();
    if (!selection.selected.has(item.path)) selection.selectOnly(item.path);
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const menuTargets = selectedItems;

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, textarea")) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selectedItems.length) setDialog({ kind: "delete", items: selectedItems });
    else if (e.key === "F2" && selectedItems.length === 1) setDialog({ kind: "rename", item: selectedItems[0] });
    else if (e.key === "Enter" && selectedItems.length === 1) open(selectedItems[0]);
    else if (e.key.toLowerCase() === "a" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      selection.selectAll();
    }
  };

  const osDragEvents = {
    onDragEnter: (e: DragEvent) => {
      if (isInternalDrag(e) || !e.dataTransfer.types.includes("Files")) return;
      dropDepth.current += 1;
      setOsDrop(true);
    },
    onDragLeave: () => {
      dropDepth.current = Math.max(0, dropDepth.current - 1);
      if (dropDepth.current === 0) setOsDrop(false);
    },
    onDragOver: (e: DragEvent) => {
      if (!isInternalDrag(e) && e.dataTransfer.types.includes("Files")) e.preventDefault();
    },
    onDrop: (e: DragEvent) => {
      dropDepth.current = 0;
      setOsDrop(false);
      if (isInternalDrag(e) || !listing || !e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      const dest = listing.path;
      void itemsFromDataTransfer(e.dataTransfer)
        .then((found) => uploader.start(dest, found))
        .catch((err) => setStatus({ text: errorMessage(err), error: true }));
    },
  };

  const runSearch = () => {
    if (!listing || !query.trim()) {
      setSearch(null);
      return;
    }
    void searchFiles(listing.path, query.trim())
      .then(setSearch)
      .catch((err) => setStatus({ text: errorMessage(err), error: true }));
  };

  const pickSearchHit = (hit: string, isDir: boolean) => {
    if (isDir) return navigate(hit);
    const parent = parentOf(hit);
    if (parent) navigate(parent);
    setPendingPreview(hit);
  };

  const confirmDialog = (value: string) => {
    if (!dialog) return;
    setDialog(null);
    if (dialog.kind === "conflict") return dialog.resolve(value === "rename" ? "rename" : "overwrite");
    if (dialog.kind === "rename") return void run(async () => (await renamePath(dialog.item.path, value), null));
    if (dialog.kind === "mkdir" && listing) return void run(async () => (await makeDir(joinPath(listing.path, value)), null));
    if (dialog.kind === "delete") {
      const targets = dialog.items;
      setPreview(null);
      void run(async () => {
        for (const item of targets) await deletePath(item.path);
        return `Deleted ${targets.length} item(s).`;
      });
    }
  };

  const closeDialog = () => {
    if (dialog?.kind === "conflict") dialog.resolve(null);
    setDialog(null);
  };

  return (
    <div className="bkt-page bkt-files" tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="bkt-row bkt-files-toolbar">
        <UploadButtons dest={listing?.path ?? null} uploader={uploader} />
        <Button size="sm" outlined disabled={!listing} onClick={() => setDialog({ kind: "mkdir" })}>
          New folder
        </Button>
        <Button size="sm" outlined disabled={selectedItems.length === 0} onClick={() => void downloadZip(selectedItems.map((i) => i.path))}>
          Download as zip
        </Button>
        <Button size="sm" ghost onClick={refresh}>
          Refresh
        </Button>
        <form className="bkt-row bkt-grow bkt-files-search" onSubmit={(e) => (e.preventDefault(), runSearch())}>
          <input className="bkt-input" placeholder="Search names in this folder…" value={query} onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value) setSearch(null);
          }} />
        </form>
      </div>
      {listing && <Breadcrumbs listing={listing} onNavigate={navigate} onMove={moveTo} />}
      {status && (
        <div className={status.error ? "bkt-error" : "bkt-callout"} role="status">
          {status.text}{" "}
          <button type="button" className="bkt-files-link" onClick={() => setStatus(null)}>
            Dismiss
          </button>
        </div>
      )}
      {error && <div className="bkt-error">{error}</div>}
      <UploadProgress uploader={uploader} />
      <div className="bkt-files-layout">
        <div className="bkt-panel bkt-files-pane">
          {treeRoot && <FolderTree root={treeRoot} current={listing?.path ?? null} version={version} onNavigate={navigate} onMove={moveTo} />}
        </div>
        <div className={`bkt-panel bkt-files-pane bkt-files-main${osDrop ? " is-drop" : ""}`} {...osDragEvents} data-testid="bkt-file-list">
          {search ? (
            <SearchResults result={search} onPick={pickSearchHit} onClose={() => setSearch(null)} />
          ) : (
            <FileList items={items} selected={selection.selected} onClick={onRowClick} onOpen={open} onMenu={onRowMenu} onMove={moveTo} />
          )}
        </div>
        <div className="bkt-panel bkt-files-pane">
          <PreviewPane
            entry={preview}
            onSaved={(entry, mtime) => {
              setPreview({ ...entry, mtime });
              setStatus({ text: `Saved ${entry.name}.` });
            }}
          />
        </div>
      </div>
      {menu && menuTargets.length > 0 && (
        <ContextMenu x={menu.x} y={menu.y} entries={menuTargets} onClose={() => setMenu(null)} onAction={(a) => actions[a](menuTargets)} />
      )}
      <ActionDialog
        open={dialog !== null}
        title={dialogTitle(dialog)}
        message={dialogMessage(dialog)}
        initialValue={dialog?.kind === "rename" ? dialog.item.name : dialog?.kind === "mkdir" ? "" : undefined}
        confirmLabel={dialog?.kind === "delete" ? "Delete" : dialog?.kind === "conflict" ? "Replace" : "OK"}
        danger={dialog?.kind === "delete" || dialog?.kind === "conflict"}
        alternatives={dialog?.kind === "conflict" ? [{ label: "Keep both", value: "rename" }] : undefined}
        onConfirm={confirmDialog}
        onClose={closeDialog}
      />
      <FolderPickerDialog
        open={picker !== null}
        title={picker?.mode === "copy" ? "Copy to…" : "Move to…"}
        initialPath={listing?.path}
        confirmLabel={picker?.mode === "copy" ? "Copy here" : "Move here"}
        onClose={() => setPicker(null)}
        onPick={(dest) => {
          const current = picker;
          setPicker(null);
          if (current) void (current.mode === "copy" ? copyTo : moveTo)(current.sources, dest);
        }}
      />
    </div>
  );
}

function dialogTitle(dialog: Dialog | null): string {
  if (!dialog) return "";
  const titles: Record<Dialog["kind"], string> = {
    rename: "Rename",
    mkdir: "New folder",
    delete: "Delete",
    conflict: "Name already in use",
  };
  return titles[dialog.kind];
}

function dialogMessage(dialog: Dialog | null): string | undefined {
  if (dialog?.kind === "delete") {
    const names = dialog.items.slice(0, 5).map((i) => i.name).join(", ");
    const more = dialog.items.length > 5 ? ` and ${dialog.items.length - 5} more` : "";
    return `Permanently delete ${names}${more}? Folders are deleted with everything inside.`;
  }
  if (dialog?.kind === "conflict") return `${dialog.message}. Replace the existing item, or keep both under a new name?`;
  return undefined;
}

registerPlugin("bkt-files", FilesPage);
