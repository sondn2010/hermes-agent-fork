/**
 * Pure derivations for the BKT Modules page: which category each row belongs to, how
 * the filter bar narrows rows and how the URL query round-trips the filter state.
 * Hub payload -> rows lives in `bkt-modules-hub-rows.ts`. No React, no I/O.
 */
export const BKT_PLUGIN_PREFIX = "bkt-";
export const DIA_PLUGIN_PREFIX = "bkt-dia-";
/** Shared client module every DIA plugin needs at runtime; its dashboard tab is the DIA AI Console. */
export const BKT_DIA_COMMON = "bkt-dia-common";

const CATEGORY_TAG_PREFIX = "category:";
export const UNCATEGORIZED = "uncategorized";
/** Pseudo-category holding the dashboard-only `bkt-*` tabs (no agent plugin behind them). */
export const DASHBOARD_TABS_CATEGORY = "dashboard-tabs";

/** Display order of the known categories; unknown slugs follow alphabetically, then uncategorized. */
export const KNOWN_CATEGORY_SLUGS = [
  "shared",
  "knowledge-rag",
  "assistant-channels",
  "domain-lookup",
  "analysis-forecast",
  "decision-support",
  "monitoring-personalization",
] as const;

export type KnownCategorySlug = (typeof KNOWN_CATEGORY_SLUGS)[number];

export const STATUS_FILTERS = ["all", "enabled", "disabled"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const UI_FILTERS = ["all", "shown", "hidden"] as const;
export type UiFilter = (typeof UI_FILTERS)[number];

export interface BktModulesFilters {
  q: string;
  /** Selected category slugs; empty means every category. */
  categories: string[];
  /** Agent Enabled state; rows without an agent plugin only pass `all`. */
  status: StatusFilter;
  /** Show UI state; rows without a UI only pass `all`. */
  ui: UiFilter;
}

export const DEFAULT_FILTERS: BktModulesFilters = { q: "", categories: [], status: "all", ui: "all" };

/** `agent`: an agent plugin (Enabled switch). `dashboard`: a dashboard-only tab (Show UI switch only). */
export type BktRowKind = "agent" | "dashboard";

export interface BktModule {
  name: string;
  kind: BktRowKind;
  description: string;
  version: string;
  /** Agent plugin enabled; always `false` for `dashboard` rows. */
  enabled: boolean;
  category: string;
  /** The row owns a UI the user can show or hide (dashboard tab/slot, DIA panel, DIA console). */
  hasUi: boolean;
  /** UI listed in `dashboard.hidden_plugins`. */
  uiHidden: boolean;
  /** Dashboard manifest label (`Files+`), `""` when the row has none. */
  uiLabel: string;
}

export type CategorySwitchState = "on" | "off" | "mixed";

export interface BktCategoryGroup {
  slug: string;
  /** Modules of this category that pass the current filters, sorted by name. */
  modules: BktModule[];
  /** Rows backed by an agent plugin (they carry the Enabled switch). */
  agentCount: number;
  enabledCount: number;
  /** Bulk Enabled state over agent rows; `null` when the group has none. */
  state: CategorySwitchState | null;
  /** Bulk Show UI state over rows with a UI; `null` when the group has none. */
  uiState: CategorySwitchState | null;
}

export function isKnownCategory(slug: string): slug is KnownCategorySlug {
  return (KNOWN_CATEGORY_SLUGS as readonly string[]).includes(slug);
}

/** Slug from the first well-formed `category:<slug>` tag (trimmed, lowercased), else `uncategorized`. */
export function categoryFromTags(tags: readonly unknown[]): string {
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const trimmed = tag.trim();
    if (!trimmed.toLowerCase().startsWith(CATEGORY_TAG_PREFIX)) continue;
    const slug = trimmed.slice(CATEGORY_TAG_PREFIX.length).trim().toLowerCase();
    return slug || UNCATEGORIZED;
  }
  return UNCATEGORIZED;
}

/** `knowledge-rag` → `Knowledge Rag`; the label for slugs without a translation. */
export function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function isBktPluginName(name: string): boolean {
  return name.startsWith(BKT_PLUGIN_PREFIX);
}

