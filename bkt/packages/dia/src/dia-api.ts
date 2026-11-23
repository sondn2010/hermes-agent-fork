/**
 * Client for the DIA AI Console: the bkt-dia-common plugin API, the hub's Show UI flags and
 * the cron run history the monitoring view needs.
 *
 * Every request names the bundle's profile explicitly (`?profile=`), as the other bkt
 * packages do. The host only auto-scopes when no `profile=` is present, so an explicit one
 * always wins; with an unscoped bundle the plugin and hub routes fall back to the host's
 * automatic management-profile suffix, as the core console relied on.
 */
import { bktFetch, jsonInit } from "@bkt/shared/api";
import { bundleProfile } from "@bkt/shared/sdk";

/** Plugin that owns the console API and this bundle. */
export const DIA_COMMON_PLUGIN = "bkt-dia-common";

const PLUGIN_BASE = `/api/plugins/${DIA_COMMON_PLUGIN}`;

/** Where a failed run or health probe stopped. */
export type DiaStage = "validate" | "disabled" | "config" | "url_safety" | "network" | "http" | "response";

/** Run steps, always reported in this order. */
export const DIA_STEP_KEYS = ["validate", "build_question", "query", "result"] as const;
export type DiaStepKey = (typeof DIA_STEP_KEYS)[number];
export type DiaStepStatus = "ok" | "error" | "skipped";

export interface DiaStep {
  key: DiaStepKey;
  status: DiaStepStatus;
  ms: number;
}

export type DiaSchemaType = "string" | "integer" | "number" | "boolean" | "array" | "object";

/** One property of a tool's JSON-schema parameters, as far as the console form reads it. */
export interface DiaSchemaProperty {
  type?: DiaSchemaType;
  description?: string;
  enum?: Array<string | number>;
  default?: string | number | boolean;
  minimum?: number;
  maximum?: number;
}

export interface DiaToolParameters {
  type?: "object";
  properties?: Record<string, DiaSchemaProperty>;
  required?: string[];
}

export interface DiaTool {
  name: string;
  description: string;
  parameters: DiaToolParameters;
}

export interface DiaCategory {
  slug: string;
  label_vi: string;
  label_en: string;
}

export interface DiaModule {
  name: string;
  /** Null when the module failed to load (see `error`). */
  function_code: string | null;
  category: string | null;
  title: string;
  description: string;
  emoji: string | null;
  enabled: boolean;
  tools: DiaTool[];
  /** Set when the bundled module could not be loaded; `tools` is then empty. */
  error?: string;
}

export interface DiaModulesResponse {
  common_enabled: boolean;
  endpoint_configured: boolean;
  categories: DiaCategory[];
  modules: DiaModule[];
}

/** Failure fields shared by health probes and runs. */
export interface DiaFailure {
  error: string;
  hint: string;
  stage: DiaStage;
}

export interface DiaHealthOk {
  ok: true;
  status: string;
  total_documents: number | null;
  latency_ms: number;
}

export interface DiaHealthError extends DiaFailure {
  ok: false;
}

export type DiaHealthResponse = DiaHealthOk | DiaHealthError;

/** Tool arguments: the values the schema-generated form collected. */
export type DiaToolArguments = Record<string, string | number | boolean>;

/** One source record from the DIA service; its keys vary by module. */
export type DiaSource = Record<string, unknown>;

export interface DiaRunResponse extends Partial<DiaFailure> {
  ok: boolean;
  steps: DiaStep[];
  function_code: string;
  question?: string;
  answer?: string;
  type?: string | null;
  sources?: DiaSource[];
  /** How many sources the server dropped past its `max_sources` cap. */
  sources_omitted?: number;
}

export type DiaRunSource = "agent" | "console";

export interface DiaRunLogEntry {
  id: number;
  /** Epoch seconds. */
  at: number;
  module: string;
  tool: string;
  source: DiaRunSource;
  ok: boolean;
  stage: DiaStage | null;
  error: string | null;
  duration_ms: number;
  question_preview: string | null;
}

/** The fields of a hub plugin row the console reads. */
export interface HubPluginRow {
  name: string;
  user_hidden: boolean;
}

/** The fields of a cron job the monitoring view reads. */
export interface CronJob {
  id: string;
  profile?: string | null;
  name?: string | null;
  skills?: string[] | null;
  schedule?: { kind?: string; expr?: string; display?: string };
  schedule_display?: string | null;
  enabled: boolean;
  last_run_at?: string | null;
  last_status?: string | null;
}

/** One cron execution row (agent session or script-only output), newest first. */
export interface CronJobRun {
  id: string;
  title?: string | null;
  preview?: string | null;
  source?: string | null;
  /** Epoch seconds. */
  started_at: number;
  ended_at?: number | null;
}

export const DIA_RUNS_DEFAULT_LIMIT = 50;

/** `path` with the query parameters and, when the bundle has one, its profile. */
export function scopedUrl(path: string, query: Record<string, string> = {}, profile = bundleProfile()): string {
  const search = new URLSearchParams(query);
  if (profile) search.set("profile", profile);
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export function getDiaModules(): Promise<DiaModulesResponse> {
  return bktFetch<DiaModulesResponse>(scopedUrl(`${PLUGIN_BASE}/modules`));
}

export function getDiaHealth(): Promise<DiaHealthResponse> {
  return bktFetch<DiaHealthResponse>(scopedUrl(`${PLUGIN_BASE}/health`));
}

export function runDiaTool(module: string, tool: string, args: DiaToolArguments): Promise<DiaRunResponse> {
  return bktFetch<DiaRunResponse>(scopedUrl(`${PLUGIN_BASE}/run`), jsonInit("POST", { module, tool, arguments: args }));
}

export async function getDiaRuns(limit: number = DIA_RUNS_DEFAULT_LIMIT): Promise<DiaRunLogEntry[]> {
  const n = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : DIA_RUNS_DEFAULT_LIMIT;
  const data = await bktFetch<{ runs?: DiaRunLogEntry[] }>(scopedUrl(`${PLUGIN_BASE}/runs`, { limit: String(n) }));
  return data.runs ?? [];
}

/** Rows of the plugins hub; the console reads only the Show UI flag. */
export async function getHubPlugins(): Promise<HubPluginRow[]> {
  const data = await bktFetch<{ plugins?: HubPluginRow[] }>(scopedUrl("/api/dashboard/plugins/hub"));
  return data.plugins ?? [];
}

/** The bundle profile's cron jobs. Cron routes are not auto-scoped, so the profile is always named. */
export function getCronJobs(profile: string = bundleProfile()): Promise<CronJob[]> {
  return bktFetch<CronJob[]>(`/api/cron/jobs?profile=${encodeURIComponent(profile)}`);
}

/** Run history of one cron job. An empty profile lets the backend find the job's owner. */
export function getCronJobRuns(id: string, profile: string = bundleProfile()): Promise<{ runs: CronJobRun[] }> {
  return bktFetch<{ runs: CronJobRun[] }>(scopedUrl(`/api/cron/jobs/${encodeURIComponent(id)}/runs`, {}, profile));
}
