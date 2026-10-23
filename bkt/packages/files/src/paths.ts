// Pure path helpers. Paths come from the gateway host, which may be Windows (``C:\a\b``) or
// POSIX (``/a/b``), whatever OS the browser runs on, so the separator is read from the path.

const DRIVE_ROOT = /^[A-Za-z]:[\\/]?$/;
const DRIVE_PREFIX = /^[A-Za-z]:/;

export function pathSep(path: string): "/" | "\\" {
  if (DRIVE_PREFIX.test(path) || path.startsWith("\\\\")) return "\\";
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

function isRoot(path: string): boolean {
  return path === "/" || path === "\\" || DRIVE_ROOT.test(path);
}

/** ``dir`` joined with each part using ``dir``'s own separator. */
export function joinPath(dir: string, ...parts: string[]): string {
  const sep = pathSep(dir);
  let out = dir;
  for (const part of parts) {
    if (!part) continue;
    out = out.endsWith("/") || out.endsWith("\\") ? `${out}${part}` : `${out}${sep}${part}`;
  }
  return out;
}

/** Last component of a host path. */
export function baseName(path: string): string {
  const trimmed = isRoot(path) ? path : path.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx < 0 ? trimmed : trimmed.slice(idx + 1);
}

/** Parent of a host path, or null at a root. */
export function parentOf(path: string): string | null {
  if (isRoot(path)) return null;
  const trimmed = path.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (idx < 0) return null;
  const head = trimmed.slice(0, idx);
  if (head === "") return trimmed[0];
  if (/^[A-Za-z]:$/.test(head)) return `${head}${pathSep(path)}`;
  return head;
}

export interface Crumb {
  label: string;
  path: string;
}

/** Breadcrumb trail from the filesystem root (or ``stopAt``, a locked root) to ``path``. */
export function breadcrumbs(path: string, stopAt?: string | null): Crumb[] {
  const crumbs: Crumb[] = [];
  let current: string | null = path;
  while (current !== null) {
    crumbs.unshift({ label: isRoot(current) ? current : baseName(current), path: current });
    if (stopAt && current === stopAt) break;
    current = parentOf(current);
  }
  return crumbs;
}

/**
 * Parts of a client-supplied relative upload path, or null when it is absolute, has a drive
 * letter, contains ``..`` or NUL, or is empty. Both separators split, so a Windows-style name
 * cannot smuggle a traversal past a POSIX parse.
 */
export function safeRelativePath(rel: string): string[] | null {
  if (!rel || rel.includes("\0")) return null;
  if (rel.startsWith("/") || rel.startsWith("\\") || DRIVE_PREFIX.test(rel)) return null;
  const parts = rel.split(/[\\/]+/).filter((p) => p !== "" && p !== ".");
  if (parts.length === 0 || parts.includes("..")) return null;
  return parts;
}

export type FileKind = "markdown" | "text" | "image" | "pdf" | "binary";

const TEXT_EXT = new Set([
  "txt", "log", "csv", "tsv", "json", "jsonl", "yaml", "yml", "toml", "ini", "cfg", "conf", "xml", "html",
  "css", "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "kt", "c", "h", "cpp", "hpp",
  "cs", "sh", "bash", "zsh", "ps1", "bat", "sql", "graphql", "lua", "php", "swift", "vue", "svelte", "env",
  "gitignore", "dockerfile", "makefile", "mdx", "rst", "tex",
]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "avif"]);

export function extension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx <= 0 ? name.toLowerCase() : name.slice(idx + 1).toLowerCase();
}

export function fileKind(name: string, mime?: string | null): FileKind {
  const ext = extension(name);
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (IMAGE_EXT.has(ext) || (mime?.startsWith("image/") ?? false)) return "image";
  if (TEXT_EXT.has(ext) || (mime?.startsWith("text/") ?? false)) return "text";
  return "binary";
}

export function formatBytes(size: number | null | undefined): string {
  if (size == null) return "";
  if (size < 1024) return `${size} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
