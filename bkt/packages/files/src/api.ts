import { bktFetch, jsonInit } from "@bkt/shared/api";
import { sdk } from "@bkt/shared/sdk";

const BASE = "/api/plugins/bkt-files";

export type Conflict = "fail" | "rename" | "overwrite";

export interface Skipped {
  path: string;
  reason: string;
}

export interface MoveResult {
  ok: boolean;
  moved: { source: string; target: string }[];
  skipped: Skipped[];
}

export interface CopyResult {
  ok: boolean;
  copied: number;
  skipped: Skipped[];
}

export interface UnzipResult {
  ok: boolean;
  dest_dir: string;
  files: number;
  dirs: number;
}

export interface WriteResult {
  ok: boolean;
  path: string;
  size: number;
  mtime: number;
}

export interface SearchHit {
  name: string;
  path: string;
  is_directory: boolean;
  is_symlink: boolean;
}

export interface SearchResult {
  root: string;
  results: SearchHit[];
  truncated: boolean;
}

/** Error carrying the HTTP status, so callers can offer conflict resolution on 409. */
export class FilesError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** HTTP status of a thrown request error: the host's ``ApiError`` (and ``FilesError``) carry
 * ``status``; older hosts encoded it as a ``"<status>: <body>"`` message prefix. */
export function statusOf(err: unknown): number {
  if (!(err instanceof Error)) return 0;
  const status = (err as Error & { status?: unknown }).status;
  if (typeof status === "number") return status;
  const match = /^(\d{3}):/.exec(err.message);
  return match ? Number(match[1]) : 0;
}

export function isConflict(err: unknown): boolean {
  return statusOf(err) === 409;
}

export const movePaths = (sources: string[], destDir: string, onConflict: Conflict = "fail") =>
  bktFetch<MoveResult>(`${BASE}/move`, jsonInit("POST", { sources, dest_dir: destDir, on_conflict: onConflict }));

export const copyPaths = (sources: string[], destDir: string, onConflict: Conflict = "fail") =>
  bktFetch<CopyResult>(`${BASE}/copy`, jsonInit("POST", { sources, dest_dir: destDir, on_conflict: onConflict }));

export const renamePath = (path: string, newName: string) =>
  bktFetch<{ ok: boolean; path: string }>(`${BASE}/rename`, jsonInit("POST", { path, new_name: newName }));

export const unzipPath = (path: string, destDir: string | null, onConflict: Conflict = "fail") =>
  bktFetch<UnzipResult>(`${BASE}/unzip`, jsonInit("POST", { path, dest_dir: destDir, on_conflict: onConflict }));

export const writeText = (path: string, content: string, expectedMtime: number | null) =>
  bktFetch<WriteResult>(`${BASE}/write-text`, jsonInit("POST", { path, content, expected_mtime: expectedMtime }));

export const searchFiles = (root: string, q: string) =>
  bktFetch<SearchResult>(`${BASE}/search?${new URLSearchParams({ root, q }).toString()}`);

/** Core delete (managed policy applies there). */
export const deletePath = (path: string) =>
  bktFetch<{ ok: boolean }>("/api/files", jsonInit("DELETE", { path, recursive: true }));

/** Core mkdir. */
export const makeDir = (path: string) => bktFetch<{ ok: boolean }>("/api/files/mkdir", jsonInit("POST", { path }));

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // not JSON
  }
  return `${res.status} ${res.statusText}`;
}

/** Core ``/api/files/download`` as a Blob, with the session header (no ``?token=`` in URLs). */
export async function fetchFileBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const res = await sdk().authedFetch(`/api/files/download?path=${encodeURIComponent(path)}`, { signal });
  if (!res.ok) throw new FilesError(await readError(res), res.status);
  return res.blob();
}

export interface ZipDownload {
  blob: Blob;
  filename: string;
  skipped: Skipped[];
  skippedCount: number;
}

function filenameOf(disposition: string | null, fallback: string): string {
  const star = disposition && /filename\*=utf-8''([^;]+)/i.exec(disposition);
  if (star) return decodeURIComponent(star[1]);
  const plain = disposition && /filename="([^"]+)"/i.exec(disposition);
  return plain ? plain[1] : fallback;
}

export async function fetchZip(paths: string[]): Promise<ZipDownload> {
  const res = await sdk().authedFetch(`${BASE}/zip`, jsonInit("POST", { paths }));
  if (!res.ok) throw new FilesError(await readError(res), res.status);
  let skipped: Skipped[] = [];
  try {
    skipped = JSON.parse(res.headers.get("X-BKT-Skipped") ?? "[]") as Skipped[];
  } catch {
    skipped = [];
  }
  return {
    blob: await res.blob(),
    filename: filenameOf(res.headers.get("Content-Disposition"), "files.zip"),
    skipped,
    skippedCount: Number(res.headers.get("X-BKT-Skipped-Count") ?? skipped.length),
  };
}

/** Hand a Blob to the browser as a download. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