export function matchesFilters(module: BktModule, filters: BktModulesFilters): boolean {
  if (filters.status !== "all" && (module.kind !== "agent" || module.enabled !== (filters.status === "enabled"))) {
    return false;
  }
  if (filters.ui !== "all" && (!module.hasUi || module.uiHidden !== (filters.ui === "hidden"))) return false;
  if (filters.categories.length > 0 && !filters.categories.includes(module.category)) return false;
  const q = filters.q.trim().toLowerCase();
  if (!q) return true;
  return module.name.toLowerCase().includes(q) || module.description.toLowerCase().includes(q);
}

function categoryRank(slug: string): number {
  if (slug === DASHBOARD_TABS_CATEGORY) return KNOWN_CATEGORY_SLUGS.length + 2;
  if (slug === UNCATEGORIZED) return KNOWN_CATEGORY_SLUGS.length + 1;
  const known = (KNOWN_CATEGORY_SLUGS as readonly string[]).indexOf(slug);
  return known === -1 ? KNOWN_CATEGORY_SLUGS.length : known;
}

export function compareCategories(a: string, b: string): number {
  return categoryRank(a) - categoryRank(b) || a.localeCompare(b);
}

/** Tri-state of a bulk switch over `total` rows of which `on` are on; `null` when there is nothing to switch. */
export function switchState(on: number, total: number): CategorySwitchState | null {
  if (total === 0) return null;
  if (on === 0) return "off";
  return on === total ? "on" : "mixed";
}

/** Filtered modules grouped per category; categories with no visible module are dropped. */
export function groupModules(modules: readonly BktModule[], filters: BktModulesFilters): BktCategoryGroup[] {
  const bySlug = new Map<string, BktModule[]>();
  for (const module of modules) {
    if (!matchesFilters(module, filters)) continue;
    const bucket = bySlug.get(module.category);
    if (bucket) bucket.push(module);
    else bySlug.set(module.category, [module]);
  }
  return [...bySlug.entries()]
    .sort(([a], [b]) => compareCategories(a, b))
    .map(([slug, bucket]) => {
      const sorted = [...bucket].sort((x, y) => x.name.localeCompare(y.name));
      const agents = sorted.filter((m) => m.kind === "agent");
      const enabledCount = agents.filter((m) => m.enabled).length;
      const withUi = sorted.filter((m) => m.hasUi);
      return {
        slug,
        modules: sorted,
        agentCount: agents.length,
        enabledCount,
        state: switchState(enabledCount, agents.length),
        uiState: switchState(withUi.filter((m) => !m.uiHidden).length, withUi.length),
      };
    });
}

/** Every category present among the modules, in display order (feeds the category filter). */
export function availableCategories(modules: readonly BktModule[]): string[] {
  return [...new Set(modules.map((m) => m.category))].sort(compareCategories);
}

export function isDiaModule(name: string): boolean {
  return name.startsWith(DIA_PLUGIN_PREFIX) && name !== BKT_DIA_COMMON;
}

/** True when DIA modules cannot work: the shared module is absent or not enabled. */
export function diaCommonInactive(modules: readonly BktModule[]): boolean {
  return !modules.some((m) => m.name === BKT_DIA_COMMON && m.enabled);
}

/** A DIA module that is switched on while its shared dependency is off. */
export function needsDiaCommonWarning(module: BktModule, commonInactive: boolean): boolean {
  return commonInactive && module.enabled && isDiaModule(module.name);
}

function isStatusFilter(value: string): value is StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(value);
}

function isUiFilter(value: string): value is UiFilter {
  return (UI_FILTERS as readonly string[]).includes(value);
}

/** `?q=&cat=a,b&status=&ui=` → filters; malformed values fall back to the defaults. */
export function parseFilters(params: URLSearchParams): BktModulesFilters {
  const status = (params.get("status") ?? "").trim().toLowerCase();
  const ui = (params.get("ui") ?? "").trim().toLowerCase();
  const categories = (params.get("cat") ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  return {
    q: params.get("q") ?? "",
    categories: [...new Set(categories)],
    status: isStatusFilter(status) ? status : "all",
    ui: isUiFilter(ui) ? ui : "all",
  };
}

/** Filters → query params, omitting defaults so a clean view has a clean URL. */
export function filtersToParams(filters: BktModulesFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.categories.length > 0) params.set("cat", filters.categories.join(","));
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.ui !== "all") params.set("ui", filters.ui);
  return params;
}
