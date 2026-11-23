/**
 * Vietnamese strings for the DIA AI Console. The BKT audience reads Vietnamese only, so the
 * plugin carries one hard-coded table instead of the dashboard's locale system; module and
 * category names come from the catalog (`label_vi`).
 */
import type { DiaCategory, DiaStage, DiaStepKey, DiaStepStatus } from "./dia-api";

export const VI = {
  title: "Trung tâm DIA AI",
  headline: "Chạy các module DIA, kiểm tra dịch vụ truy vấn và xem các lần chạy gần đây.",
  overviewTab: "Tổng quan",
  sections: {
    modules: "Các module",
    recentRuns: "Lần chạy gần đây",
    monitoring: "Giám sát",
  },
  status: {
    endpointConfigured: "Đã cấu hình endpoint",
    endpointNotConfigured: "Chưa cấu hình endpoint",
    commonDisabled: "bkt-dia-common đang tắt; không thể chạy các module DIA.",
    enabled: "Đang bật",
    disabled: "Đang tắt",
    lastRun: "Lần chạy cuối",
    neverRun: "Chưa chạy lần nào",
    runOk: "Thành công",
    runFailed: "Thất bại",
  },
  health: {
    title: "Tình trạng dịch vụ truy vấn",
    status: "Trạng thái",
    documents: "Số tài liệu",
    latency: "Độ trễ",
    ok: "Hoạt động tốt",
    error: "Không khả dụng",
    checking: "Đang kiểm tra…",
    hint: "Gợi ý",
  },
  steps: {
    validate: "Kiểm tra tham số",
    build_question: "Tạo câu hỏi",
    query: "Truy vấn",
    result: "Kết quả",
  } satisfies Record<DiaStepKey, string>,
  stepStatus: {
    ok: "Xong",
    error: "Lỗi",
    skipped: "Bỏ qua",
    pending: "Đang chạy",
  } satisfies Record<DiaStepStatus | "pending", string>,
  stages: {
    validate: "Tham số không hợp lệ với công cụ này.",
    disabled: "Module này đang tắt. Hãy bật nó tại trang BKT Modules.",
    config: "Endpoint DIA chưa được cấu hình hoặc cấu hình không hợp lệ.",
    url_safety: "Endpoint DIA bị chính sách an toàn URL từ chối.",
    network: "Không kết nối được tới dịch vụ truy vấn DIA.",
    http: "Dịch vụ truy vấn DIA trả về mã lỗi.",
    response: "Dịch vụ truy vấn DIA trả về phản hồi không như mong đợi.",
  } satisfies Record<DiaStage, string>,
  result: {
    question: "Câu hỏi",
    answer: "Câu trả lời",
    type: "Loại",
    sources: "Nguồn tham khảo",
    showMoreSources: (count: number) => `Xem thêm ${count} nguồn`,
    showFewerSources: "Thu gọn",
  },
  form: {
    required: "Bắt buộc",
    requiredMissing: (field: string) => `Vui lòng nhập ${field}`,
    selectPlaceholder: "Chọn…",
  },
  recentRuns: {
    time: "Thời gian",
    module: "Module",
    tool: "Công cụ",
    source: "Nơi chạy",
    outcome: "Kết quả",
    duration: "Thời lượng",
    sourceAgent: "Agent",
    sourceConsole: "Bảng điều khiển",
  },
  monitoring: {
    name: "Tên",
    schedule: "Lịch chạy",
    state: "Trạng thái",
    lastRun: "Lần chạy cuối",
    active: "Đang hoạt động",
    paused: "Tạm dừng",
    viewOutput: "Xem kết quả",
  },
  empty: {
    allHidden: "Không có module DIA nào để hiển thị",
    allHiddenHint: "Tất cả module DIA đang bị ẩn hoặc chưa bật. Thay đổi tại trang BKT Modules.",
    noRuns: "Hồ sơ này chưa có lần chạy nào.",
    noMonitors: "Chưa có tác vụ giám sát nào dùng skill bkt-dia",
    noMonitorsHint: "Tạo bằng `hermes cron create` với skill risk-monitor.",
    noTools: "Module này không có công cụ nào.",
    noSources: "Không có nguồn nào được trả về.",
  },
  buttons: {
    run: "Chạy",
    running: "Đang chạy…",
    refresh: "Làm mới",
    retry: "Thử lại",
    openBktModules: "Mở trang BKT Modules",
  },
  disabledModuleHint: "Bật module này tại trang BKT Modules để chạy.",
  loadFailed: "Không tải được danh sách module DIA.",
  runFailed: (error: string) => `Chạy thất bại: ${error}`,
  lastUpdated: (time: string) => `Cập nhật lúc ${time}`,
  elapsed: (seconds: string) => `đã chạy ${seconds} giây`,
  durationMs: (ms: number) => `${ms} ms`,
} as const;

/** Tab label of a category: its Vietnamese catalog label, else English, else the raw slug. */
export function categoryLabel(slug: string, category: DiaCategory | null): string {
  return category?.label_vi || category?.label_en || slug;
}

const VI_LOCALE = "vi-VN";

/** Local date and time for an epoch-seconds timestamp. */
export function formatEpochSeconds(at: number): string {
  return new Date(at * 1000).toLocaleString(VI_LOCALE);
}

/** Local date and time for an ISO timestamp. */
export function formatIso(iso: string): string {
  return new Date(iso).toLocaleString(VI_LOCALE);
}

/** Local time of day for epoch milliseconds. */
export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(VI_LOCALE);
}
