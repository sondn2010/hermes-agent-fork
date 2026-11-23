import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { CronJob, DiaModule, DiaModulesResponse, DiaRunResponse } from "./dia-api";
import { DiaConsole } from "./DiaConsole";
import { installSdk } from "./test-sdk-stub";
import type { StubSdk } from "./test-sdk-stub";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The profile the host loaded this bundle for; every request must name it.
vi.mock("@bkt/shared/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bkt/shared/sdk")>()),
  bundleProfile: () => "work",
}));

const PLUGIN = "/api/plugins/bkt-dia-common";

function diaModule(name: string, category: string, enabled = true): DiaModule {
  return {
    name,
    category,
    enabled,
    function_code: `FC-${name}`,
    title: `Title ${name}`,
    description: `${name} description`,
    emoji: "",
    tools: [
      {
        name: `${name.replace(/-/g, "_")}_ask`,
        description: "Ask",
        parameters: {
          type: "object",
          properties: { tax_code: { type: "string", description: "Tax code" }, year: { type: "integer" } },
          required: ["tax_code"],
        },
      },
    ],
  };
}

const MODULES: DiaModulesResponse = {
  common_enabled: true,
  endpoint_configured: true,
  categories: [
    { slug: "shared", label_vi: "Thành phần dùng chung", label_en: "Shared foundation" },
    { slug: "domain-lookup", label_vi: "Tra cứu nghiệp vụ", label_en: "Domain lookup" },
    { slug: "analysis-forecast", label_vi: "Phân tích & dự báo", label_en: "Analysis & forecast" },
    { slug: "decision-support", label_vi: "Hỗ trợ ra quyết định", label_en: "Decision support" },
  ],
  modules: [
    diaModule("bkt-dia-enterprise-profile", "domain-lookup"),
    diaModule("bkt-dia-finance-tax", "domain-lookup", false),
    diaModule("bkt-dia-forecast", "analysis-forecast"),
    diaModule("bkt-dia-hidden", "decision-support"),
  ],
};

const OK_RUN: DiaRunResponse = {
  ok: true,
  function_code: "FC-bkt-dia-enterprise-profile",
  steps: [
    { key: "validate", status: "ok", ms: 1 },
    { key: "build_question", status: "ok", ms: 2 },
    { key: "query", status: "ok", ms: 40 },
    { key: "result", status: "ok", ms: 3 },
  ],
  question: "Profile of 0101",
  answer: "**Company A** is active.",
  type: "profile",
  sources: Array.from({ length: 7 }, (_, i) => ({ title: `Doc ${i}`, score: 0.5 })),
};

let sdk: StubSdk;
let container: HTMLDivElement;
let root: Root;
let hidden: string[];
let cronJobs: CronJob[];

async function flush(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function waitFor(cond: () => boolean, timeoutMs = 4000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: condition never became true");
    await flush(20);
  }
}

async function renderPage() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<DiaConsole />));
}

const text = () => document.body.textContent ?? "";

function click(el: Element | null | undefined) {
  if (!el) throw new Error("element not rendered");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
}

const tab = (label: string) => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.trim() === label);
const button = (label: string, scope: ParentNode = document) =>
  [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);

