/**
 * Test double of the host plugin SDK for the DIA console tests: plain-DOM stand-ins for the
 * UI primitives the console uses, and a `fetchJSON` routed by path that records every call.
 */
import React from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { vi } from "vitest";
import type { BktPluginSDK } from "@bkt/shared/runtime/sdk-globals";

type Props = Record<string, unknown> & { children?: ReactNode };

/** Drop the host-only props a DOM element would reject. */
function domProps({ tone: _tone, outlined: _o, ghost: _g, size: _s, active: _a, ...rest }: Props) {
  return rest;
}

const components = {
  Button: (props: Props) => <button type="button" {...(domProps(props) as ButtonHTMLAttributes<HTMLButtonElement>)} />,
  Badge: (props: Props) => <span {...domProps(props)} />,
  Input: (props: Props) => <input {...domProps(props)} />,
  Label: (props: Props) => <label {...domProps(props)} />,
  Checkbox: ({ checked, onCheckedChange, ...props }: Props) => (
    <input
      type="checkbox"
      checked={checked === true}
      onChange={(e) => (onCheckedChange as (v: boolean) => void)(e.target.checked)}
      {...domProps(props)}
    />
  ),
  Select: ({ onValueChange, ...props }: Props) => (
    <select onChange={(e) => (onValueChange as (v: string) => void)(e.target.value)} {...domProps(props)} />
  ),
  SelectOption: (props: Props) => <option {...domProps(props)} />,
  TabsList: (props: Props) => <div {...domProps(props)} />,
  TabsTrigger: ({ value: _value, ...props }: Props) => <button type="button" {...(domProps(props) as ButtonHTMLAttributes<HTMLButtonElement>)} />,
};

export type Route = (url: URL, init: RequestInit | undefined) => unknown;

export interface StubSdk {
  /** Every request the console made, in order. */
  calls: Array<{ url: URL; init: RequestInit | undefined }>;
  /** Path → handler; a handler's thrown error or rejected promise becomes the fetch rejection. */
  routes: Map<string, Route>;
}

/** Install the stub as `window.__HERMES_PLUGIN_SDK__`; `routes` answer by exact pathname. */
export function installSdk(): StubSdk {
  const stub: StubSdk = { calls: [], routes: new Map() };
  const fetchJSON = vi.fn(async (path: string, init?: RequestInit) => {
    const url = new URL(path, "http://dashboard.test");
    stub.calls.push({ url, init });
    const route = stub.routes.get(url.pathname);
    if (!route) throw new Error(`404: {"detail":"no stub for ${url.pathname}"}`);
    return route(url, init);
  });
  window.__HERMES_PLUGIN_SDK__ = {
    sdkVersion: "test",
    React,
    hooks: {} as BktPluginSDK["hooks"],
    api: {},
    fetchJSON: fetchJSON as BktPluginSDK["fetchJSON"],
    authedFetch: vi.fn(),
    buildWsUrl: vi.fn(),
    buildWsAuthParam: vi.fn(),
    components,
    utils: { cn: (...c) => c.filter(Boolean).join(" "), timeAgo: String, isoTimeAgo: String },
    useI18n: () => ({}),
  };
  return stub;
}
