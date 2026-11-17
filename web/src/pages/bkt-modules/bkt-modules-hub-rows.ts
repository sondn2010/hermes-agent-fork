/**
 * Hub payload -> BKT Modules rows. Agent plugins named `bkt-*` become `agent` rows; the
 * dashboard-only `bkt-*` tabs (orphan dashboard manifests) become `dashboard` rows in the
 * "Dashboard tabs" group. Everything off the wire is re-checked here. No React, no I/O.
 */
import type { HubAgentPluginRow, PluginManifestResponse, PluginsHubResponse } from "@/lib/api";
import {
  categoryFromTags,
  DASHBOARD_TABS_CATEGORY,
  DIA_PLUGIN_PREFIX,
  isBktPluginName,
  type BktModule,
} from "./bkt-modules-grouping";

/** An orphan dashboard manifest; `user_hidden` is absent from older backends (read as shown). */
export interface HubOrphanDashboardRow extends PluginManifestResponse {
  user_hidden?: boolean;
}

/**
 * An agent row owns a UI when it ships a dashboard manifest, or is a DIA plugin: each
 * `bkt-dia-*` module has a panel in `/dia`, and `bkt-dia-common` is the console itself.
 */
export function agentRowHasUi(row: Pick<HubAgentPluginRow, "name" | "has_dashboard_manifest">): boolean {
  return row.has_dashboard_manifest === true || row.name.startsWith(DIA_PLUGIN_PREFIX);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The hub agent rows that are BKT modules, normalized. `tags` comes off the wire, so it is re-checked. */
export function toBktModules(rows: readonly HubAgentPluginRow[]): BktModule[] {
  return rows
    .filter((row) => isBktPluginName(row.name))
    .map((row) => ({
      name: row.name,
      kind: "agent" as const,
      description: text(row.description),
      version: text(row.version),
      enabled: row.runtime_status === "enabled",
      category: categoryFromTags(Array.isArray(row.tags) ? row.tags : []),
      hasUi: agentRowHasUi(row),
      uiHidden: row.user_hidden === true,
      uiLabel: text(row.dashboard_manifest?.label),
    }));
}

/** Dashboard-only `bkt-*` tabs; they have no agent plugin, so only their UI can be switched. */
export function toDashboardTabModules(orphans: readonly HubOrphanDashboardRow[]): BktModule[] {
  return orphans
    .filter((manifest) => typeof manifest.name === "string" && isBktPluginName(manifest.name))
    .map((manifest) => ({
      name: manifest.name,
      kind: "dashboard" as const,
      description: text(manifest.description),
      version: text(manifest.version),
      enabled: false,
      category: DASHBOARD_TABS_CATEGORY,
      hasUi: true,
      uiHidden: manifest.user_hidden === true,
      uiLabel: text(manifest.label),
    }));
}

/** Every BKT row of a hub response: agent plugins first, then the dashboard-only tabs. */
export function hubToBktModules(hub: Pick<PluginsHubResponse, "plugins" | "orphan_dashboard_plugins">): BktModule[] {
  const orphans: readonly HubOrphanDashboardRow[] = Array.isArray(hub.orphan_dashboard_plugins)
    ? hub.orphan_dashboard_plugins
    : [];
  return [...toBktModules(Array.isArray(hub.plugins) ? hub.plugins : []), ...toDashboardTabModules(orphans)];
}
