/**
 * Strings for the BKT Modules page. The dashboard has no Vietnamese locale, so the
 * Vietnamese labels the BKT audience reads live here as component-level constants and
 * render next to the active-locale text (bilingual), instead of a `vi` key set every
 * other locale file would have to type-check against.
 */
import { useI18n } from "@/i18n";
import { enBktModulesPage } from "@/i18n/en";
import type { BktModulesPageStrings } from "@/i18n/types";
import {
  BKT_DIA_COMMON,
  DASHBOARD_TABS_CATEGORY,
  isKnownCategory,
  titleCaseSlug,
  UNCATEGORIZED,
  type BktModule,
} from "./bkt-modules-grouping";

type CategoryLabelKey = keyof BktModulesPageStrings["categories"];

export const BKT_CATEGORY_LABELS_VI: Record<CategoryLabelKey, string> = {
  shared: "Thành phần dùng chung",
  "knowledge-rag": "Tri thức & RAG",
  "assistant-channels": "Trợ lý & kênh hội thoại",
  "domain-lookup": "Tra cứu nghiệp vụ",
  "analysis-forecast": "Phân tích & dự báo",
  "decision-support": "Hỗ trợ ra quyết định",
  "monitoring-personalization": "Giám sát & cá nhân hóa",
  uncategorized: "Chưa phân loại",
};

export const BKT_BANNER_VI = {
  sessions: "Thay đổi áp dụng cho phiên mới.",
  common: "Luôn bật bkt-dia-common: mọi module DIA đều phụ thuộc vào nó.",
} as const;

/** Vietnamese labels for the Show UI controls (rendered next to the active-locale text). */
export const BKT_UI_VI = {
  showUi: "Hiện giao diện",
  dashboardTabsGroup: "Thẻ trên bảng điều khiển",
  refreshNotice: "Thay đổi hiển thị giao diện có hiệu lực sau khi tải lại bảng điều khiển.",
  diaConsoleRow: "Bảng điều khiển DIA AI",
  headerLogoRow: "Logo đầu trang",
  creditLineRow: "Dòng ghi công",
} as const;

type RowLabelKey = "diaConsoleRow" | "headerLogoRow" | "creditLineRow";

/** Rows whose name alone does not say what hiding them removes. */
const ROW_LABEL_KEYS: Readonly<Record<string, RowLabelKey>> = {
  [BKT_DIA_COMMON]: "diaConsoleRow",
  "bkt-brand": "headerLogoRow",
  "bkt-author": "creditLineRow",
};

export interface RowLabel {
  primary: string;
  vi: string | null;
}

/** Human label shown before a row's plugin name: the fixed label for special rows, else the manifest label. */
export function rowLabel(module: Pick<BktModule, "name" | "uiLabel">, strings: BktModulesPageStrings): RowLabel | null {
  const key = Object.hasOwn(ROW_LABEL_KEYS, module.name) ? ROW_LABEL_KEYS[module.name] : undefined;
  if (key !== undefined) return { primary: strings[key], vi: BKT_UI_VI[key] };
  return module.uiLabel ? { primary: module.uiLabel, vi: null } : null;
}

/** Active-locale page strings, English when the locale does not translate the page. */
export function useBktModulesStrings(): BktModulesPageStrings {
  const { t } = useI18n();
  return t.bktModulesPage ?? enBktModulesPage;
}

function labelKey(slug: string): CategoryLabelKey | null {
  if (slug === UNCATEGORIZED) return UNCATEGORIZED;
  return isKnownCategory(slug) ? slug : null;
}

export interface CategoryLabel {
  primary: string;
  /** Vietnamese label for known categories; `null` for slugs only known by their tag. */
  vi: string | null;
}

/** Translated label for the 7 known slugs (+ uncategorized, dashboard tabs); title-cased slug otherwise. */
export function categoryLabel(slug: string, strings: BktModulesPageStrings): CategoryLabel {
  if (slug === DASHBOARD_TABS_CATEGORY) return { primary: strings.dashboardTabsGroup, vi: BKT_UI_VI.dashboardTabsGroup };
  const key = labelKey(slug);
  if (key === null) return { primary: titleCaseSlug(slug), vi: null };
  return { primary: strings.categories[key], vi: BKT_CATEGORY_LABELS_VI[key] };
}
