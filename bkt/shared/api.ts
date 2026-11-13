import { useCallback, useEffect, useState } from "react";
import { sdk } from "./sdk";

/** JSON request through the host client (auth, base path, 401 handling). */
export function bktFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  return sdk().fetchJSON<T>(path, init);
}

/** Raw authenticated request for multipart uploads and blob downloads. */
export function bktUpload(path: string, body: BodyInit, init?: RequestInit): Promise<Response> {
  return sdk().authedFetch(path, { method: "POST", ...init, body });
}

/** JSON body helper: ``jsonInit("POST", {...})``. */
export function jsonInit(method: string, body?: unknown): RequestInit {
  return body === undefined
    ? { method }
    : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/**
 * Where each profile-scoped core endpoint reads the profile. ``query`` routes take
 * ``?profile=``; ``body`` routes read ``body.profile`` (their pydantic model has the field), and
 * also get the same ``?profile=`` so the host's automatic management-profile suffix can never
 * name a different profile than the body. Path parameters use ``:name`` placeholders.
 */
export const PROFILE_TRANSPORT = {
  "/api/status": "query",
  "/api/env": "query",
  "/api/env/reveal": "body",
  "/api/pairing": "query",
  "/api/pairing/clear-pending": "query",
  "/api/pairing/approve": "body",
  "/api/pairing/revoke": "body",
  "/api/messaging/platforms": "query",
  "/api/messaging/platforms/:id": "query",
  "/api/messaging/platforms/:id/test": "query",
  "/api/messaging/telegram/onboarding/start": "query",
  "/api/messaging/telegram/onboarding/:id": "query",
  "/api/messaging/telegram/onboarding/:id/apply": "query",
  "/api/messaging/whatsapp/onboarding/start": "query",
  "/api/messaging/whatsapp/onboarding/:id": "query",
  "/api/messaging/whatsapp/onboarding/:id/apply": "query",
  "/api/sessions": "query",
  "/api/model/options": "query",
  "/api/tools/toolsets": "query",
  "/api/gateway/restart": "query",
  "/api/chat/image-upload": "query",
  "/api/plugins/bkt-profiles/api-key": "query",
  "/api/plugins/bkt-profiles/api-key/generate": "query",
  "/api/plugins/bkt-kanban-workflow/flow": "query",
  "/api/plugins/bkt-prompts/prompts": "query",
  "/api/plugins/bkt-prompts/prompts/import": "query",
  "/api/plugins/bkt-prompts/prompts/:id": "query",
} as const satisfies Record<string, "query" | "body">;

export type ProfileEndpoint = keyof typeof PROFILE_TRANSPORT;

export interface ProfileRequestOptions {
  method?: string;
  params?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

export interface BuiltRequest {
  url: string;
  init: RequestInit;
}

/** Build the URL and init for a profile-scoped core endpoint. */
export function profileRequest(
  endpoint: ProfileEndpoint,
  profile: string,
  options: ProfileRequestOptions = {},
): BuiltRequest {
  const path = endpoint.replace(/:([a-z]+)/g, (_, key: string) => {
    const value = options.params?.[key];
    if (value === undefined) throw new Error(`${endpoint}: missing path parameter ${key}`);
    return encodeURIComponent(value);
  });
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) search.set(key, String(value));
  }
  if (profile) search.set("profile", profile);
  const qs = search.toString();
  const url = qs ? `${path}?${qs}` : path;

  const transport = PROFILE_TRANSPORT[endpoint];
  const method = options.method ?? (options.body ? "POST" : "GET");
  let body = options.body;
  if (transport === "body") body = { ...body, profile };
  return { url, init: jsonInit(method, body) };
}

export function profileFetch<T = unknown>(
  endpoint: ProfileEndpoint,
  profile: string,
  options?: ProfileRequestOptions,
): Promise<T> {
  const { url, init } = profileRequest(endpoint, profile, options);
  return bktFetch<T>(url, init);
}

export interface ProfileSummary {
  name: string;
  path?: string;
  is_default?: boolean;
  is_active?: boolean;
  model?: string | null;
  provider?: string | null;
  skill_count?: number;
  gateway_running?: boolean;
  description?: string | null;
  [key: string]: unknown;
}

interface ProfilesResponse {
  profiles: ProfileSummary[];
  [key: string]: unknown;
}

/** One ``GET /api/profiles`` read; ``reload`` refetches. */
export function useProfiles() {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await bktFetch<ProfilesResponse | ProfileSummary[]>("/api/profiles");
      setProfiles(Array.isArray(data) ? data : data.profiles ?? []);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { profiles, error, loading, reload };
}

/** Readable text from a thrown host error (``"<status>: <body>"``) or anything else. */
export function errorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const match = /^\d{3}: (.*)$/s.exec(err.message);
  if (!match) return err.message;
  try {
    const parsed = JSON.parse(match[1]) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // not JSON
  }
  return match[1];
}
