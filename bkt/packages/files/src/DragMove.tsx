import { useState } from "react";
import type { DragEvent, ReactNode } from "react";

/** In-page drags carry the dragged paths under this type; OS file drops never do. */
export const DRAG_MIME = "application/x-bkt-files";

export function startDrag(event: DragEvent, paths: string[]): void {
  event.dataTransfer.setData(DRAG_MIME, JSON.stringify(paths));
  event.dataTransfer.setData("text/plain", paths.join("\n"));
  event.dataTransfer.effectAllowed = "move";
}

export function isInternalDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes(DRAG_MIME);
}

export function draggedPaths(event: DragEvent): string[] {
  try {
    const parsed: unknown = JSON.parse(event.dataTransfer.getData(DRAG_MIME) || "[]");
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/** Whether ``paths`` may be dropped on ``target``: not onto itself, nor into its own subtree. */
export function canDropOn(paths: readonly string[], target: string): boolean {
  return paths.length > 0 && !paths.some((p) => target === p || target.startsWith(`${p}/`) || target.startsWith(`${p}\\`));
}

interface DropFolderProps {
  path: string;
  onMove: (sources: string[], destDir: string) => void;
  className?: string;
  children: ReactNode;
  title?: string;
}

/** A folder, tree node or breadcrumb that accepts in-page drags, with a drop highlight. */
export function DropFolder({ path, onMove, className, children, title }: DropFolderProps) {
  const [over, setOver] = useState(false);
  const accept = (event: DragEvent) => {
    if (!isInternalDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setOver(true);
  };
  return (
    <div
      className={`${className ?? ""} bkt-drop${over ? " is-over" : ""}`}
      title={title}
      onDragEnter={accept}
      onDragOver={accept}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        if (!isInternalDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        const paths = draggedPaths(event);
        if (canDropOn(paths, path)) onMove(paths, path);
      }}
    >
      {children}
    </div>
  );
}
