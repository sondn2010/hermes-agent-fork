// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HubAgentPluginRow, PluginsHubResponse } from "@/lib/api";

const apiMocks = vi.hoisted(() => ({
  getPluginsHub: vi.fn(),
  enableAgentPlugin: vi.fn(),
  disableAgentPlugin: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

let container: HTMLDivElement;
let root: Root;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function hubRow(name: string, tags: string[], enabled: boolean): HubAgentPluginRow {
  return {
    name,
    version: "0.1.0",
    description: `${name} module`,
    source: "bundled",
    runtime_status: enabled ? "enabled" : "inactive",
    has_dashboard_manifest: false,
    dashboard_manifest: null,
    path: `/plugins/${name}`,
    can_remove: false,
    can_update_git: false,
    auth_required: false,
    auth_command: "",
    user_hidden: false,
    tags,
  };
}

function hub(rows: HubAgentPluginRow[]): PluginsHubResponse {
  return {
    plugins: rows,
    orphan_dashboard_plugins: [],
    providers: { memory_provider: "", memory_options: [], context_engine: "compressor", context_options: [] },
  };
}

const DEFAULT_ROWS = [
  hubRow("bkt-dia-common", ["bkt", "category:shared"], false),
  hubRow("bkt-dia-enterprise-profile", ["bkt", "category:domain-lookup"], true),
  hubRow("bkt-dia-finance-tax", ["bkt", "category:domain-lookup"], false),
  hubRow("bkt-dia-workforce", ["bkt", " Category:Domain-Lookup "], false),
  hubRow("spotify", ["music"], true),
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

async function renderPage(initialEntry = "/bkt-modules") {
  const [{ default: BktModulesPage }, { I18nProvider }, { PageHeaderProvider }] = await Promise.all([
    import("./BktModulesPage"),
    import("@/i18n"),
    import("@/contexts/PageHeaderProvider"),
  ]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <I18nProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <PageHeaderProvider pluginTabs={[]}>
            <Routes>
              <Route path="/bkt-modules" element={<BktModulesPage />} />
            </Routes>
            <LocationProbe />
          </PageHeaderProvider>
        </MemoryRouter>
      </I18nProvider>,
    ),
  );
}

const moduleSwitch = (name: string) =>
  document.querySelector<HTMLButtonElement>(`button[role="switch"][aria-label="Enable ${name}"]`);
const categorySwitch = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[role="checkbox"][aria-label="Enable all visible modules in ${label}"]`);
const moduleNames = () => [...document.querySelectorAll('button[role="switch"]')].map((el) => el.getAttribute("aria-label"));

function click(el: Element | null) {
  if (!el) throw new Error("element not rendered");
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  for (const fn of Object.values(apiMocks)) fn.mockReset();
  apiMocks.getPluginsHub.mockResolvedValue(hub(DEFAULT_ROWS));
  apiMocks.enableAgentPlugin.mockResolvedValue({ ok: true, name: "x" });
  apiMocks.disableAgentPlugin.mockResolvedValue({ ok: true, name: "x" });
  vi.stubGlobal("matchMedia", () => ({ addEventListener() {}, matches: false, media: "", removeEventListener() {} }));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

describe("BktModulesPage", () => {
  it("lists only bkt-* plugins grouped by category, with the banner and the common warning", async () => {
    await renderPage();
    await waitFor(() => moduleSwitch("bkt-dia-common") !== null);

    expect(document.body.textContent).not.toContain("spotify");
    const sections = [...document.querySelectorAll("[data-category]")].map((el) => el.getAttribute("data-category"));
    expect(sections).toEqual(["shared", "domain-lookup"]);
    expect(document.querySelector('[role="note"]')?.textContent).toContain("new sessions");
    expect(categorySwitch("Domain lookup")?.getAttribute("aria-checked")).toBe("mixed");
    // enterprise-profile is on while bkt-dia-common is off.
    expect(document.body.textContent).toContain("Needs bkt-dia-common");
  });

  it("collapses a section with aria-expanded", async () => {
    await renderPage();
    await waitFor(() => moduleSwitch("bkt-dia-common") !== null);
    const header = document.querySelector<HTMLButtonElement>('[data-category="shared"] button[aria-expanded]');
    expect(header?.getAttribute("aria-expanded")).toBe("true");
    await act(async () => click(header));
    expect(header?.getAttribute("aria-expanded")).toBe("false");
    const region = document.getElementById(header!.getAttribute("aria-controls")!);
    expect(region?.hidden).toBe(true);
  });

  it("applies filters from the URL and writes filter changes back to it", async () => {
    await renderPage("/bkt-modules?status=enabled");
    await waitFor(() => moduleSwitch("bkt-dia-enterprise-profile") !== null);
    expect(moduleNames()).toEqual(["Enable bkt-dia-enterprise-profile"]);

    await act(async () => click([...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent === "All")!));
    await act(async () => typeInto(document.querySelector<HTMLInputElement>('input[type="search"]')!, "finance"));
    expect(moduleNames()).toEqual(["Enable bkt-dia-finance-tax"]);
    expect(document.querySelector('[data-testid="search"]')?.textContent).toBe("?q=finance");

    await act(async () => typeInto(document.querySelector<HTMLInputElement>('input[type="search"]')!, "no-such-module"));
    expect(document.body.textContent).toContain("No modules match the current filters.");
  });

  it("toggles optimistically and reconciles with the server afterwards", async () => {
    await renderPage();
    await waitFor(() => moduleSwitch("bkt-dia-common") !== null);
    const call = deferred<{ ok: boolean; name: string }>();
    apiMocks.enableAgentPlugin.mockReturnValueOnce(call.promise);
    apiMocks.getPluginsHub.mockResolvedValue(
      hub(DEFAULT_ROWS.map((r) => (r.name === "bkt-dia-common" ? { ...r, runtime_status: "enabled" } : r))),
    );

    await act(async () => click(moduleSwitch("bkt-dia-common")));
    expect(moduleSwitch("bkt-dia-common")?.getAttribute("aria-checked")).toBe("true");
    expect(moduleSwitch("bkt-dia-common")?.disabled).toBe(true);
    expect(apiMocks.enableAgentPlugin).toHaveBeenCalledWith("bkt-dia-common");

    await act(async () => call.resolve({ ok: true, name: "bkt-dia-common" }));
    await waitFor(() => apiMocks.getPluginsHub.mock.calls.length === 2);
    await flush(20);
    expect(moduleSwitch("bkt-dia-common")?.getAttribute("aria-checked")).toBe("true");
    expect(moduleSwitch("bkt-dia-common")?.disabled).toBe(false);
    expect(document.body.textContent).not.toContain("Needs bkt-dia-common");
  });

  it("rolls back and shows a toast when the toggle fails", async () => {
    await renderPage();
    await waitFor(() => moduleSwitch("bkt-dia-finance-tax") !== null);
    apiMocks.enableAgentPlugin.mockRejectedValueOnce(new Error("config locked"));

    await act(async () => click(moduleSwitch("bkt-dia-finance-tax")));
    await waitFor(() => document.body.textContent?.includes("config locked") ?? false);
    expect(document.body.textContent).toContain("Could not update bkt-dia-finance-tax: config locked");
    expect(moduleSwitch("bkt-dia-finance-tax")?.getAttribute("aria-checked")).toBe("false");
  });

  it("never lets a stale hub response overwrite a newer optimistic toggle", async () => {
    await renderPage();
    await waitFor(() => moduleSwitch("bkt-dia-common") !== null);
    // The reconcile fetch after the first toggle hangs and later answers with the pre-toggle state.
    const staleFetch = deferred<PluginsHubResponse>();
    apiMocks.getPluginsHub.mockReturnValueOnce(staleFetch.promise);

    await act(async () => click(moduleSwitch("bkt-dia-common")));
    await waitFor(() => apiMocks.getPluginsHub.mock.calls.length === 2);

    const secondToggle = deferred<{ ok: boolean; name: string }>();
    apiMocks.enableAgentPlugin.mockReturnValueOnce(secondToggle.promise);
    await act(async () => click(moduleSwitch("bkt-dia-finance-tax")));
    await act(async () => staleFetch.resolve(hub(DEFAULT_ROWS)));
    await flush(20);

    expect(moduleSwitch("bkt-dia-common")?.getAttribute("aria-checked")).toBe("true");
    expect(moduleSwitch("bkt-dia-finance-tax")?.getAttribute("aria-checked")).toBe("true");
    await act(async () => secondToggle.resolve({ ok: true, name: "bkt-dia-finance-tax" }));
  });

  it("switches a whole category sequentially and reports partial failures in one toast", async () => {
    await renderPage();
    await waitFor(() => categorySwitch("Domain lookup") !== null);
    const first = deferred<{ ok: boolean; name: string }>();
    const calls: string[] = [];
    apiMocks.enableAgentPlugin.mockImplementation((name: string) => {
      calls.push(name);
      return name === "bkt-dia-finance-tax" ? first.promise : Promise.resolve({ ok: true, name });
    });

    await act(async () => click(categorySwitch("Domain lookup")));
    // Optimistically on, interaction locked, and the second request waits for the first.
    expect(categorySwitch("Domain lookup")?.getAttribute("aria-checked")).toBe("true");
    expect(categorySwitch("Domain lookup")?.disabled).toBe(true);
    expect(moduleSwitch("bkt-dia-workforce")?.disabled).toBe(true);
    expect(calls).toEqual(["bkt-dia-finance-tax"]);

    await act(async () => first.reject(new Error("boom")));
    await waitFor(() => document.body.textContent?.includes("failed to update") ?? false);

    // enterprise-profile was already on, so it is never called.
    expect(calls).toEqual(["bkt-dia-finance-tax", "bkt-dia-workforce"]);
    expect(document.body.textContent).toContain("1 of 2 modules failed to update: bkt-dia-finance-tax");
    expect(moduleSwitch("bkt-dia-finance-tax")?.getAttribute("aria-checked")).toBe("false");
    expect(moduleSwitch("bkt-dia-workforce")?.getAttribute("aria-checked")).toBe("true");
    expect(categorySwitch("Domain lookup")?.getAttribute("aria-checked")).toBe("mixed");
    expect(categorySwitch("Domain lookup")?.disabled).toBe(false);
  });

  it("shows the empty state when no bkt-* plugin is installed", async () => {
    apiMocks.getPluginsHub.mockResolvedValue(hub([hubRow("spotify", [], true)]));
    await renderPage();
    await waitFor(() => document.body.textContent?.includes("No BKT modules installed") ?? false);
    expect(document.querySelector('button[role="switch"]')).toBeNull();
  });
});
