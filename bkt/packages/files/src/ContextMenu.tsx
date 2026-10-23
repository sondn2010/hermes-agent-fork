import { useEffect, useRef, useState } from "react";
import type { FileEntry } from "@bkt/shared/files";
import { ui } from "@bkt/shared/sdk";
import { extension } from "./paths";

export type MenuAction = "open" | "rename" | "copy" | "move" | "unzip" | "download" | "zip" | "delete";

interface MenuItem {
  action: MenuAction;
  label: string;
  danger?: boolean;
}

/** Actions offered for a selection; single-item actions only appear for one entry. */
export function menuItems(entries: readonly FileEntry[]): MenuItem[] {
  if (entries.length === 0) return [];
  const one = entries.length === 1 ? entries[0] : null;
  const items: MenuItem[] = [];
  if (one) items.push({ action: "open", label: one.is_directory ? "Open" : "Preview" });
  if (one) items.push({ action: "rename", label: "Rename…" });
  items.push({ action: "copy", label: "Copy to…" }, { action: "move", label: "Move to…" });
  if (one && !one.is_directory && extension(one.name) === "zip") items.push({ action: "unzip", label: "Extract here" });
  if (one && !one.is_directory) items.push({ action: "download", label: "Download" });
  items.push({ action: "zip", label: "Download as zip" });
  items.push({ action: "delete", label: entries.length > 1 ? `Delete ${entries.length} items` : "Delete", danger: true });
  return items;
}

interface ContextMenuProps {
  x: number;
  y: number;
  entries: readonly FileEntry[];
  onAction: (action: MenuAction) => void;
  onClose: () => void;
}

/** Right-click menu at the cursor; closes on outside click, Escape, scroll or blur. */
export function ContextMenu({ x, y, entries, onAction, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    window.addEventListener("scroll", onClose, true);
    ref.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 320);
  return (
    <div ref={ref} className="bkt-files-menu" role="menu" style={{ left, top }} data-testid="bkt-context-menu">
      {menuItems(entries).map((item) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          className={`bkt-files-menu-item${item.danger ? " is-danger" : ""}`}
          onClick={() => {
            onClose();
            onAction(item.action);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

interface ActionDialogProps {
  open: boolean;
  title: string;
  message?: string;
  /** Present for a text prompt (rename, new folder). */
  initialValue?: string;
  confirmLabel: string;
  danger?: boolean;
  /** Extra buttons, e.g. "Keep both" on a conflict. */
  alternatives?: { label: string; value: string }[];
  onConfirm: (value: string) => void;
  onClose: () => void;
}

/** Confirmation or one-line text prompt over the host Dialog primitives. */
export function ActionDialog(props: ActionDialogProps) {
  const { open, title, message, initialValue, confirmLabel, danger, alternatives, onConfirm, onClose } = props;
  const Dialog = ui("Dialog");
  const DialogContent = ui("DialogContent");
  const DialogHeader = ui("DialogHeader");
  const DialogTitle = ui("DialogTitle");
  const DialogFooter = ui("DialogFooter");
  const Button = ui("Button");
  const [value, setValue] = useState(initialValue ?? "");
  useEffect(() => setValue(initialValue ?? ""), [initialValue, open]);
  const prompt = initialValue !== undefined;
  const submit = () => {
    if (prompt && !value.trim()) return;
    onConfirm(prompt ? value.trim() : "confirm");
  };

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {message && <p className="bkt-muted bkt-files-dialog-message">{message}</p>}
        {prompt && (
          <input
            className="bkt-input"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            data-testid="bkt-dialog-input"
          />
        )}
        <DialogFooter>
          <Button outlined onClick={onClose}>
            Cancel
          </Button>
          {alternatives?.map((alt) => (
            <Button key={alt.value} outlined onClick={() => onConfirm(alt.value)}>
              {alt.label}
            </Button>
          ))}
          <Button destructive={danger} onClick={submit}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
