/**
 * Client for the DIA AI Console: the bkt-dia-common plugin API plus the cron run
 * history the console's monitoring view needs.
 *
 * The plugin routes live under `/api/plugins/`, which `fetchJSON` already scopes to
 * the selected management profile, so they never add `?profile=` themselves. Cron
 * routes are not auto-scoped and name the profile explicitly, as `api.getCronJobs` does.
 */
import { fetchJSON, getManagementProfile } from "@/lib/api";
import type { PluginManifest } from "@/plugins/types";

/** Plugin that owns the console API; its dashboard manifest gates the `/dia` nav entry. */
export const DIA_COMMON_PLUGIN = "bkt-dia-common";

const PLUGIN_BASE = `/api/plugins/${DIA_COMMON_PLUGIN}`;

/** Where a failed run or health probe stopped. */
export type DiaStage =
  | "validate"
  | "disabled"
  | "config"
  | "url_safety"
  | "network"
  | "http"
  | "response";

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

export interface DiaRunRequest {
  module: string;
  tool: string;
  arguments: DiaToolArguments;
}

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

export interface DiaRunsResponse {
  runs: DiaRunLogEntry[];
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
  is_active?: boolean;
  archived?: boolean;
  profile?: string | null;
}

export interface CronJobRunsResponse {
  runs: CronJobRun[];
  limit: number;
}

export const DIA_RUNS_DEFAULT_LIMIT = 50;

export function getDiaModules(): Promise<DiaModulesResponse> {
  return fetchJSON<DiaModulesResponse>(`${PLUGIN_BASE}/modules`);
}

export function getDiaHealth(): Promise<DiaHealthResponse> {
  return fetchJSON<DiaHealthResponse>(`${PLUGIN_BASE}/health`);
}

export function runDiaTool(
  module: string,
  tool: string,
  args: DiaToolArguments,
): Promise<DiaRunResponse> {
  const body: DiaRunRequest = { module, tool, arguments: args };
  return fetchJSON<DiaRunResponse>(`${PLUGIN_BASE}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getDiaRuns(limit: number = DIA_RUNS_DEFAULT_LIMIT): Promise<DiaRunsResponse> {
  const n = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : DIA_RUNS_DEFAULT_LIMIT;
  return fetchJSON<DiaRunsResponse>(`${PLUGIN_BASE}/runs?limit=${n}`);
}

/** Run history of one cron job. An empty profile lets the backend find the job's owner. */
export function getCronJobRuns(
  id: string,
  profile: string = getManagementProfile(),
): Promise<CronJobRunsResponse> {
  const url = `/api/cron/jobs/${encodeURIComponent(id)}/runs`;
  return fetchJSON<CronJobRunsResponse>(
    profile ? `${url}?profile=${encodeURIComponent(profile)}` : url,
  );
}

/**
 * Whether the sidebar shows the `/dia` entry. Only once plugins have loaded, so the
 * entry never flashes in and out: hiding or disabling bkt-dia-common drops its
 * manifest from `GET /api/dashboard/plugins`.
 */
export function isDiaConsoleNavVisible(
  manifests: readonly Pick<PluginManifest, "name">[],
  pluginsLoading: boolean,
): boolean {
  return !pluginsLoading && manifests.some((m) => m.name === DIA_COMMON_PLUGIN);
}
