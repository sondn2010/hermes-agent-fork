import { useEffect, useState } from "react";
import { errorMessage } from "../api";
import { listFiles } from "../files";
import type { FileListing } from "../files";
import { ui } from "../sdk";

interface FolderPickerDialogProps {
  open: boolean;
  title?: string;
  initialPath?: string;
  confirmLabel?: string;
  onPick: (path: string) => void;
  onClose: () => void;
}

/** Folder browser over core ``/api/files``; never accepts a free-text path. */
export function FolderPickerDialog({ open, title, initialPath, confirmLabel, onPick, onClose }: FolderPickerDialogProps) {
  const Dialog = ui("Dialog");
  const DialogContent = ui("DialogContent");
  const DialogHeader = ui("DialogHeader");
  const DialogTitle = ui("DialogTitle");
  const DialogFooter = ui("DialogFooter");
  const Button = ui("Button");
  const [listing, setListing] = useState<FileListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<string | undefined>(initialPath);

  useEffect(() => {
    if (!open) return;
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
  }, [open, path]);

  const folders = listing?.entries.filter((e) => e.is_directory) ?? [];

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title ?? "Choose a folder"}</DialogTitle>
        </DialogHeader>
        <div className="bkt-picker">
          <div className="bkt-picker-path" title={listing?.path}>
            {listing?.path ?? "…"}
          </div>
          {error && <div className="bkt-error">{error}</div>}
          <ul className="bkt-picker-list">
            {listing?.parent && (
              <li>
                <button type="button" className="bkt-picker-item" onClick={() => setPath(listing.parent ?? undefined)}>
                  ..
                </button>
              </li>
            )}
            {folders.map((entry) => (
              <li key={entry.path}>
                <button type="button" className="bkt-picker-item" onClick={() => setPath(entry.path)}>
                  {entry.name}
                </button>
              </li>
            ))}
            {listing && folders.length === 0 && <li className="bkt-muted">No subfolders</li>}
          </ul>
        </div>
        <DialogFooter>
          <Button outlined onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!listing} onClick={() => listing && onPick(listing.path)}>
            {confirmLabel ?? "Select this folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
