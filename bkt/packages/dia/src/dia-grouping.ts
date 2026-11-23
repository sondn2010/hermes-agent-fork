/**
 * Pure helpers for the DIA AI Console: which modules are visible, how they group by
 * category, the latest logged run per module, and which cron jobs are DIA monitors.
 */
import type { CronJob, DiaCategory, DiaModule, DiaRunLogEntry, HubPluginRow } from "./dia-api";

/** Category slug for modules whose manifest declares none. */
export const DIA_UNCATEGORIZED = "uncategorized";

/** Where module enablement and Show UI live. */
export const BKT_MODULES_PATH = "/bkt-modules";

/** Skill-name prefix that marks a cron job as a DIA monitor. */
export const DIA_SKILL_PREFIX = "bkt-dia-";

export interface DiaModuleGroup {
  slug: string;
  /** `null` for a slug the catalog does not list (the slug itself is shown). */
  category: DiaCategory | null;
  modules: DiaModule[];
}

/** Plugin names the user hid with Show UI (`dashboard.hidden_plugins`). */
export function hiddenPluginNames(rows: readonly HubPluginRow[]): Set<string> {
  return new Set(rows.filter((row) => row.user_hidden).map((row) => row.name));
}

export function visibleDiaModules(modules: readonly DiaModule[], hidden: ReadonlySet<string>): DiaModule[] {
  return modules.filter((m) => !hidden.has(m.name));
}

function categorySlug(module: DiaModule): string {
  return module.category || DIA_UNCATEGORIZED;
}

/**
 * Groups modules by category in the catalog's `categories` order; slugs the catalog does
 * not list follow, alphabetically. Categories without a module (such as `shared`) are dropped.
 */
export function groupDiaModules(modules: readonly DiaModule[], categories: readonly DiaCategory[]): DiaModuleGroup[] {
  const bySlug = new Map<string, DiaModule[]>();
  for (const module of modules) {
    const slug = categorySlug(module);
    const list = bySlug.get(slug);
    if (list) list.push(module);
    else bySlug.set(slug, [module]);
  }
  const known = categories
    .filter((c) => bySlug.has(c.slug))
    .map((c) => ({ slug: c.slug, category: c, modules: bySlug.get(c.slug) ?? [] }));
  const listed = new Set(categories.map((c) => c.slug));
  const unknown = [...bySlug.keys()]
    .filter((slug) => !listed.has(slug))
    .sort()
    .map((slug) => ({ slug, category: null, modules: bySlug.get(slug) ?? [] }));
  return [...known, ...unknown];
}

/** Newest logged run per module name. */
export function latestRunByModule(runs: readonly DiaRunLogEntry[]): Map<string, DiaRunLogEntry> {
  const latest = new Map<string, DiaRunLogEntry>();
  for (const run of runs) {
    const current = latest.get(run.module);
    if (!current || run.at > current.at) latest.set(run.module, run);
  }
  return latest;
}

export function isDiaMonitoringJob(job: Pick<CronJob, "skills">): boolean {
  return (job.skills ?? []).some((skill) => typeof skill === "string" && skill.startsWith(DIA_SKILL_PREFIX));
}

export function diaMonitoringJobs(jobs: readonly CronJob[]): CronJob[] {
  return jobs.filter(isDiaMonitoringJob);
}
