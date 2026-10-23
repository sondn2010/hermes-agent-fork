import type { ComponentType } from "react";
import type { BktPluginSDK } from "./runtime/sdk-globals";

// Captured while this bundle's IIFE is being evaluated: afterwards currentScript is null.
const SELF_SRC: string | null =
  typeof document !== "undefined" && document.currentScript instanceof HTMLScriptElement
    ? document.currentScript.src
    : null;
const SELF_PROFILE: string | null =
  typeof document !== "undefined" ? document.currentScript?.getAttribute("data-hermes-profile") ?? null : null;

export function sdk(): BktPluginSDK {
  const value = window.__HERMES_PLUGIN_SDK__;
  if (!value) throw new Error("Hermes plugin SDK is not loaded");
  return value;
}

/** A host UI primitive by name (Button, Card, Dialog, ...). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ui<P = any>(name: string): ComponentType<P> {
  const component = sdk().components[name];
  if (!component) throw new Error(`Hermes plugin SDK has no component ${name}`);
  return component as ComponentType<P>;
}

function basePath(): string {
  const raw = window.__HERMES_BASE_PATH__ ?? "";
  if (!raw) return "";
  return (raw.startsWith("/") ? raw : `/${raw}`).replace(/\/+$/, "");
}

/**
 * URL of a file inside a plugin's ``dashboard/`` directory. Resolved against this bundle's own
 * URL so the base path and the ``@<profile>`` segment always match how the host loaded it.
 */
export function pluginAssetUrl(plugin: string, file: string): string {
  if (SELF_SRC) return new URL(`../../${plugin}/${file}`, SELF_SRC).toString();
  const scope = SELF_PROFILE ? `@${encodeURIComponent(SELF_PROFILE)}/` : "";
  return `${basePath()}/dashboard-plugins/${scope}${plugin}/${file}`;
}

/** URL of a file next to this bundle's own ``dashboard/`` directory. */
export function selfAssetUrl(file: string): string {
  if (SELF_SRC) return new URL(`../${file}`, SELF_SRC).toString();
  throw new Error("selfAssetUrl needs the bundle's script URL");
}

/** The management profile the host loaded this bundle for ("" when unscoped). */
export function bundleProfile(): string {
  return SELF_PROFILE ?? "";
}

export interface SlotRegistration {
  slot: string;
  component: ComponentType;
}

/** Register a plugin's tab page and any shell slots it fills. */
export function registerPlugin(name: string, page: ComponentType | null, slots: SlotRegistration[] = []): void {
  const registry = window.__HERMES_PLUGINS__;
  if (!registry) return;
  // A slot-only plugin still registers a component, or the host reports NO_REGISTER.
  registry.register(name, page ?? (() => null));
  for (const { slot, component } of slots) registry.registerSlot(name, slot, component);
}

/** Client-side navigation to a dashboard route (e.g. "/bkt-chat") through the host router. */
export function navigateTo(path: string): void {
  const target = `${basePath()}${path}`;
  window.history.pushState({}, "", target);
  // The host router listens for popstate; pushState alone does not emit one.
  window.dispatchEvent(new PopStateEvent("popstate"));
}
