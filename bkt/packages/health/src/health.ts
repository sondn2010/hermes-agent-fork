import type { Status } from "@bkt/shared/components/StatusDot";

export interface PlatformInfo {
  id: string;
  name: string;
  enabled: boolean;
  configured: boolean;
  gateway_running: boolean;
  state: string | null;
  error_message: string | null;
}

export interface PlatformsResponse {
  platforms: PlatformInfo[];
}

const OK_STATES = new Set(["connected"]);
const FAIL_STATES = new Set(["startup_failed", "error", "failed", "fatal", "disconnected"]);

/** Lime when connected, grey when disabled or not running, red when failing, indigo otherwise. */
export function platformStatus(p: PlatformInfo): Status {
  if (!p.enabled) return "off";
  const state = p.state ?? "";
  if (OK_STATES.has(state)) return "ok";
  if (FAIL_STATES.has(state) || p.error_message) return "fail";
  if (!p.configured) return "fail";
  if (state === "gateway_stopped") return "off";
  return "busy";
}

export function gatewayStatus(running: boolean | undefined): Status {
  return running ? "ok" : "off";
}

/** The worst status wins: fail > busy > ok > off. */
export function worst(statuses: Status[]): Status {
  for (const s of ["fail", "busy", "ok"] as const) if (statuses.includes(s)) return s;
  return "off";
}

/** One line per enabled platform plus the api_server column. */
export function summarise(platforms: PlatformInfo[]) {
  const enabled = platforms.filter((p) => p.enabled && p.id !== "api_server");
  const apiServer = platforms.find((p) => p.id === "api_server");
  return {
    messaging: enabled.length ? worst(enabled.map(platformStatus)) : ("off" as Status),
    apiServer: apiServer ? platformStatus(apiServer) : ("off" as Status),
    enabled,
    apiServerInfo: apiServer ?? null,
  };
}
