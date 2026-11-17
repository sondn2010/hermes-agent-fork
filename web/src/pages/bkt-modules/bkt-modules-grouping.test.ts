import { describe, expect, it } from "vitest";
import {
  availableCategories,
  categoryFromTags,
  DASHBOARD_TABS_CATEGORY,
  DEFAULT_FILTERS,
  diaCommonInactive,
  filtersToParams,
  groupModules,
  needsDiaCommonWarning,
  parseFilters,
  titleCaseSlug,
  type BktModule,
} from "./bkt-modules-grouping";

function mod(name: string, category: string, enabled = false, description = "", extra: Partial<BktModule> = {}): BktModule {
  return {
    name,
    kind: "agent",
    category,
    enabled,
    description,
    version: "1.0.0",
    hasUi: false,
    uiHidden: false,
    uiLabel: "",
    ...extra,
  };
}

function tab(name: string, uiHidden = false): BktModule {
  return mod(name, DASHBOARD_TABS_CATEGORY, false, "", { kind: "dashboard", hasUi: true, uiHidden });
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

    const byCategoryAndStatus = groupModules(modules, { ...DEFAULT_FILTERS, categories: ["knowledge-rag", "shared"], status: "enabled" });
    expect(byCategoryAndStatus.map((g) => [g.slug, g.modules.map((m) => m.name)])).toEqual([
      ["shared", ["bkt-dia-common"]],
      ["knowledge-rag", ["bkt-dia-rag-retrieval"]],
    ]);

    const nothing = groupModules(modules, { ...DEFAULT_FILTERS, q: "retrieval", categories: ["shared"] });
    expect(nothing).toEqual([]);

    const disabled = groupModules(modules, { ...DEFAULT_FILTERS, status: "disabled" });
    expect(disabled.flatMap((g) => g.modules).every((m) => !m.enabled)).toBe(true);
  });

  it("lists available categories in display order", () => {
    expect(availableCategories(modules)).toEqual(["shared", "knowledge-rag", "alpha-things", "zeta-things", "uncategorized"]);
  });
});

describe("Show UI grouping", () => {
  const modules = [
    tab("bkt-files"),
    tab("bkt-brand", true),
    mod("bkt-dia-common", "shared", true, "", { hasUi: true }),
    mod("bkt-dia-finance-tax", "domain-lookup", false, "", { hasUi: true, uiHidden: true }),
    mod("bkt-agent-only", "domain-lookup", true),
  ];

  it("puts dashboard tabs last with only a UI bulk state", () => {
    const groups = groupModules(modules, DEFAULT_FILTERS);
    expect(groups.map((g) => g.slug)).toEqual(["shared", "domain-lookup", DASHBOARD_TABS_CATEGORY]);
    const tabs = groups[2];
    expect(tabs.agentCount).toBe(0);
    expect(tabs.state).toBeNull();
    expect(tabs.uiState).toBe("mixed");
  });

  it("derives the Enabled state from agent rows and the UI state from rows with a UI", () => {
    const lookup = groupModules(modules, DEFAULT_FILTERS)[1];
    expect(lookup.agentCount).toBe(2);
    expect(lookup.enabledCount).toBe(1);
    expect(lookup.state).toBe("mixed");
    // Only finance-tax has a UI, and it is hidden.
    expect(lookup.uiState).toBe("off");
  });

  it("filters by UI state, dropping rows without a UI", () => {
    const names = (ui: "shown" | "hidden") =>
      groupModules(modules, { ...DEFAULT_FILTERS, ui }).flatMap((g) => g.modules.map((m) => m.name));
    expect(names("shown")).toEqual(["bkt-dia-common", "bkt-files"]);
    expect(names("hidden")).toEqual(["bkt-dia-finance-tax", "bkt-brand"]);
  });

  it("keeps dashboard tabs out of the Enabled status filters", () => {
    const enabled = groupModules(modules, { ...DEFAULT_FILTERS, status: "enabled" });
    const disabled = groupModules(modules, { ...DEFAULT_FILTERS, status: "disabled" });
    expect(enabled.flatMap((g) => g.modules.map((m) => m.name))).toEqual(["bkt-dia-common", "bkt-agent-only"]);
    expect(disabled.flatMap((g) => g.modules.map((m) => m.name))).toEqual(["bkt-dia-finance-tax"]);
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
    expect(filters).toEqual({ q: "tax", categories: ["domain-lookup", "shared"], status: "enabled", ui: "all" });
  });

  it("falls back to defaults for malformed values", () => {
    expect(parseFilters(new URLSearchParams("status=bogus"))).toEqual(DEFAULT_FILTERS);
  });

  it("serializes only non-default values and round-trips", () => {
    expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe("");
    const filters = { q: "rag", categories: ["knowledge-rag", "shared"], status: "disabled" as const, ui: "all" as const };
    expect(parseFilters(filtersToParams(filters))).toEqual(filters);
  });

  it("round-trips the UI filter and rejects unknown values", () => {
    const filters = { ...DEFAULT_FILTERS, ui: "hidden" as const };
    expect(filtersToParams(filters).toString()).toBe("ui=hidden");
    expect(parseFilters(filtersToParams(filters))).toEqual(filters);
    expect(parseFilters(new URLSearchParams("ui=SHOWN")).ui).toBe("shown");
    expect(parseFilters(new URLSearchParams("ui=maybe")).ui).toBe("all");
  });
});
