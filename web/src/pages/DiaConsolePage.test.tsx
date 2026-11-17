// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CronJob, HubAgentPluginRow, PluginsHubResponse } from "@/lib/api";
import type { DiaModule, DiaModulesResponse, DiaRunResponse } from "@/lib/dia-console-api";

const apiMocks = vi.hoisted(() => ({
  getPluginsHub: vi.fn(),
  getCronJobs: vi.fn(),
}));

const diaMocks = vi.hoisted(() => ({
  getDiaModules: vi.fn(),
  getDiaHealth: vi.fn(),
  getDiaRuns: vi.fn(),
  runDiaTool: vi.fn(),
  getCronJobRuns: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: apiMocks, fetchJSON: vi.fn(), getManagementProfile: () => "default" }));
vi.mock("@/lib/dia-console-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dia-console-api")>()),
  ...diaMocks,
}));

let container: HTMLDivElement;
let root: Root;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function hubRow(name: string, userHidden: boolean): HubAgentPluginRow {
  return {
    name,
    version: "0.1.0",
    description: "",
    source: "bundled",
    runtime_status: "enabled",
    has_dashboard_manifest: false,
    dashboard_manifest: null,
    path: `/plugins/${name}`,
    can_remove: false,
    can_update_git: false,
    auth_required: false,
    auth_command: "",
    user_hidden: userHidden,
    tags: ["bkt"],
  };
}

function hub(hidden: string[]): PluginsHubResponse {
  return {
    plugins: MODULES.modules.map((m) => hubRow(m.name, hidden.includes(m.name))),
    orphan_dashboard_plugins: [],
    providers: { memory_provider: "", memory_options: [], context_engine: "compressor", context_options: [] },
  };
}

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
  const [{ default: DiaConsolePage }, { I18nProvider }, { PageHeaderProvider }] = await Promise.all([
    import("./DiaConsolePage"),
    import("@/i18n"),
    import("@/contexts/PageHeaderProvider"),
  ]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/dia"]}>
          <PageHeaderProvider pluginTabs={[]}>
            <Routes>
              <Route path="/dia" element={<DiaConsolePage />} />
            </Routes>
          </PageHeaderProvider>
        </MemoryRouter>
      </I18nProvider>,
    ),
  );
}

const text = () => document.body.textContent ?? "";

