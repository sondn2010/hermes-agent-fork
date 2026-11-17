/**
 * Strings for the DIA AI Console. Like BKT Modules, the dashboard has no Vietnamese
 * locale, so the Vietnamese labels the BKT audience reads live here and render next to
 * the active-locale text; module and category names come bilingual from the catalog.
 */
import { useI18n } from "@/i18n";
import { enDiaConsolePage } from "@/i18n/en";
import type { DiaConsolePageStrings } from "@/i18n/types";
import type { DiaCategory } from "@/lib/dia-console-api";

export const DIA_CONSOLE_VI = {
  headline: "Chạy các module DIA, kiểm tra dịch vụ truy vấn và xem các lần chạy gần đây.",
  tabs: {
    status: "Trạng thái",
    recentRuns: "Lần chạy gần đây",
    monitoring: "Giám sát",
  },
  allHiddenHint: "Tất cả module DIA đang bị ẩn hoặc chưa bật. Thay đổi tại trang BKT Modules.",
  disabledModuleHint: "Bật module này tại trang BKT Modules để chạy.",
  noMonitorsHint: "Tạo bằng `hermes cron create` với skill risk-monitor.",
} as const;

/** Active-locale page strings, English when the locale does not translate the page. */
export function useDiaConsoleStrings(): DiaConsolePageStrings {
  const { t } = useI18n();
  return t.diaConsolePage ?? enDiaConsolePage;
}

export interface DiaCategoryLabel {
  primary: string;
  vi: string | null;
}

/** Catalog label pair for a category tab; the raw slug when the catalog does not list it. */
export function diaCategoryLabel(slug: string, category: DiaCategory | null): DiaCategoryLabel {
  if (!category) return { primary: slug, vi: null };
  return { primary: category.label_en || slug, vi: category.label_vi || null };
}

/** Local wall-clock time for an epoch-seconds timestamp. */
export function formatEpochSeconds(at: number): string {
  return new Date(at * 1000).toLocaleString();
}
