/**
 * Sub-tab state of the console, kept in the URL as `?tab=<slug>` so a reload reopens it.
 * The host route and every other query parameter are left as they are.
 */
import { useCallback, useEffect, useState } from "react";

export const OVERVIEW_TAB = "tong-quan";
export const TAB_PARAM = "tab";

/** The requested slug when it names an available tab, else the overview. */
export function resolveTab(requested: string | null, available: readonly string[]): string {
  return requested && available.includes(requested) ? requested : OVERVIEW_TAB;
}

export function readTabParam(search: string = window.location.search): string | null {
  return new URLSearchParams(search).get(TAB_PARAM);
}

/** `?tab=` written into the current URL in place; the overview drops the parameter. */
export function writeTabParam(slug: string): void {
  const url = new URL(window.location.href);
  if (slug === OVERVIEW_TAB) url.searchParams.delete(TAB_PARAM);
  else url.searchParams.set(TAB_PARAM, slug);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

/** The requested tab slug and a setter that mirrors it into the URL. */
export function useTabParam(): [string | null, (slug: string) => void] {
  const [requested, setRequested] = useState<string | null>(() => readTabParam());
  // Back/forward (and navigateTo, which emits popstate) change the URL under the page.
  useEffect(() => {
    const sync = () => setRequested(readTabParam());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const select = useCallback((slug: string) => {
    setRequested(slug);
    writeTabParam(slug);
  }, []);
  return [requested, select];
}
