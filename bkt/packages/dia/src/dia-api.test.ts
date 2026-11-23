import { getCronJobRuns, getCronJobs, getDiaHealth, getDiaModules, getDiaRuns, getHubPlugins, runDiaTool, scopedUrl } from "./dia-api";
import { installSdk } from "./test-sdk-stub";
import type { StubSdk } from "./test-sdk-stub";

let sdk: StubSdk;

function onlyCall() {
  expect(sdk.calls).toHaveLength(1);
  return sdk.calls[0];
}

beforeEach(() => {
  sdk = installSdk();
});

describe("bkt-dia-common plugin calls", () => {
  it("lists modules from the plugin API", async () => {
    const body = { common_enabled: true, endpoint_configured: false, categories: [], modules: [] };
    sdk.routes.set("/api/plugins/bkt-dia-common/modules", () => body);

    await expect(getDiaModules()).resolves.toEqual(body);

    const { url, init } = onlyCall();
    expect(url.pathname).toBe("/api/plugins/bkt-dia-common/modules");
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("reads health from the plugin API", async () => {
    sdk.routes.set("/api/plugins/bkt-dia-common/health", () => ({ ok: false, error: "x", hint: "y", stage: "config" }));
    await expect(getDiaHealth()).resolves.toMatchObject({ stage: "config" });
  });

  it("posts a run with module, tool and arguments as JSON", async () => {
    sdk.routes.set("/api/plugins/bkt-dia-common/run", () => ({ ok: true, steps: [], function_code: "F01" }));

    await runDiaTool("bkt-dia-f01", "bkt_dia_f01_ask", { question: "q", top_k: 3, strict: true });

    const { init } = onlyCall();
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      module: "bkt-dia-f01",
      tool: "bkt_dia_f01_ask",
      arguments: { question: "q", top_k: 3, strict: true },
    });
  });

  it("surfaces an unknown module or tool (HTTP 404) as a rejection", async () => {
    sdk.routes.set("/api/plugins/bkt-dia-common/run", () => {
      throw new Error('404: {"detail":"unknown module"}');
    });
    await expect(runDiaTool("nope", "nope", {})).rejects.toThrow(/unknown module/);
  });

  it("asks for recent runs with a whole, positive limit", async () => {
    sdk.routes.set("/api/plugins/bkt-dia-common/runs", () => ({ runs: [{ id: 1 }] }));

    await expect(getDiaRuns()).resolves.toEqual([{ id: 1 }]);
    await getDiaRuns(0);

    expect(sdk.calls.map((c) => c.url.searchParams.get("limit"))).toEqual(["50", "1"]);
  });

  it("reads the hub rows for the Show UI flags", async () => {
    sdk.routes.set("/api/dashboard/plugins/hub", () => ({ plugins: [{ name: "a", user_hidden: true }] }));
    await expect(getHubPlugins()).resolves.toEqual([{ name: "a", user_hidden: true }]);
  });
});

describe("profile scoping", () => {
  it("names the bundle profile on plugin routes, and leaves an unscoped bundle to the host", () => {
    expect(scopedUrl("/api/plugins/bkt-dia-common/runs", { limit: "5" }, "work")).toBe(
      "/api/plugins/bkt-dia-common/runs?limit=5&profile=work",
    );
    expect(scopedUrl("/api/plugins/bkt-dia-common/modules", {}, "")).toBe("/api/plugins/bkt-dia-common/modules");
  });

  it("names the profile on cron routes, which the host never scopes", async () => {
    sdk.routes.set("/api/cron/jobs", () => []);
    sdk.routes.set("/api/cron/jobs/job%2F1/runs", () => ({ runs: [] }));

    await getCronJobs("work");
    await getCronJobRuns("job/1", "other");
    await getCronJobRuns("job/1", "");

    expect(sdk.calls.map((c) => c.url.searchParams.getAll("profile"))).toEqual([["work"], ["other"], []]);
  });
});
