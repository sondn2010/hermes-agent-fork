import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { PackageOpen } from "lucide-react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Segmented } from "@nous-research/ui/ui/components/segmented";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { useI18n } from "@/i18n";
import type { DiaConsolePageStrings } from "@/i18n/types";
import { usePageHeader } from "@/contexts/usePageHeader";
import { BKT_MODULES_PATH, groupDiaModules, type DiaModuleGroup } from "@/pages/dia-console/dia-console-grouping";
import { DIA_CONSOLE_VI, diaCategoryLabel, useDiaConsoleStrings } from "@/pages/dia-console/dia-console-i18n";
import { useDiaConsole, type DiaConsoleController } from "@/pages/dia-console/dia-console-store";
import { DiaHealthCard } from "@/pages/dia-console/dia-console-health-card";
import { DiaModuleGrid } from "@/pages/dia-console/dia-console-module-grid";
import { DiaModulePanel } from "@/pages/dia-console/dia-console-module-panel";
import { DiaRecentRuns } from "@/pages/dia-console/dia-console-recent-runs";
import { DiaMonitoring } from "@/pages/dia-console/dia-console-monitoring";

const STATUS_TAB = "status";
const RUNS_TAB = "runs";
const MONITORING_TAB = "monitoring";
const CATEGORY_TAB_PREFIX = "category:";

interface TabViewProps {
  controller: DiaConsoleController;
  groups: readonly DiaModuleGroup[];
  strings: DiaConsolePageStrings;
}

function StatusView({ controller, groups, strings }: TabViewProps) {
  const modules = controller.catalog.data?.modules;
  return (
    <div className="flex flex-col gap-4">
      <DiaHealthCard
        health={controller.health}
        endpointConfigured={modules?.endpoint_configured ?? null}
        commonEnabled={modules?.common_enabled ?? null}
        strings={strings}
      />
      <DiaModuleGrid groups={groups} runs={controller.runs.data ?? []} strings={strings} />
    </div>
  );
}

function CategoryView({ controller, group, strings }: Omit<TabViewProps, "groups"> & { group: DiaModuleGroup }) {
  return (
    <div className="flex flex-col gap-4" data-category={group.slug}>
      {group.modules.map((module) => (
        <DiaModulePanel
          key={module.name}
          module={module}
          results={controller.results}
          strings={strings}
          onRun={(name, tool, args) => void controller.run(name, tool, args)}
        />
      ))}
    </div>
  );
}

/** Fixed tabs render from this table; category tabs are added between Status and Recent runs. */
const FIXED_VIEWS: Record<string, (props: TabViewProps) => ReactNode> = {
  [STATUS_TAB]: StatusView,
  [RUNS_TAB]: ({ controller, strings }) => <DiaRecentRuns runs={controller.runs} strings={strings} />,
  [MONITORING_TAB]: ({ strings }) => <DiaMonitoring strings={strings} />,
};

function AllHiddenState({ strings }: { strings: DiaConsolePageStrings }) {
  return (
    <div className="flex flex-col items-center gap-2 border border-dashed border-border px-6 py-10 text-center" data-testid="dia-empty">
      <PackageOpen aria-hidden className="h-8 w-8 text-muted-foreground" />
      <p className="font-medium">{strings.empty.allHidden}</p>
      <p className="text-sm text-muted-foreground">{strings.empty.allHiddenHint}</p>
      <p lang="vi" className="text-xs text-muted-foreground">
        {DIA_CONSOLE_VI.allHiddenHint}
      </p>
      <Link to={BKT_MODULES_PATH} className="text-sm underline">
        {strings.buttons.openBktModules}
      </Link>
    </div>
  );
}

function ConsoleTabs({ controller, groups, strings }: TabViewProps) {
  const [tab, setTab] = useState(STATUS_TAB);
  const options = useMemo(
    () => [
      { value: STATUS_TAB, label: strings.tabs.status },
      ...groups.map((g) => ({ value: CATEGORY_TAB_PREFIX + g.slug, label: diaCategoryLabel(g.slug, g.category).primary })),
      { value: RUNS_TAB, label: strings.tabs.recentRuns },
      { value: MONITORING_TAB, label: strings.tabs.monitoring },
    ],
    [groups, strings],
  );
  // A category can vanish on reload (hidden or emptied); fall back to Status.
  const active = options.some((o) => o.value === tab) ? tab : STATUS_TAB;
  const group = groups.find((g) => CATEGORY_TAB_PREFIX + g.slug === active);
  const FixedView = FIXED_VIEWS[active];

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <Segmented value={active} onChange={setTab} options={options} />
      </div>
      {group ? (
        <CategoryView controller={controller} group={group} strings={strings} />
      ) : FixedView ? (
        <FixedView controller={controller} groups={groups} strings={strings} />
      ) : null}
    </div>
  );
}

/** `/dia`: DIA AI Console. Status, a tab per category with visible modules, recent runs, monitoring. */
export default function DiaConsolePage() {
  const { t } = useI18n();
  const strings = useDiaConsoleStrings();
  const { setTitle } = usePageHeader();
  const controller = useDiaConsole();
  const { catalog, visibleModules } = controller;

  useLayoutEffect(() => {
    setTitle(strings.title);
    return () => setTitle(null);
  }, [setTitle, strings.title]);

  const groups = useMemo(
    () => groupDiaModules(visibleModules, catalog.data?.modules.categories ?? []),
    [visibleModules, catalog.data],
  );

  let body;
  if (catalog.data === null) {
    body = catalog.error ? (
      <div role="alert" className="flex flex-wrap items-center gap-3 border border-destructive/50 px-4 py-3 text-sm">
        <span>
          {strings.loadFailed} <span className="text-muted-foreground">{catalog.error}</span>
        </span>
        <Button size="sm" outlined onClick={catalog.reload}>
          {t.common.retry}
        </Button>
      </div>
    ) : (
      <div className="flex justify-center py-10" aria-busy="true">
        <Spinner />
      </div>
    );
  } else if (visibleModules.length === 0) {
    body = <AllHiddenState strings={strings} />;
  } else {
    body = <ConsoleTabs controller={controller} groups={groups} strings={strings} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-muted-foreground">{strings.headline}</p>
        <p lang="vi" className="text-xs text-muted-foreground">
          {DIA_CONSOLE_VI.headline}
        </p>
      </div>
      {body}
    </div>
  );
}
