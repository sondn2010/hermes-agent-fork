import { useLayoutEffect, useMemo } from "react";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { availableCategories, diaCommonInactive, groupModules } from "@/pages/bkt-modules/bkt-modules-grouping";
import { useBktModulesStrings } from "@/pages/bkt-modules/bkt-modules-i18n";
import { useBktModules, useBktModulesFilters } from "@/pages/bkt-modules/bkt-modules-store";
import { BktModulesFilterBar } from "@/pages/bkt-modules/bkt-modules-filter-bar";
import { BktModulesCategorySection } from "@/pages/bkt-modules/bkt-modules-category-section";
import { BktModulesBanner, BktModulesEmptyState, BktModulesLoadError } from "@/pages/bkt-modules/bkt-modules-notices";

/** `/bkt-modules`: show/hide `bkt-*` plugins by category (enable/disable apply to new sessions). */
export default function BktModulesPage() {
  const { t } = useI18n();
  const strings = useBktModulesStrings();
  const { toast, showToast } = useToast();
  const { setTitle } = usePageHeader();
  const controller = useBktModules(showToast, strings);
  const [filters, setFilters] = useBktModulesFilters();

  useLayoutEffect(() => {
    setTitle(strings.title);
    return () => setTitle(null);
  }, [setTitle, strings.title]);

  const modules = controller.modules;
  const groups = useMemo(() => (modules ? groupModules(modules, filters) : []), [modules, filters]);
  const categories = useMemo(() => (modules ? availableCategories(modules) : []), [modules]);
  const commonInactive = useMemo(() => (modules ? diaCommonInactive(modules) : false), [modules]);

  let body;
  if (modules === null) {
    body = controller.loadError ? (
      <BktModulesLoadError
        strings={strings}
        detail={controller.loadError}
        retryLabel={t.common.retry}
        onRetry={controller.reload}
      />
    ) : (
      <div className="flex justify-center py-10" aria-busy="true">
        <Spinner />
      </div>
    );
  } else if (modules.length === 0) {
    body = <BktModulesEmptyState strings={strings} />;
  } else {
    body = (
      <>
        <BktModulesFilterBar filters={filters} categories={categories} strings={strings} onChange={setFilters} />
        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{strings.noMatches}</p>
        ) : (
          groups.map((group) => (
            <BktModulesCategorySection
              key={group.slug}
              group={group}
              strings={strings}
              pending={controller.pending}
              busy={controller.busyCategories.has(group.slug)}
              diaCommonInactive={commonInactive}
              onToggleModule={controller.toggleModule}
              onToggleCategory={controller.toggleCategory}
            />
          ))
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{strings.headline}</p>
      <BktModulesBanner strings={strings} />
      {body}
      <Toast toast={toast} />
    </div>
  );
}
