/**
 * Page-local state for the DIA AI Console: the module catalog filtered by the hub's
 * Show UI flags, the query-service health, the run log, and per-tool run results.
 * Catalog, health and runs load in parallel; each is newest-fetch-wins.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  getDiaHealth,
  getDiaModules,
  getDiaRuns,
  runDiaTool,
  type DiaHealthResponse,
  type DiaModule,
  type DiaModulesResponse,
  type DiaRunLogEntry,
  type DiaRunResponse,
  type DiaToolArguments,
} from "@/lib/dia-console-api";
import { hiddenPluginNames, visibleDiaModules } from "./dia-console-grouping";
import { errorMessage, useNewestFetch, type NewestFetch } from "./dia-console-newest-fetch";

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
  refreshHealth: () => void;
  runs: NewestFetch<DiaRunLogEntry[]>;
  results: Readonly<Record<string, DiaToolRunState>>;
  run: (module: string, tool: string, args: DiaToolArguments) => Promise<void>;
}

/** Key of one tool's result slot. */
export function toolRunKey(module: string, tool: string): string {
  return `${module}\u0000${tool}`;
}

// A hidden module must never render, so the catalog only loads with the hub's flags.
async function loadCatalog(): Promise<DiaCatalog> {
  const [modules, hub] = await Promise.all([getDiaModules(), api.getPluginsHub()]);
  return { modules, hidden: hiddenPluginNames(hub.plugins ?? []) };
}

async function loadRuns(): Promise<DiaRunLogEntry[]> {
  return (await getDiaRuns()).runs ?? [];
}

export function useDiaConsole(): DiaConsoleController {
  const catalog = useNewestFetch(loadCatalog);
  const health = useNewestFetch(getDiaHealth);
  const runs = useNewestFetch(loadRuns);
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

  return { catalog, visibleModules, health, refreshHealth: health.reload, runs, results, run };
}
