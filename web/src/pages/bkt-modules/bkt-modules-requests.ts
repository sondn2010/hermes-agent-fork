/**
 * The two per-row writes the BKT Modules page makes. Each resolves to an error message,
 * or `null` on success, so callers roll back and notify without their own try/catch.
 */
import { api } from "@/lib/api";

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

const REJECTED = "rejected by the server";

/** Agent plugin enable/disable (`plugins.enabled` / `plugins.disabled`). */
export async function requestPluginEnabled(name: string, enabled: boolean): Promise<string | null> {
  try {
    const result = enabled ? await api.enableAgentPlugin(name) : await api.disableAgentPlugin(name);
    return result.ok === false ? REJECTED : null;
  } catch (error) {
    return errorMessage(error);
  }
}

/** Show/hide a plugin's UI (`dashboard.hidden_plugins`); takes effect after a dashboard reload. */
export async function requestPluginUiShown(name: string, show: boolean): Promise<string | null> {
  try {
    const result = await api.setPluginVisibility(name, !show);
    return result.ok === false ? REJECTED : null;
  } catch (error) {
    return errorMessage(error);
  }
}

export function withSetMember<T>(set: ReadonlySet<T>, items: readonly T[], present: boolean): Set<T> {
  const next = new Set(set);
  for (const item of items) {
    if (present) next.add(item);
    else next.delete(item);
  }
  return next;
}