async function openTab(label: string) {
  await waitFor(() => tab(label) !== undefined);
  click(tab(label));
  await flush();
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const toolForm = () => document.querySelector<HTMLFormElement>('form[aria-label="bkt_dia_enterprise_profile_ask"]');
const fieldInput = (name: string) => toolForm()?.querySelector<HTMLInputElement>(`[data-field="${name}"] input`) ?? null;
const runButton = () => toolForm()?.querySelector<HTMLButtonElement>('button[type="submit"]') ?? null;
const runCalls = () => sdk.calls.filter((c) => c.url.pathname === `${PLUGIN}/run`);

beforeEach(() => {
  window.history.replaceState(null, "", "/dia");
  hidden = ["bkt-dia-hidden"];
  cronJobs = [];
  sdk = installSdk();
  sdk.routes.set(`${PLUGIN}/modules`, () => MODULES);
  sdk.routes.set(`${PLUGIN}/health`, () => ({ ok: true, status: "green", total_documents: 1234, latency_ms: 12 }));
  sdk.routes.set(`${PLUGIN}/runs`, () => ({ runs: [] }));
  sdk.routes.set(`${PLUGIN}/run`, () => OK_RUN);
  sdk.routes.set("/api/dashboard/plugins/hub", () => ({
    plugins: MODULES.modules.map((m) => ({ name: m.name, user_hidden: hidden.includes(m.name) })),
  }));
  sdk.routes.set("/api/cron/jobs", () => cronJobs);
  sdk.routes.set("/api/cron/jobs/j1/runs", () => ({ runs: [{ id: "cron_j1_1", started_at: 1, source: "cron" }] }));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

describe("DiaConsole", () => {
  it("opens on Tổng quan with a sub-tab per category that has visible modules", async () => {
    await renderPage();
    await waitFor(() => tab("Tra cứu nghiệp vụ") !== undefined);

    expect(tab("Tổng quan")?.getAttribute("aria-selected")).toBe("true");
    expect(tab("Phân tích & dự báo")).toBeDefined();
    // The only decision-support module is hidden and shared has none, so neither gets a tab.
    expect(tab("Hỗ trợ ra quyết định")).toBeUndefined();
    expect(tab("Thành phần dùng chung")).toBeUndefined();
    expect(document.querySelector('[data-module="bkt-dia-hidden"]')).toBeNull();
    expect(document.querySelector('[data-module="bkt-dia-forecast"]')).not.toBeNull();
    await waitFor(() => text().includes("1234"));
    expect(text()).toContain("Đã cấu hình endpoint");
  });

  it("keeps the sub-tab in ?tab= and reopens it on reload", async () => {
    await renderPage();
    await openTab("Tra cứu nghiệp vụ");
    expect(new URLSearchParams(window.location.search).get("tab")).toBe("domain-lookup");
    expect(window.location.pathname).toBe("/dia");

    await act(async () => root.unmount());
    await renderPage();
    await waitFor(() => toolForm() !== null);
    expect(tab("Tra cứu nghiệp vụ")?.getAttribute("aria-selected")).toBe("true");
  });

  it("falls back to Tổng quan for an unknown ?tab=", async () => {
    window.history.replaceState(null, "", "/dia?tab=khong-co");
    await renderPage();
    await waitFor(() => tab("Tổng quan") !== undefined);
    expect(tab("Tổng quan")?.getAttribute("aria-selected")).toBe("true");
    await waitFor(() => window.location.search === "");
  });

  it("scopes every request, including runs and cron reads, to the bundle's profile", async () => {
    cronJobs = [{ id: "j1", name: "Risk watch", enabled: true, skills: ["bkt-dia-risk-monitor"] }];
    await renderPage();
    await waitFor(() => text().includes("Risk watch"));
    await openTab("Tra cứu nghiệp vụ");
    typeInto(fieldInput("tax_code")!, "0101");
    click(runButton());
    await waitFor(() => text().includes("Company A"));

    const paths = new Set(sdk.calls.map((c) => c.url.pathname));
    for (const path of [`${PLUGIN}/modules`, `${PLUGIN}/health`, `${PLUGIN}/runs`, `${PLUGIN}/run`, "/api/dashboard/plugins/hub", "/api/cron/jobs", "/api/cron/jobs/j1/runs"]) {
      expect(paths).toContain(path);
    }
    expect(sdk.calls.filter((c) => c.url.searchParams.getAll("profile").join() !== "work").map((c) => c.url.pathname)).toEqual([]);
  });

  it("loads monitoring once per page, not on every return to Tổng quan", async () => {
    await renderPage();
    await openTab("Tra cứu nghiệp vụ");
    await openTab("Tổng quan");
    await openTab("Phân tích & dự báo");
    await openTab("Tổng quan");
    expect(sdk.calls.filter((c) => c.url.pathname === "/api/cron/jobs")).toHaveLength(1);
  });

  it("shows a disabled module with a BKT Modules link and no form", async () => {
    await renderPage();
    await openTab("Tra cứu nghiệp vụ");

    const panel = document.querySelector('[data-module="bkt-dia-finance-tax"]');
    expect(panel?.querySelector("form")).toBeNull();
    expect(panel?.querySelector('a[href="/bkt-modules"]')).not.toBeNull();
    expect(toolForm()).not.toBeNull();
  });

  it("blocks submit while a required field is empty", async () => {
    await renderPage();
    await openTab("Tra cứu nghiệp vụ");

    click(runButton());
    await flush();
    expect(runCalls()).toHaveLength(0);
    expect(toolForm()?.textContent).toContain("Vui lòng nhập tax_code");
  });

  it("runs a tool and shows the step timeline, answer and collapsed sources", async () => {
    await renderPage();
    await openTab("Tra cứu nghiệp vụ");

    typeInto(fieldInput("tax_code")!, "0101");
    typeInto(fieldInput("year")!, "2026");
    click(runButton());
    await waitFor(() => text().includes("Company A"));

    expect(JSON.parse(String(runCalls()[0].init?.body))).toEqual({
      module: "bkt-dia-enterprise-profile",
      tool: "bkt_dia_enterprise_profile_ask",
      arguments: { tax_code: "0101", year: 2026 },
    });
    const steps = [...document.querySelectorAll("[data-step]")].map((el) => `${el.getAttribute("data-step")}:${el.getAttribute("data-status")}`);
    expect(steps).toEqual(["validate:ok", "build_question:ok", "query:ok", "result:ok"]);
    expect(document.querySelector(".bkt-markdown strong")?.textContent).toBe("Company A");
    expect(text()).toContain("Profile of 0101");
    const sources = document.querySelector('[data-testid="dia-run-sources"]');
    expect(sources?.querySelectorAll("li")).toHaveLength(5);
    click(button("Xem thêm 2 nguồn"));
    expect(sources?.querySelectorAll("li")).toHaveLength(7);
  });

  it("shows an elapsed timer and disables Chạy while the run is pending", async () => {
    let resolveRun!: (value: DiaRunResponse) => void;
    sdk.routes.set(`${PLUGIN}/run`, () => new Promise<DiaRunResponse>((resolve) => (resolveRun = resolve)));
    await renderPage();
    await openTab("Tra cứu nghiệp vụ");

    typeInto(fieldInput("tax_code")!, "0101");
    click(runButton());
    await flush(150);
    expect(runButton()?.disabled).toBe(true);
    expect(document.querySelector('[data-step="query"]')?.textContent).toMatch(/đã chạy \d+\.\d giây/);

    await act(async () => resolveRun(OK_RUN));
    await waitFor(() => runButton()?.disabled === false);
  });

  it("shows the stage message and hint when a run fails", async () => {
    sdk.routes.set(`${PLUGIN}/run`, () => ({
      ok: false,
      function_code: "FC",
      steps: [
        { key: "validate", status: "ok", ms: 1 },
        { key: "build_question", status: "ok", ms: 1 },
        { key: "query", status: "error", ms: 5 },
        { key: "result", status: "skipped", ms: 0 },
      ],
      error: "connection refused",
      hint: "Check that the DIA service is running.",
      stage: "network",
    }));
    await renderPage();
    await openTab("Tra cứu nghiệp vụ");

    typeInto(fieldInput("tax_code")!, "0101");
    click(runButton());
    await waitFor(() => text().includes("Check that the DIA service is running."));
    expect(text()).toContain("Không kết nối được tới dịch vụ truy vấn DIA.");
    expect(document.querySelector('[data-step="query"]')?.getAttribute("data-status")).toBe("error");
  });

  it("renders the health error with its hint and never an endpoint URL", async () => {
    sdk.routes.set(`${PLUGIN}/health`, () => ({ ok: false, error: "not set", hint: "Set bkt_dia.endpoint.", stage: "config" }));
    sdk.routes.set(`${PLUGIN}/modules`, () => ({ ...MODULES, endpoint_configured: false }));
    await renderPage();
    await waitFor(() => text().includes("Set bkt_dia.endpoint."));

    const card = document.querySelector('[data-testid="dia-health-card"]');
    expect(card?.textContent).toContain("Chưa cấu hình endpoint");
    expect(card?.textContent).toContain("chưa được cấu hình hoặc cấu hình không hợp lệ");
    expect(card?.textContent).not.toMatch(/https?:\/\//);
  });

  it("shows an empty state linking to BKT Modules when every module is hidden", async () => {
    hidden = MODULES.modules.map((m) => m.name);
    await renderPage();
    await waitFor(() => document.querySelector('[data-testid="dia-empty"]') !== null);

    expect(document.querySelector('[data-testid="dia-empty"] a[href="/bkt-modules"]')).not.toBeNull();
    expect(tab("Tổng quan")).toBeUndefined();
  });

  it("lists recent runs from the log", async () => {
    sdk.routes.set(`${PLUGIN}/runs`, () => ({
      runs: [{ id: 7, at: 1, module: "bkt-dia-forecast", tool: "t", source: "agent", ok: false, stage: "http", error: "500", duration_ms: 9, question_preview: null }],
    }));
    await renderPage();
    await waitFor(() => document.querySelector('[data-testid="dia-recent-runs"]') !== null);

    const table = document.querySelector('[data-testid="dia-recent-runs"]');
    expect(table?.textContent).toContain("bkt-dia-forecast");
    expect(table?.textContent).toContain("Agent");
    expect(table?.textContent).toContain("Thất bại");
  });

  it("lists only cron jobs using a bkt-dia skill, and explains how to add one when none do", async () => {
    cronJobs = [
      { id: "j1", name: "Risk watch", enabled: true, skills: ["bkt-dia-risk-monitor"], schedule_display: "every 1h", last_status: "ok", last_run_at: "2026-11-17T08:00:00Z" },
      { id: "j2", name: "Other", enabled: true, skills: ["bkt-prompts"] },
    ];
    await renderPage();
    await waitFor(() => text().includes("Risk watch"));

    expect(text()).not.toContain("Other");
    expect(document.querySelector('a[href="/chat?resume=cron_j1_1"]')).not.toBeNull();

    cronJobs = [];
    const section = document.querySelector('[data-testid="dia-monitoring"]')!.closest("section")!;
    click(button("Làm mới", section));
    await waitFor(() => text().includes("hermes cron create"));
    expect(section.textContent).toContain("Cập nhật lúc");
  });
});
