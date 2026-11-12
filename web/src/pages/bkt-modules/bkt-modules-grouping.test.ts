import { describe, expect, it } from "vitest";
import type { HubAgentPluginRow } from "@/lib/api";
import {
  availableCategories,
  categoryFromTags,
  DEFAULT_FILTERS,
  diaCommonInactive,
  filtersToParams,
  groupModules,
  needsDiaCommonWarning,
  parseFilters,
  titleCaseSlug,
  toBktModules,
  type BktModule,
} from "./bkt-modules-grouping";

function row(name: string, tags: string[], runtime_status: HubAgentPluginRow["runtime_status"] = "inactive"): HubAgentPluginRow {
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
  };
}

function mod(name: string, category: string, enabled = false, description = ""): BktModule {
  return { name, category, enabled, description, version: "1.0.0" };
}

describe("categoryFromTags", () => {
  it("takes the first category tag, trimmed and lowercased", () => {
    expect(categoryFromTags(["bkt", "  Category:Domain-Lookup ", "category:shared"])).toBe("domain-lookup");
  });

  it("falls back to uncategorized when missing or empty", () => {
    expect(categoryFromTags(["bkt"])).toBe("uncategorized");
    expect(categoryFromTags([])).toBe("uncategorized");
    expect(categoryFromTags(["category:  "])).toBe("uncategorized");
    expect(categoryFromTags([42, null])).toBe("uncategorized");
  });
});

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
});

describe("groupModules", () => {
  const modules = [
    mod("bkt-z-unknown", "zeta-things"),
    mod("bkt-misc", "uncategorized"),
    mod("bkt-dia-rag-retrieval", "knowledge-rag", true, "retrieval over documents"),
    mod("bkt-dia-common", "shared", true),
    mod("bkt-dia-document-intake", "knowledge-rag", false, "ingest files"),
    mod("bkt-a-unknown", "alpha-things"),
  ];

  it("orders known categories first, then unknown alphabetically, then uncategorized; rows by name", () => {
    const groups = groupModules(modules, DEFAULT_FILTERS);
    expect(groups.map((g) => g.slug)).toEqual(["shared", "knowledge-rag", "alpha-things", "zeta-things", "uncategorized"]);
    const rag = groups[1];
    expect(rag.modules.map((m) => m.name)).toEqual(["bkt-dia-document-intake", "bkt-dia-rag-retrieval"]);
    expect(rag.enabledCount).toBe(1);
    expect(rag.state).toBe("mixed");
    expect(groups[0].state).toBe("on");
    expect(groups[2].state).toBe("off");
  });

  it("combines text, category and status filters", () => {
    const byText = groupModules(modules, { ...DEFAULT_FILTERS, q: "INGEST" });
    expect(byText.flatMap((g) => g.modules.map((m) => m.name))).toEqual(["bkt-dia-document-intake"]);

    const byCategoryAndStatus = groupModules(modules, { q: "", categories: ["knowledge-rag", "shared"], status: "enabled" });
    expect(byCategoryAndStatus.map((g) => [g.slug, g.modules.map((m) => m.name)])).toEqual([
      ["shared", ["bkt-dia-common"]],
      ["knowledge-rag", ["bkt-dia-rag-retrieval"]],
    ]);

    const nothing = groupModules(modules, { q: "retrieval", categories: ["shared"], status: "all" });
    expect(nothing).toEqual([]);

    const disabled = groupModules(modules, { ...DEFAULT_FILTERS, status: "disabled" });
    expect(disabled.flatMap((g) => g.modules).every((m) => !m.enabled)).toBe(true);
  });

  it("lists available categories in display order", () => {
    expect(availableCategories(modules)).toEqual(["shared", "knowledge-rag", "alpha-things", "zeta-things", "uncategorized"]);
  });
});

describe("labels and warnings", () => {
  it("title-cases unknown slugs", () => {
    expect(titleCaseSlug("supply-chain_ops")).toBe("Supply Chain Ops");
  });

  it("warns for enabled DIA modules only while bkt-dia-common is off or absent", () => {
    const enabledDia = mod("bkt-dia-finance-tax", "domain-lookup", true);
    const offDia = mod("bkt-dia-workforce", "domain-lookup", false);
    const nonDia = mod("bkt-other", "shared", true);
    const commonOff = [mod("bkt-dia-common", "shared", false), enabledDia];
    expect(diaCommonInactive(commonOff)).toBe(true);
    expect(diaCommonInactive([enabledDia])).toBe(true);
    expect(diaCommonInactive([mod("bkt-dia-common", "shared", true)])).toBe(false);
    expect(needsDiaCommonWarning(enabledDia, true)).toBe(true);
    expect(needsDiaCommonWarning(enabledDia, false)).toBe(false);
    expect(needsDiaCommonWarning(offDia, true)).toBe(false);
    expect(needsDiaCommonWarning(nonDia, true)).toBe(false);
    expect(needsDiaCommonWarning(mod("bkt-dia-common", "shared", true), true)).toBe(false);
  });
});

describe("URL filter round-trip", () => {
  it("parses and normalizes query params", () => {
    const filters = parseFilters(new URLSearchParams("q=tax&cat=Domain-Lookup,shared,,shared&status=ENABLED"));
    expect(filters).toEqual({ q: "tax", categories: ["domain-lookup", "shared"], status: "enabled" });
  });

  it("falls back to defaults for malformed values", () => {
    expect(parseFilters(new URLSearchParams("status=bogus"))).toEqual(DEFAULT_FILTERS);
  });

  it("serializes only non-default values and round-trips", () => {
    expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe("");
    const filters = { q: "rag", categories: ["knowledge-rag", "shared"], status: "disabled" as const };
    expect(parseFilters(filtersToParams(filters))).toEqual(filters);
  });
});
