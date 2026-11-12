/**
 * Pure derivations for the BKT Modules page: which hub rows are BKT modules, which
 * category each belongs to, how the filter bar narrows them and how the URL query
 * round-trips the filter state. No React, no I/O — everything here is unit-tested.
 */
import type { HubAgentPluginRow } from "@/lib/api";

export const BKT_PLUGIN_PREFIX = "bkt-";
export const DIA_PLUGIN_PREFIX = "bkt-dia-";
/** Shared client module every DIA plugin needs at runtime. */
export const BKT_DIA_COMMON = "bkt-dia-common";

const CATEGORY_TAG_PREFIX = "category:";
export const UNCATEGORIZED = "uncategorized";

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

export interface BktModulesFilters {
  q: string;
  /** Selected category slugs; empty means every category. */
  categories: string[];
  status: StatusFilter;
}

export const DEFAULT_FILTERS: BktModulesFilters = { q: "", categories: [], status: "all" };

export interface BktModule {
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  category: string;
}

export type CategorySwitchState = "on" | "off" | "mixed";

export interface BktCategoryGroup {
  slug: string;
  /** Modules of this category that pass the current filters, sorted by name. */
  modules: BktModule[];
  enabledCount: number;
  state: CategorySwitchState;
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

/** The hub rows that are BKT modules, normalized. `tags` comes off the wire, so it is re-checked. */
export function toBktModules(rows: readonly HubAgentPluginRow[]): BktModule[] {
  return rows
    .filter((row) => isBktPluginName(row.name))
    .map((row) => ({
      name: row.name,
      description: row.description ?? "",
      version: row.version ?? "",
      enabled: row.runtime_status === "enabled",
      category: categoryFromTags(Array.isArray(row.tags) ? row.tags : []),
    }));
}

export function matchesFilters(module: BktModule, filters: BktModulesFilters): boolean {
  if (filters.status === "enabled" && !module.enabled) return false;
  if (filters.status === "disabled" && module.enabled) return false;
  if (filters.categories.length > 0 && !filters.categories.includes(module.category)) return false;
  const q = filters.q.trim().toLowerCase();
  if (!q) return true;
  return module.name.toLowerCase().includes(q) || module.description.toLowerCase().includes(q);
}

function categoryRank(slug: string): number {
  if (slug === UNCATEGORIZED) return KNOWN_CATEGORY_SLUGS.length + 1;
  const known = (KNOWN_CATEGORY_SLUGS as readonly string[]).indexOf(slug);
  return known === -1 ? KNOWN_CATEGORY_SLUGS.length : known;
}

export function compareCategories(a: string, b: string): number {
  return categoryRank(a) - categoryRank(b) || a.localeCompare(b);
}

export function switchState(modules: readonly BktModule[]): CategorySwitchState {
  const enabled = modules.filter((m) => m.enabled).length;
  if (enabled === 0) return "off";
  return enabled === modules.length ? "on" : "mixed";
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
      return {
        slug,
        modules: sorted,
        enabledCount: sorted.filter((m) => m.enabled).length,
        state: switchState(sorted),
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

/** `?q=&cat=a,b&status=` → filters; malformed values fall back to the defaults. */
export function parseFilters(params: URLSearchParams): BktModulesFilters {
  const status = (params.get("status") ?? "").trim().toLowerCase();
  const categories = (params.get("cat") ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  return {
    q: params.get("q") ?? "",
    categories: [...new Set(categories)],
    status: isStatusFilter(status) ? status : "all",
  };
}

/** Filters → query params, omitting defaults so a clean view has a clean URL. */
export function filtersToParams(filters: BktModulesFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.categories.length > 0) params.set("cat", filters.categories.join(","));
  if (filters.status !== "all") params.set("status", filters.status);
  return params;
}
