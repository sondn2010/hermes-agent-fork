import { profileFetch } from "@bkt/shared/api";
import type { ProfileSummary } from "@bkt/shared/api";

export interface WorkbenchTabProps {
  profile: ProfileSummary;
  profiles: ProfileSummary[];
  /** Refetch ``GET /api/profiles`` (after clone, import, model change, ...). */
  reloadProfiles: () => Promise<void>;
  /** Select another profile in the list (e.g. a freshly cloned one). */
  selectProfile: (name: string) => void;
}

export function profilePath(name: string, suffix = ""): string {
  return `/api/profiles/${encodeURIComponent(name)}${suffix}`;
}

export interface ApiKeyInfo {
  present: boolean;
  masked: string;
  strong: boolean;
  source: "env" | "config" | "none";
  endpoint: string;
  base_url: string;
}

export interface GeneratedApiKey extends ApiKeyInfo {
  key: string;
}

export function getApiKey(profile: string): Promise<ApiKeyInfo> {
  return profileFetch<ApiKeyInfo>("/api/plugins/bkt-profiles/api-key", profile);
}

export function generateApiKey(profile: string, rotate: boolean): Promise<GeneratedApiKey> {
  return profileFetch<GeneratedApiKey>("/api/plugins/bkt-profiles/api-key/generate", profile, {
    method: "POST",
    body: { rotate },
  });
}

export function deleteApiKey(profile: string): Promise<ApiKeyInfo> {
  return profileFetch<ApiKeyInfo>("/api/plugins/bkt-profiles/api-key", profile, { method: "DELETE" });
}

export function restartGateway(profile: string): Promise<{ ok: boolean }> {
  return profileFetch("/api/gateway/restart", profile, { method: "POST" });
}

/** A multiplexed secondary is served on the default listener and reads its key live. */
export function restartNeeded(endpoint: string): boolean {
  return !endpoint.startsWith("/p/");
}

export interface MessagingEnvVar {
  key: string;
  required: boolean;
  is_set: boolean;
  redacted_value: string | null;
  value: string | null;
  description: string;
  prompt: string;
  help: string;
  url: string | null;
  is_password: boolean;
  is_list: boolean;
  advanced: boolean;
}

export interface MessagingPlatform {
  id: string;
  name: string;
  description: string;
  docs_url: string | null;
  enabled: boolean;
  configured: boolean;
  gateway_running: boolean;
  state: string | null;
  error_message: string | null;
  env_vars: MessagingEnvVar[];
}

export interface PendingPairing {
  platform: string;
  request_id: string;
  user_id: string;
  user_name: string;
  age_minutes: number;
}

export interface ApprovedUser {
  platform: string;
  user_id: string;
  user_name?: string;
  approved_at?: number;
  [key: string]: unknown;
}

export interface StatusSummary {
  gateway_running: boolean;
  gateway_state: string | null;
  gateway_platforms?: Record<string, { state?: string; error_message?: string | null }>;
  gateway_shared_with?: string[] | null;
}

export interface ToolsetRow {
  name: string;
  label: string;
  enabled: boolean;
}

export interface ModelProvider {
  slug: string;
  name: string;
  models?: string[];
  authenticated?: boolean | null;
}

export interface ModelOptions {
  providers: ModelProvider[];
  model?: string;
  provider?: string;
}
