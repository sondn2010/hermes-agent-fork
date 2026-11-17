// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setManagementProfile } from "./api";
import {
  getCronJobRuns,
  getDiaHealth,
  getDiaModules,
  getDiaRuns,
  runDiaTool,
} from "./dia-console-api";

vi.mock("./dashboard-auth-reload", () => ({
  attemptDashboardTokenReloadOnce: vi.fn(() => false),
  clearDashboardTokenReloadAttempt: vi.fn(),
}));

function stubFetch(body: unknown, status = 200) {
  const mock = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        status,
      }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** Path + query of the single request the mock saw, and its init. */
function onlyCall(mock: ReturnType<typeof stubFetch>): { url: URL; init: RequestInit } {
  expect(mock).toHaveBeenCalledTimes(1);
  const [input, init] = mock.mock.calls[0];
  return { url: new URL(String(input), window.location.href), init: init ?? {} };
}

beforeEach(() => {
  setManagementProfile("work");
});

afterEach(() => {
  setManagementProfile("");
  vi.unstubAllGlobals();
});

describe("bkt-dia-common plugin calls", () => {
  it("lists modules from the plugin API, scoped to the selected profile", async () => {
    const body = { common_enabled: true, endpoint_configured: false, categories: [], modules: [] };
    const mock = stubFetch(body);

    await expect(getDiaModules()).resolves.toEqual(body);

    const { url, init } = onlyCall(mock);
    expect(url.pathname).toBe("/api/plugins/bkt-dia-common/modules");
    expect(url.searchParams.get("profile")).toBe("work");
    expect(init.method ?? "GET").toBe("GET");
  });

  it("reads health from the plugin API", async () => {
    const body = { ok: false, error: "not configured", hint: "set endpoint", stage: "config" };
    const mock = stubFetch(body);

    await expect(getDiaHealth()).resolves.toEqual(body);

    const { url } = onlyCall(mock);
    expect(url.pathname).toBe("/api/plugins/bkt-dia-common/health");
    expect(url.searchParams.getAll("profile")).toEqual(["work"]);
  });

  it("posts a run with module, tool and arguments as JSON", async () => {
    const mock = stubFetch({ ok: true, steps: [], function_code: "F01" });

    await runDiaTool("bkt-dia-f01", "bkt_dia_f01_ask", { question: "q", top_k: 3, strict: true });

    const { url, init } = onlyCall(mock);
    expect(url.pathname).toBe("/api/plugins/bkt-dia-common/run");
    expect(url.searchParams.get("profile")).toBe("work");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({
      module: "bkt-dia-f01",
      tool: "bkt_dia_f01_ask",
      arguments: { question: "q", top_k: 3, strict: true },
    });
  });

  it("surfaces an unknown module or tool (HTTP 404) as a rejection", async () => {
    stubFetch({ detail: "unknown module" }, 404);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(runDiaTool("nope", "nope", {})).rejects.toThrow();
  });

  it("asks for recent runs with the default limit", async () => {
    const mock = stubFetch({ runs: [] });

    await getDiaRuns();

    const { url } = onlyCall(mock);
    expect(url.pathname).toBe("/api/plugins/bkt-dia-common/runs");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("profile")).toBe("work");
  });

  it("sends a whole, positive runs limit", async () => {
    const mock = stubFetch({ runs: [] });

    await getDiaRuns(0);

    expect(onlyCall(mock).url.searchParams.get("limit")).toBe("1");
  });
});

describe("getCronJobRuns", () => {
  it("names the management profile explicitly", async () => {
    const mock = stubFetch({ runs: [], limit: 20 });

    await getCronJobRuns("job/1");

    const { url } = onlyCall(mock);
    expect(url.pathname).toBe("/api/cron/jobs/job%2F1/runs");
    expect(url.searchParams.getAll("profile")).toEqual(["work"]);
  });

  it("prefers an explicit profile over the management selection", async () => {
    const mock = stubFetch({ runs: [], limit: 20 });

    await getCronJobRuns("abc", "other");

    expect(onlyCall(mock).url.searchParams.getAll("profile")).toEqual(["other"]);
  });

  it("omits the profile when none is selected", async () => {
    setManagementProfile("");
    const mock = stubFetch({ runs: [], limit: 20 });

    await getCronJobRuns("abc");

    expect(onlyCall(mock).url.search).toBe("");
  });
});
