/**
 * Page-local state for BKT Modules: the hub-derived module list with optimistic
 * enable/disable, and the URL-backed filter state.
 *
 * Sequencing invariant: a hub response is applied only if it is the newest fetch AND no
 * toggle started or settled while it was in flight. Toggles flip the row immediately,
 * roll back on failure, and once the last one settles a single debounced refetch
 * reconciles with the server — so a stale hub payload (or the server's short hub cache)
 * can never overwrite optimistic state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "@/lib/api";
import type { BktModulesPageStrings } from "@/i18n/types";
import {
  filtersToParams,
  parseFilters,
  toBktModules,
  type BktModule,
  type BktModulesFilters,
} from "./bkt-modules-grouping";

export type NotifyFn = (message: string, type: "error" | "success") => void;

export interface BktModulesController {
  /** `null` until the first successful load. */
  modules: BktModule[] | null;
  loading: boolean;
  loadError: string | null;
  /** Module names with a request in flight. */
  pending: ReadonlySet<string>;
  /** Category slugs whose bulk toggle is in flight. */
  busyCategories: ReadonlySet<string>;
  reload: () => void;
  toggleModule: (name: string, next: boolean) => Promise<void>;
  toggleCategory: (slug: string, names: readonly string[], next: boolean) => Promise<void>;
}

/** Delay before the reconciling refetch, so a burst of toggles costs one hub read. */
export const RECONCILE_DELAY_MS = 300;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

/** One enable/disable call; resolves to an error message, or `null` on success. */
async function setPluginEnabled(name: string, enabled: boolean): Promise<string | null> {
  try {
    const result = enabled ? await api.enableAgentPlugin(name) : await api.disableAgentPlugin(name);
    return result.ok === false ? "rejected by the server" : null;
  } catch (error) {
    return errorMessage(error);
  }
}

function withSetMember<T>(set: ReadonlySet<T>, items: readonly T[], present: boolean): Set<T> {
  const next = new Set(set);
  for (const item of items) {
    if (present) next.add(item);
    else next.delete(item);
  }
  return next;
}

export function useBktModules(notify: NotifyFn, strings: BktModulesPageStrings): BktModulesController {
  const [modules, setModules] = useState<BktModule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [busyCategories, setBusyCategories] = useState<ReadonlySet<string>>(() => new Set());

  const fetchSeq = useRef(0);
  const inflightMutations = useRef(0);
  const mutationEpoch = useRef(0);
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    const seq = ++fetchSeq.current;
    const epoch = mutationEpoch.current;
    api
      .getPluginsHub()
      .then((hub) => {
        if (seq !== fetchSeq.current) return;
        if (inflightMutations.current > 0 || epoch !== mutationEpoch.current) return;
        setModules(toBktModules(hub.plugins ?? []));
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (seq !== fetchSeq.current) return;
        setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (reconcileTimer.current !== null) clearTimeout(reconcileTimer.current);
      // Invalidate whatever is in flight: nothing may land after unmount.
      fetchSeq.current += 1;
    };
  }, [load]);

  const reload = useCallback(() => {
    setLoading(true);
    load();
  }, [load]);

  const beginMutation = useCallback(() => {
    inflightMutations.current += 1;
    mutationEpoch.current += 1;
  }, []);

  const endMutation = useCallback(() => {
    inflightMutations.current -= 1;
    mutationEpoch.current += 1;
    if (inflightMutations.current > 0) return;
    if (reconcileTimer.current !== null) clearTimeout(reconcileTimer.current);
    reconcileTimer.current = setTimeout(() => {
      reconcileTimer.current = null;
      load();
    }, RECONCILE_DELAY_MS);
  }, [load]);

  const setEnabledLocally = useCallback((names: readonly string[], enabled: boolean) => {
    const targets = new Set(names);
    setModules((current) =>
      current?.map((m) => (targets.has(m.name) ? { ...m, enabled } : m)) ?? current,
    );
  }, []);

  const toggleModule = useCallback(
    async (name: string, next: boolean) => {
      if (pending.has(name)) return;
      setPending((current) => withSetMember(current, [name], true));
      setEnabledLocally([name], next);
      beginMutation();
      try {
        const error = await setPluginEnabled(name, next);
        if (error !== null) {
          setEnabledLocally([name], !next);
          notify(strings.toggleFailed(name, error), "error");
        }
      } finally {
        setPending((current) => withSetMember(current, [name], false));
        endMutation();
      }
    },
    [pending, setEnabledLocally, beginMutation, endMutation, notify, strings],
  );

  const toggleCategory = useCallback(
    async (slug: string, names: readonly string[], next: boolean) => {
      if (busyCategories.has(slug) || names.length === 0) return;
      setBusyCategories((current) => withSetMember(current, [slug], true));
      setPending((current) => withSetMember(current, names, true));
      setEnabledLocally(names, next);
      beginMutation();
      const failures: string[] = [];
      try {
        // Sequential on purpose: each call rewrites config.yaml, and parallel writers would contend.
        for (const name of names) {
          const error = await setPluginEnabled(name, next);
          if (error !== null) {
            failures.push(name);
            setEnabledLocally([name], !next);
          }
        }
      } finally {
        setPending((current) => withSetMember(current, names, false));
        setBusyCategories((current) => withSetMember(current, [slug], false));
        endMutation();
      }
      if (failures.length > 0) {
        notify(strings.categoryPartialFailure(failures.length, names.length, failures.join(", ")), "error");
      } else {
        notify(strings.categoryUpdated(names.length, next), "success");
      }
    },
    [busyCategories, setEnabledLocally, beginMutation, endMutation, notify, strings],
  );

  return { modules, loading, loadError, pending, busyCategories, reload, toggleModule, toggleCategory };
}

/** Filter state kept in the URL query (`?q=&cat=&status=`) so a view can be shared. */
export function useBktModulesFilters(): [BktModulesFilters, (next: BktModulesFilters) => void] {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const setFilters = useCallback(
    (next: BktModulesFilters) => setParams(filtersToParams(next), { replace: true }),
    [setParams],
  );
  return [filters, setFilters];
}
