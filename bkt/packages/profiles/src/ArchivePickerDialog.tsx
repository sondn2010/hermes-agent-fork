import { useEffect, useState } from "react";
import { errorMessage } from "@bkt/shared/api";
import { listFiles } from "@bkt/shared/files";
import type { FileListing } from "@bkt/shared/files";
import { ui } from "@bkt/shared/sdk";

const ARCHIVE = /\.(tar\.gz|tgz)$/i;

interface ArchivePickerDialogProps {
  open: boolean;
  onPick: (path: string) => void;
  onClose: () => void;
}

/** Profile archive browser over core ``/api/files``; never accepts a free-text path. */
export function ArchivePickerDialog({ open, onPick, onClose }: ArchivePickerDialogProps) {
  const Dialog = ui("Dialog");
  const DialogContent = ui("DialogContent");
  const DialogHeader = ui("DialogHeader");
  const DialogTitle = ui("DialogTitle");
  const DialogFooter = ui("DialogFooter");
  const Button = ui("Button");
  const [listing, setListing] = useState<FileListing | null>(null);
  const [path, setPath] = useState<string | undefined>(undefined);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    listFiles(path)
      .then((data) => {
        if (!live) return;
        setListing(data);
        setPicked(null);
        setError(null);
      })
      .catch((err) => live && setError(errorMessage(err)));
    return () => {
      live = false;
    };
  }, [open, path]);

  const entries = listing?.entries.filter((e) => e.is_directory || ARCHIVE.test(e.name)) ?? [];

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Choose a profile archive (.tar.gz)</DialogTitle>
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
            {entries.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  className={`bkt-picker-item${picked === entry.path ? " is-active" : ""}`}
                  aria-pressed={picked === entry.path}
                  onClick={() => (entry.is_directory ? setPath(entry.path) : setPicked(entry.path))}
                >
                  {entry.is_directory ? `${entry.name}/` : entry.name}
                </button>
              </li>
            ))}
            {listing && entries.length === 0 && <li className="bkt-muted">No folders or archives here</li>}
          </ul>
        </div>
        <DialogFooter>
          <Button outlined onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!picked} onClick={() => picked && onPick(picked)}>
            Import this archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
