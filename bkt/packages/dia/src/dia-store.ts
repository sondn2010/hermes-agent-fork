/**
 * Page-local state for the DIA AI Console: the module catalog filtered by the hub's
 * Show UI flags, the query-service health, the run log, and per-tool run results.
 * Catalog, health and runs load in parallel; each is newest-fetch-wins.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "@bkt/shared/api";
import {
  getDiaHealth,
  getDiaModules,
  getDiaRuns,
  getHubPlugins,
  runDiaTool,
} from "./dia-api";
import type {
  DiaHealthResponse,
  DiaModule,
  DiaModulesResponse,
  DiaRunLogEntry,
  DiaRunResponse,
  DiaToolArguments,
} from "./dia-api";
import { hiddenPluginNames, visibleDiaModules } from "./dia-grouping";
import { loadMonitors } from "./dia-monitors";
import type { MonitorRow } from "./dia-monitors";
import { useNewestFetch } from "./dia-newest-fetch";
import type { NewestFetch } from "./dia-newest-fetch";

export interface DiaCatalog {
  modules: DiaModulesResponse;
  /** Plugin names hidden with Show UI. */
  hidden: ReadonlySet<string>;
}

export interface DiaToolRunState {
  pending: boolean;
  /** Epoch milliseconds the run started; drives the elapsed timer. */
  startedAt: number;
  response: DiaRunResponse | null;
  /** Transport failure (non-2xx, network); a DIA failure arrives as `response.ok === false`. */
  error: string | null;
}

export interface DiaConsoleController {
  catalog: NewestFetch<DiaCatalog>;
  /** Modules whose UI is not hidden, in catalog order; `[]` until the catalog loads. */
  visibleModules: DiaModule[];
  health: NewestFetch<DiaHealthResponse>;
  runs: NewestFetch<DiaRunLogEntry[]>;
  /** Loaded once per page, not on every return to the overview: it costs 1 + N cron requests. */
  monitors: NewestFetch<MonitorRow[]>;
  results: Readonly<Record<string, DiaToolRunState>>;
  run: (module: string, tool: string, args: DiaToolArguments) => Promise<void>;
}

/** Key of one tool's result slot. */
export function toolRunKey(module: string, tool: string): string {
  return `${module}\u0000${tool}`;
}

// A hidden module must never render, so the catalog only loads with the hub's flags.
async function loadCatalog(): Promise<DiaCatalog> {
  const [modules, hub] = await Promise.all([getDiaModules(), getHubPlugins()]);
  return { modules, hidden: hiddenPluginNames(hub) };
}

const loadRuns = () => getDiaRuns();

export function useDiaConsole(): DiaConsoleController {
  const catalog = useNewestFetch(loadCatalog);
  const health = useNewestFetch(getDiaHealth);
  const runs = useNewestFetch(loadRuns);
  const monitors = useNewestFetch(loadMonitors);
  const [results, setResults] = useState<Record<string, DiaToolRunState>>({});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const visibleModules = useMemo(
    () => (catalog.data ? visibleDiaModules(catalog.data.modules.modules ?? [], catalog.data.hidden) : []),
    [catalog.data],
  );

  const run = useCallback(async (module: string, tool: string, args: DiaToolArguments) => {
    const key = toolRunKey(module, tool);
    const settle = (patch: Partial<DiaToolRunState>) => {
      if (!mounted.current) return;
      setResults((current) => ({ ...current, [key]: { ...current[key], ...patch, pending: false } }));
    };
    setResults((current) => ({
      ...current,
      [key]: { pending: true, startedAt: Date.now(), response: null, error: null },
    }));
    try {
      settle({ response: await runDiaTool(module, tool, args) });
    } catch (error) {
      settle({ error: errorMessage(error) });
    }
  }, []);

  return { catalog, visibleModules, health, runs, monitors, results, run };
}
