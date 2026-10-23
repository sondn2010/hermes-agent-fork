import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@bkt/shared/api";
import { listFiles } from "@bkt/shared/files";
import type { FileEntry, FileListing } from "@bkt/shared/files";
import { DropFolder } from "./DragMove";
import { baseName, joinPath } from "./paths";

/**
 * A listing entry addressed by ``<listing dir>/<name>`` rather than core's ``path``, which is the
 * symlink-resolved target. Operations then act on what the user sees, and on a link itself.
 */
export type Item = FileEntry;

export function itemsOf(listing: FileListing): Item[] {
  return listing.entries.map((entry) => ({ ...entry, path: joinPath(listing.path, entry.name) }));
}

interface FolderTreeProps {
  root: string;
  current: string | null;
  /** Bumped after any change so expanded folders refetch. */
  version: number;
  onNavigate: (path: string) => void;
  onMove: (sources: string[], destDir: string) => void;
}

/** What every node needs: subfolders per path, the expanded set and the page callbacks. */
interface TreeState {
  children: Record<string, Item[] | undefined>;
  expanded: ReadonlySet<string>;
  toggle: (path: string) => void;
  props: FolderTreeProps;
}

function TreeNode({ path, label, depth, tree }: { path: string; label: string; depth: number; tree: TreeState }) {
  const open = tree.expanded.has(path);
  const kids = tree.children[path];
  const active = tree.props.current === path;
  return (
    <li>
      <DropFolder path={path} onMove={tree.props.onMove} className="bkt-files-tree-row" title={path}>
        <span style={{ width: `${depth * 0.75}rem` }} className="bkt-files-indent" />
        <button type="button" className="bkt-files-chevron" aria-label={open ? "Collapse" : "Expand"} onClick={() => tree.toggle(path)}>
          {open ? "▾" : "▸"}
        </button>
        <button type="button" className={`bkt-files-tree-label${active ? " is-active" : ""}`} onClick={() => tree.props.onNavigate(path)}>
          {label}
        </button>
      </DropFolder>
      {open && kids && kids.length > 0 && (
        <ul className="bkt-files-tree-level">
          {kids.map((child) => (
            <TreeNode key={child.path} path={child.path} label={child.name} depth={depth + 1} tree={tree} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Lazily expanded folder tree; every node is a drop target for in-page moves. */
export function FolderTree(props: FolderTreeProps) {
  const { root, version } = props;
  const [children, setChildren] = useState<Record<string, Item[] | undefined>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([root]));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setExpanded((prev) => (prev.has(root) ? prev : new Set([...prev, root])));
  }, [root]);

  useEffect(() => {
    let live = true;
    for (const path of expanded) {
      listFiles(path)
        .then((listing) => {
          if (live) setChildren((prev) => ({ ...prev, [path]: itemsOf(listing).filter((e) => e.is_directory) }));
        })
        .catch((err) => live && setError(errorMessage(err)));
    }
    return () => {
      live = false;
    };
  }, [expanded, version]);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const tree: TreeState = { children, expanded, toggle, props };
  return (
    <nav className="bkt-files-tree" aria-label="Folders">
      {error && <div className="bkt-error">{error}</div>}
      <ul className="bkt-files-tree-level">
        <TreeNode path={root} label={baseName(root) || root} depth={0} tree={tree} />
      </ul>
    </nav>
  );
}
