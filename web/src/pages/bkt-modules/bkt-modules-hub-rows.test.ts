import { describe, expect, it } from "vitest";
import type { HubAgentPluginRow, PluginManifestResponse } from "@/lib/api";
import { DASHBOARD_TABS_CATEGORY } from "./bkt-modules-grouping";
import { hubToBktModules, toBktModules, toDashboardTabModules, type HubOrphanDashboardRow } from "./bkt-modules-hub-rows";

function row(
  name: string,
  tags: string[],
  runtime_status: HubAgentPluginRow["runtime_status"] = "inactive",
  extra: Partial<HubAgentPluginRow> = {},
): HubAgentPluginRow {
  return {
    name,
    version: "0.1.0",
    description: `${name} description`,
    source: "bundled",
    runtime_status,
    has_dashboard_manifest: false,
    dashboard_manifest: null,
    path: `/plugins/${name}`,
    can_remove: false,
    can_update_git: false,
    auth_required: false,
    auth_command: "",
    user_hidden: false,
    tags,
    ...extra,
  };
}

function manifest(name: string, label: string, user_hidden?: boolean): HubOrphanDashboardRow {
  return {
    name,
    label,
    description: `${label} tab`,
    icon: "Box",
    version: "1.0.0",
    tab: { path: `/${name}` },
    entry: "dist/index.js",
    has_api: false,
    source: "bundled",
    ...(user_hidden === undefined ? {} : { user_hidden }),
  };
}

describe("toBktModules", () => {
  it("keeps only bkt-* rows and derives enabled + category", () => {
    const modules = toBktModules([
      row("bkt-dia-common", ["bkt", "category:shared"], "enabled"),
      row("other-plugin", ["category:shared"], "enabled"),
      row("bkt-legacy", [], "disabled"),
    ]);
    expect(modules.map((m) => [m.name, m.category, m.enabled])).toEqual([
      ["bkt-dia-common", "shared", true],
      ["bkt-legacy", "uncategorized", false],
    ]);
  });

  it("tolerates a row without tags from an older backend", () => {
    const legacy = { ...row("bkt-old", []), tags: undefined } as unknown as HubAgentPluginRow;
    expect(toBktModules([legacy])[0].category).toBe("uncategorized");
  });

  it("gives a UI to dashboard-manifest rows, DIA modules and the DIA common module only", () => {
    const withManifest = row("bkt-reports", [], "enabled", {
      has_dashboard_manifest: true,
      dashboard_manifest: manifest("bkt-reports", "Reports") as PluginManifestResponse,
      user_hidden: true,
    });
    const modules = toBktModules([
      withManifest,
      row("bkt-dia-common", []),
      row("bkt-dia-finance-tax", []),
      row("bkt-agent-only", []),
    ]);
    expect(modules.map((m) => [m.name, m.kind, m.hasUi, m.uiHidden, m.uiLabel])).toEqual([
      ["bkt-reports", "agent", true, true, "Reports"],
      ["bkt-dia-common", "agent", true, false, ""],
      ["bkt-dia-finance-tax", "agent", true, false, ""],
      ["bkt-agent-only", "agent", false, false, ""],
    ]);
  });
});

describe("toDashboardTabModules", () => {
  it("turns bkt-* orphan manifests into dashboard rows in the Dashboard tabs group", () => {
    const modules = toDashboardTabModules([
      manifest("bkt-files", "Files+", true),
      manifest("bkt-brand", "Brand", false),
      manifest("spotify", "Spotify", false),
    ]);
    expect(modules).toEqual([
      expect.objectContaining({
        name: "bkt-files",
        kind: "dashboard",
        category: DASHBOARD_TABS_CATEGORY,
        enabled: false,
        hasUi: true,
        uiHidden: true,
        uiLabel: "Files+",
      }),
      expect.objectContaining({ name: "bkt-brand", uiHidden: false }),
    ]);
  });

  it("reads a missing user_hidden as shown", () => {
    expect(toDashboardTabModules([manifest("bkt-chat", "Chat")])[0].uiHidden).toBe(false);
  });
});

describe("hubToBktModules", () => {
  it("lists agent rows then dashboard tabs, tolerating a missing orphan list", () => {
    const hub = { plugins: [row("bkt-dia-common", [])], orphan_dashboard_plugins: [manifest("bkt-kanban-workflow", "Kanban")] };
    expect(hubToBktModules(hub).map((m) => [m.name, m.kind])).toEqual([
      ["bkt-dia-common", "agent"],
      ["bkt-kanban-workflow", "dashboard"],
    ]);
    const legacy = { plugins: [row("bkt-x", [])] } as unknown as Parameters<typeof hubToBktModules>[0];
    expect(hubToBktModules(legacy).map((m) => m.name)).toEqual(["bkt-x"]);
  });
});