function click(el: Element | null | undefined) {
  if (!el) throw new Error("element not rendered");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function tabButton(label: string) {
  return [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
}

async function openTab(label: string) {
  click(tabButton(label));
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

beforeEach(() => {
  for (const fn of [...Object.values(apiMocks), ...Object.values(diaMocks)]) fn.mockReset();
  diaMocks.getDiaModules.mockResolvedValue(MODULES);
  diaMocks.getDiaHealth.mockResolvedValue({ ok: true, status: "green", total_documents: 1234, latency_ms: 12 });
  diaMocks.getDiaRuns.mockResolvedValue({ runs: [] });
  diaMocks.runDiaTool.mockResolvedValue(OK_RUN);
  diaMocks.getCronJobRuns.mockResolvedValue({ runs: [], limit: 20 });
  apiMocks.getPluginsHub.mockResolvedValue(hub(["bkt-dia-hidden"]));
  apiMocks.getCronJobs.mockResolvedValue([]);
  vi.stubGlobal("matchMedia", () => ({ addEventListener() {}, matches: false, media: "", removeEventListener() {} }));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

describe("DiaConsolePage", () => {
  it("renders a tab per category with visible modules and omits hidden modules", async () => {
    await renderPage();
    await waitFor(() => tabButton("Domain lookup") !== undefined);

    expect(tabButton("Status")).toBeDefined();
    expect(tabButton("Analysis & forecast")).toBeDefined();
    expect(tabButton("Recent runs")).toBeDefined();
    expect(tabButton("Monitoring")).toBeDefined();
    // The only decision-support module is hidden, so its category has no tab.
    expect(tabButton("Decision support")).toBeUndefined();
    expect(document.querySelector('[data-module="bkt-dia-hidden"]')).toBeNull();
    expect(document.querySelector('[data-module="bkt-dia-forecast"]')).not.toBeNull();
    await waitFor(() => text().includes("1234"));
    expect(text()).toContain("Endpoint configured");
  });

  it("shows a disabled module with a BKT Modules link and no form", async () => {
    await renderPage();
    await waitFor(() => tabButton("Domain lookup") !== undefined);
    await openTab("Domain lookup");

    const panel = document.querySelector('[data-module="bkt-dia-finance-tax"]');
    expect(panel?.querySelector("form")).toBeNull();
    expect(panel?.querySelector('a[href="/bkt-modules"]')).not.toBeNull();
    expect(toolForm()).not.toBeNull();
  });

  it("blocks submit while a required field is empty", async () => {
    await renderPage();
    await waitFor(() => tabButton("Domain lookup") !== undefined);
    await openTab("Domain lookup");

    click(runButton());
    await flush();
    expect(diaMocks.runDiaTool).not.toHaveBeenCalled();
    expect(toolForm()?.textContent).toContain("tax_code is required");
  });

  it("runs a tool and shows the step timeline, answer and collapsed sources", async () => {
    await renderPage();
    await waitFor(() => tabButton("Domain lookup") !== undefined);
    await openTab("Domain lookup");

    typeInto(fieldInput("tax_code")!, "0101");
    typeInto(fieldInput("year")!, "2026");
    click(runButton());
    await waitFor(() => text().includes("Company A"));

    expect(diaMocks.runDiaTool).toHaveBeenCalledWith("bkt-dia-enterprise-profile", "bkt_dia_enterprise_profile_ask", {
      tax_code: "0101",
      year: 2026,
    });
    const steps = [...document.querySelectorAll("[data-step]")].map((el) => `${el.getAttribute("data-step")}:${el.getAttribute("data-status")}`);
    expect(steps).toEqual(["validate:ok", "build_question:ok", "query:ok", "result:ok"]);
    expect(document.querySelector("strong")?.textContent).toBe("Company A");
    expect(text()).toContain("Profile of 0101");
    const sources = document.querySelector('[data-testid="dia-run-sources"]');
    expect(sources?.querySelectorAll("li")).toHaveLength(5);
    click(tabButton("Show 2 more"));
    expect(sources?.querySelectorAll("li")).toHaveLength(7);
  });

  it("shows an elapsed timer and disables Run while the run is pending", async () => {
    let resolveRun!: (value: DiaRunResponse) => void;
    diaMocks.runDiaTool.mockReturnValue(new Promise<DiaRunResponse>((resolve) => (resolveRun = resolve)));
    await renderPage();
    await waitFor(() => tabButton("Domain lookup") !== undefined);
    await openTab("Domain lookup");

    typeInto(fieldInput("tax_code")!, "0101");
    click(runButton());
    await flush(150);
    expect(runButton()?.disabled).toBe(true);
    expect(document.querySelector('[data-step="query"]')?.textContent).toMatch(/\d+\.\ds elapsed/);

    await act(async () => resolveRun(OK_RUN));
    await waitFor(() => runButton()?.disabled === false);
  });

  it("shows the stage message and hint when a run fails", async () => {
    diaMocks.runDiaTool.mockResolvedValue({
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
    } satisfies DiaRunResponse);
    await renderPage();
    await waitFor(() => tabButton("Domain lookup") !== undefined);
    await openTab("Domain lookup");

    typeInto(fieldInput("tax_code")!, "0101");
    click(runButton());
    await waitFor(() => text().includes("Check that the DIA service is running."));
    expect(text()).toContain("The DIA query service could not be reached.");
    expect(document.querySelector('[data-step="query"]')?.getAttribute("data-status")).toBe("error");
  });

  it("renders the health error with its hint and never an endpoint URL", async () => {
    diaMocks.getDiaHealth.mockResolvedValue({ ok: false, error: "not set", hint: "Set bkt_dia.endpoint.", stage: "config" });
    diaMocks.getDiaModules.mockResolvedValue({ ...MODULES, endpoint_configured: false });
    await renderPage();
    await waitFor(() => text().includes("Set bkt_dia.endpoint."));

    const card = document.querySelector('[data-testid="dia-health-card"]');
    expect(card?.textContent).toContain("Endpoint not configured");
    expect(card?.textContent).toContain("not configured or its settings are invalid");
    expect(card?.textContent).not.toMatch(/https?:\/\//);
  });

  it("shows an empty state linking to BKT Modules when every module is hidden", async () => {
    apiMocks.getPluginsHub.mockResolvedValue(hub(MODULES.modules.map((m) => m.name)));
    await renderPage();
    await waitFor(() => document.querySelector('[data-testid="dia-empty"]') !== null);

    expect(document.querySelector('[data-testid="dia-empty"] a[href="/bkt-modules"]')).not.toBeNull();
    expect(tabButton("Status")).toBeUndefined();
  });

  it("lists only cron jobs using a bkt-dia skill, and explains how to add one when none do", async () => {
    apiMocks.getCronJobs.mockResolvedValue([
      { id: "j1", name: "Risk watch", enabled: true, skills: ["bkt-dia-risk-monitor"], schedule_display: "every 1h", last_status: "ok", last_run_at: "2026-11-17T08:00:00Z" },
      { id: "j2", name: "Other", enabled: true, skills: ["bkt-prompts"] },
    ] as CronJob[]);
    diaMocks.getCronJobRuns.mockResolvedValue({ runs: [{ id: "cron_j1_1", started_at: 1, source: "cron" }], limit: 20 });
    await renderPage();
    await waitFor(() => tabButton("Monitoring") !== undefined);
    await openTab("Monitoring");
    await waitFor(() => text().includes("Risk watch"));

    expect(text()).not.toContain("Other");
    expect(document.querySelector('a[href="/chat?resume=cron_j1_1"]')).not.toBeNull();
    expect(diaMocks.getCronJobRuns).toHaveBeenCalledWith("j1", "default");

    apiMocks.getCronJobs.mockResolvedValue([]);
    click(tabButton("Refresh"));
    await waitFor(() => text().includes("hermes cron create"));
    expect(text()).toContain("Last updated");
  });
});
