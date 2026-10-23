import { errorMessage } from "@bkt/shared/api";
import type { Conflict, Skipped } from "./api";
import { isConflict } from "./api";

/** A 409 that a different conflict mode can resolve (not a live database or a symlink refusal). */
export function isNameConflict(err: unknown): boolean {
  return isConflict(err) && /already exists/i.test(errorMessage(err));
}

/**
 * Run ``op`` in ``fail`` mode; on a name conflict ask ``choose`` for ``overwrite`` or ``rename``
 * and retry once. Returns null when the user cancels.
 */
export async function withConflictChoice<T>(
  op: (mode: Conflict) => Promise<T>,
  choose: (message: string) => Promise<Conflict | null>,
): Promise<T | null> {
  try {
    return await op("fail");
  } catch (err) {
    if (!isNameConflict(err)) throw err;
    const mode = await choose(errorMessage(err));
    return mode ? op(mode) : null;
  }
}

/** One status line summarising skipped entries, e.g. "2 skipped: .env (sensitive), link (symlink)". */
export function describeSkipped(skipped: readonly Skipped[], total = skipped.length): string {
  if (total === 0) return "";
  const names = skipped.slice(0, 4).map((s) => `${s.path.split(/[\\/]/).pop()} (${s.reason})`);
  const more = total > names.length ? `, +${total - names.length} more` : "";
  return `${total} skipped: ${names.join(", ")}${more}`;
}
