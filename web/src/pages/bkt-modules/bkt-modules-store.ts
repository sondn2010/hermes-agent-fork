/**
 * Page-local state for BKT Modules: the hub-derived rows with two optimistic switches per
 * row (agent Enabled, Show UI), and the URL-backed filter state.
 *
 * Sequencing invariant: a hub response is applied only if it is the newest fetch AND no
 * toggle started or settled while it was in flight. Toggles flip the row immediately,
 * roll back on failure, and once the last one settles a single debounced refetch
 * reconciles with the server — so a stale hub payload (or the server's short hub cache)
 * can never overwrite optimistic state. Both switches share that machinery; each keeps
 * its own pending set so one in-flight write never locks the other switch of a row.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useSearchParams } from "react-router";
import { api } from "@/lib/api";
import type { BktModulesPageStrings } from "@/i18n/types";
import { filtersToParams, parseFilters, type BktModule, type BktModulesFilters } from "./bkt-modules-grouping";
import { hubToBktModules } from "./bkt-modules-hub-rows";
import { errorMessage, requestPluginEnabled, requestPluginUiShown, withSetMember } from "./bkt-modules-requests";

export type NotifyFn = (message: string, type: "error" | "success") => void;

export interface BktModulesController {
  /** `null` until the first successful load. */
  modules: BktModule[] | null;
  loading: boolean;
  loadError: string | null;
  /** Module names with an Enabled request in flight. */
  pending: ReadonlySet<string>;
  /** Module names with a Show UI request in flight. */
  uiPending: ReadonlySet<string>;
  /** Category slugs whose bulk toggle (either switch) is in flight. */
  busyCategories: ReadonlySet<string>;
  /** A Show UI change was saved; it takes effect after a dashboard reload. */
  visibilityChanged: boolean;
  reload: () => void;
  toggleModule: (name: string, next: boolean) => Promise<void>;
  toggleCategory: (slug: string, names: readonly string[], next: boolean) => Promise<void>;
  setShowUi: (name: string, show: boolean) => Promise<void>;
  toggleCategoryUi: (slug: string, names: readonly string[], show: boolean) => Promise<void>;
}

/** Delay before the reconciling refetch, so a burst of toggles costs one hub read. */
export const RECONCILE_DELAY_MS = 300;

type ToggleField = "enabled" | "ui";

/** How each switch changes a row locally and on the server. */
const FIELD_APPLY: Record<ToggleField, (module: BktModule, value: boolean) => BktModule> = {
  enabled: (module, value) => ({ ...module, enabled: value }),
  ui: (module, value) => ({ ...module, uiHidden: !value }),
};

const FIELD_REQUEST: Record<ToggleField, (name: string, value: boolean) => Promise<string | null>> = {
  enabled: requestPluginEnabled,
  ui: requestPluginUiShown,
};

interface FieldState {
  pending: ReadonlySet<string>;
  setPending: Dispatch<SetStateAction<ReadonlySet<string>>>;
  failed: (name: string, error: string) => string;
  /** Called once per user action in which at least one write succeeded; `null` for none. */
  succeeded: (() => void) | null;
  /** Toast after a fully successful bulk toggle; `null` for none. */
  bulkMessage: ((count: number, value: boolean) => string) | null;
}

export function useBktModules(notify: NotifyFn, strings: BktModulesPageStrings): BktModulesController {
  const [modules, setModules] = useState<BktModule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [uiPending, setUiPending] = useState<ReadonlySet<string>>(() => new Set());
  const [busyCategories, setBusyCategories] = useState<ReadonlySet<string>>(() => new Set());
  const [visibilityChanged, setVisibilityChanged] = useState(false);

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
        setModules(hubToBktModules(hub));
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

  const fields = useMemo<Record<ToggleField, FieldState>>(
    () => ({
      enabled: {
        pending,
        setPending,
        failed: strings.toggleFailed,
        succeeded: null,
        bulkMessage: strings.categoryUpdated,
      },
      ui: {
        pending: uiPending,
        setPending: setUiPending,
        failed: strings.showUiFailed,
        succeeded: () => setVisibilityChanged(true),
        bulkMessage: null,
      },
    }),
    [pending, uiPending, strings],
  );

  const applyLocally = useCallback((field: ToggleField, names: readonly string[], value: boolean) => {
    const targets = new Set(names);
    const apply = FIELD_APPLY[field];
    setModules((current) => current?.map((m) => (targets.has(m.name) ? apply(m, value) : m)) ?? current);
  }, []);

  const toggleOne = useCallback(
    async (field: ToggleField, name: string, value: boolean) => {
      const state = fields[field];
      if (state.pending.has(name)) return;
      state.setPending((current) => withSetMember(current, [name], true));
      applyLocally(field, [name], value);
      beginMutation();
      try {
        const error = await FIELD_REQUEST[field](name, value);
        if (error !== null) {
          applyLocally(field, [name], !value);
          notify(state.failed(name, error), "error");
        } else {
          state.succeeded?.();
        }
      } finally {
        state.setPending((current) => withSetMember(current, [name], false));
        endMutation();
      }
    },
    [fields, applyLocally, beginMutation, endMutation, notify],
  );

  const toggleMany = useCallback(
    async (field: ToggleField, slug: string, names: readonly string[], value: boolean) => {
      if (busyCategories.has(slug) || names.length === 0) return;
      const state = fields[field];
      setBusyCategories((current) => withSetMember(current, [slug], true));
      state.setPending((current) => withSetMember(current, names, true));
      applyLocally(field, names, value);
      beginMutation();
      const failures: string[] = [];
      try {
        // Sequential on purpose: each call rewrites config.yaml, and parallel writers would contend.
        for (const name of names) {
          const error = await FIELD_REQUEST[field](name, value);
          if (error !== null) {
            failures.push(name);
            applyLocally(field, [name], !value);
          }
        }
      } finally {
        state.setPending((current) => withSetMember(current, names, false));
        setBusyCategories((current) => withSetMember(current, [slug], false));
        endMutation();
      }
      if (failures.length < names.length) state.succeeded?.();
      if (failures.length > 0) {
        notify(strings.categoryPartialFailure(failures.length, names.length, failures.join(", ")), "error");
      } else if (state.bulkMessage !== null) {
        notify(state.bulkMessage(names.length, value), "success");
      }
    },
    [busyCategories, fields, applyLocally, beginMutation, endMutation, notify, strings],
  );

  const toggleModule = useCallback((name: string, next: boolean) => toggleOne("enabled", name, next), [toggleOne]);
  const setShowUi = useCallback((name: string, show: boolean) => toggleOne("ui", name, show), [toggleOne]);
  const toggleCategory = useCallback(
    (slug: string, names: readonly string[], next: boolean) => toggleMany("enabled", slug, names, next),
    [toggleMany],
  );
  const toggleCategoryUi = useCallback(
    (slug: string, names: readonly string[], show: boolean) => toggleMany("ui", slug, names, show),
    [toggleMany],
  );

  return {
    modules,
    loading,
    loadError,
    pending,
    uiPending,
    busyCategories,
    visibilityChanged,
    reload,
    toggleModule,
    toggleCategory,
    setShowUi,
    toggleCategoryUi,
  };
}

/** Filter state kept in the URL query (`?q=&cat=&status=&ui=`) so a view can be shared. */
export function useBktModulesFilters(): [BktModulesFilters, (next: BktModulesFilters) => void] {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const setFilters = useCallback(
    (next: BktModulesFilters) => setParams(filtersToParams(next), { replace: true }),
    [setParams],
  );
  return [filters, setFilters];
}
