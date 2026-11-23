/** Small UI pieces the plugin SDK does not expose: a route link, a spinner and a refresh glyph. */
import type { MouseEvent, ReactNode } from "react";
import { navigateTo } from "@bkt/shared/sdk";

/** Browser URL of a dashboard route under the host's base path, as `navigateTo` builds it. */
function routeHref(path: string): string {
  const raw = window.__HERMES_BASE_PATH__ ?? "";
  const base = raw ? (raw.startsWith("/") ? raw : `/${raw}`).replace(/\/+$/, "") : "";
  return `${base}${path}`;
}

/** A dashboard route link: a real `href` for middle-click, client-side navigation on click. */
export function RouteLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateTo(to);
  };
  return (
    <a href={routeHref(to)} className={className ?? "bkt-dia-link"} onClick={onClick}>
      {children}
    </a>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <span className="bkt-dia-spinner" role={label ? "status" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

export function RefreshGlyph({ spinning }: { spinning?: boolean }) {
  return (
    <svg className={spinning ? "bkt-dia-icon bkt-dia-spin" : "bkt-dia-icon"} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
