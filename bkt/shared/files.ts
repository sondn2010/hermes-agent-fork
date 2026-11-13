import { bktFetch } from "./api";

export interface FileEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size: number | null;
  mtime: number | null;
  mime_type: string | null;
  broken_link?: boolean;
}

export interface FileListing {
  path: string;
  parent: string | null;
  entries: FileEntry[];
  root: string | null;
  locked_root: string | null;
  can_change_path: boolean;
}

/** Core ``GET /api/files``: the managed policy, sensitive filter and locked root all apply. */
export function listFiles(path?: string): Promise<FileListing> {
  return bktFetch<FileListing>(path ? `/api/files?path=${encodeURIComponent(path)}` : "/api/files");
}
