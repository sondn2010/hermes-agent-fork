// Ambient copy of the host SDK globals (web/src/plugins/sdk.d.ts is not importable from here).
import type { ComponentType } from "react";

export interface BktPluginSDK {
  readonly sdkVersion: string;
  React: typeof import("react").default;
  hooks: Record<string, unknown> & {
    useToast: () => {
      showToast: (message: string, type: "success" | "error") => void;
      toast: { message: string; type: "success" | "error" } | null;
    };
  };
  api: Record<string, (...args: never[]) => unknown>;
  fetchJSON: <T = unknown>(url: string, init?: RequestInit, options?: { allowUnauthorized?: boolean }) => Promise<T>;
  authedFetch: (url: string, init?: RequestInit) => Promise<Response>;
  buildWsUrl: (path: string, params?: Record<string, string>) => Promise<string>;
  buildWsAuthParam: () => Promise<[string, string]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components: Record<string, ComponentType<any>>;
  utils: {
    cn: (...classes: Array<string | false | null | undefined>) => string;
    timeAgo: (ts: number) => string;
    isoTimeAgo: (iso: string) => string;
  };
  useI18n: () => unknown;
}

export interface BktPluginRegistry {
  register(name: string, component: ComponentType): void;
  registerSlot(plugin: string, slot: string, component: ComponentType): void;
}

declare global {
  interface Window {
    __HERMES_PLUGIN_SDK__?: BktPluginSDK;
    __HERMES_PLUGINS__?: BktPluginRegistry;
    __HERMES_BASE_PATH__?: string;
  }
}
