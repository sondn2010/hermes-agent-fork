/**
 * `/dia`: the DIA AI Console. A "Tổng quan" sub-tab (health, module grid, recent runs,
 * monitoring), then one sub-tab per category that has visible modules. The active sub-tab
 * lives in `?tab=`.
 */
import { useEffect, useMemo } from "react";
import { ui } from "@bkt/shared/sdk";
import { BKT_MODULES_PATH, groupDiaModules } from "./dia-grouping";
import type { DiaModuleGroup } from "./dia-grouping";
import { RouteLink, Spinner } from "./dia-primitives";
import { VI, categoryLabel } from "./dia-strings";
import { useDiaConsole } from "./dia-store";
import type { DiaConsoleController } from "./dia-store";
import { OVERVIEW_TAB, resolveTab, useTabParam } from "./dia-tabs";
import { HealthCard } from "./health-card";
import { ModuleGrid } from "./module-grid";
import { ModulePanel } from "./module-panel";
import { Monitoring } from "./monitoring";
import { RecentRuns } from "./recent-runs";

interface ViewProps {
  controller: DiaConsoleController;
  groups: readonly DiaModuleGroup[];
}

function OverviewView({ controller, groups }: ViewProps) {
  const modules = controller.catalog.data?.modules;
  return (
    <div className="bkt-col bkt-dia-stack">
      <HealthCard
        health={controller.health}
        endpointConfigured={modules?.endpoint_configured ?? null}
        commonEnabled={modules?.common_enabled ?? null}
      />
      <section className="bkt-col">
        <h2 className="bkt-dia-section">{VI.sections.modules}</h2>
        <ModuleGrid groups={groups} runs={controller.runs.data ?? []} />
      </section>
      <section className="bkt-col">
        <h2 className="bkt-dia-section">{VI.sections.recentRuns}</h2>
        <RecentRuns runs={controller.runs} />
      </section>
      <section className="bkt-col">
        <h2 className="bkt-dia-section">{VI.sections.monitoring}</h2>
        <Monitoring monitors={controller.monitors} />
      </section>
    </div>
  );
}

function CategoryView({ controller, group }: { controller: DiaConsoleController; group: DiaModuleGroup }) {
  return (
    <div className="bkt-col bkt-dia-stack" data-category={group.slug}>
      {group.modules.map((module) => (
        <ModulePanel key={module.name} module={module} results={controller.results} onRun={(name, tool, args) => void controller.run(name, tool, args)} />
      ))}
    </div>
  );
}

function AllHiddenState() {
  return (
    <div className="bkt-dia-empty" data-testid="dia-empty">
      <p>
        <strong>{VI.empty.allHidden}</strong>
      </p>
      <p className="bkt-muted">{VI.empty.allHiddenHint}</p>
      <RouteLink to={BKT_MODULES_PATH}>{VI.buttons.openBktModules}</RouteLink>
    </div>
  );
}

function ConsoleTabs({ controller, groups }: ViewProps) {
  const TabsList = ui("TabsList");
  const TabsTrigger = ui("TabsTrigger");
  const [requested, select] = useTabParam();
  const tabs = useMemo(
    () => [{ slug: OVERVIEW_TAB, label: VI.overviewTab }, ...groups.map((g) => ({ slug: g.slug, label: categoryLabel(g.slug, g.category) }))],
    [groups],
  );
  // A category can vanish on reload (hidden or emptied), or the slug be unknown: fall back to the overview.
  const active = resolveTab(requested, tabs.map((t) => t.slug));
  // Drop a stale or unknown ?tab= once the fallback has happened, so the URL matches the view.
  useEffect(() => {
    if (requested !== null && requested !== active) select(active);
  }, [requested, active, select]);
  const group = groups.find((g) => g.slug === active);

  return (
    <div className="bkt-col bkt-dia-stack">
      <div className="bkt-dia-scroll">
        <TabsList role="tablist" aria-label={VI.title}>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.slug} value={tab.slug} role="tab" active={tab.slug === active} aria-selected={tab.slug === active} onClick={() => select(tab.slug)}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div role="tabpanel">{group ? <CategoryView controller={controller} group={group} /> : <OverviewView controller={controller} groups={groups} />}</div>
    </div>
  );
}

export function DiaConsole() {
  const Button = ui("Button");
  const controller = useDiaConsole();
  const { catalog, visibleModules } = controller;
  const groups = useMemo(
    () => groupDiaModules(visibleModules, catalog.data?.modules.categories ?? []),
    [visibleModules, catalog.data],
  );

  let body;
  if (catalog.data === null) {
    body = catalog.error ? (
      <div role="alert" className="bkt-row bkt-dia-failure">
        <span>
          {VI.loadFailed} <span className="bkt-muted">{catalog.error}</span>
        </span>
        <Button size="sm" outlined onClick={catalog.reload}>
          {VI.buttons.retry}
        </Button>
      </div>
    ) : (
      <div className="bkt-dia-loading" aria-busy="true">
        <Spinner label={VI.health.checking} />
      </div>
    );
  } else if (visibleModules.length === 0) {
    body = <AllHiddenState />;
  } else {
    body = <ConsoleTabs controller={controller} groups={groups} />;
  }

  return (
    <div className="bkt-page bkt-dia" lang="vi">
      <header className="bkt-col">
        <h1 className="bkt-dia-title">{VI.title}</h1>
        <p className="bkt-muted">{VI.headline}</p>
      </header>
      {body}
    </div>
  );
}
