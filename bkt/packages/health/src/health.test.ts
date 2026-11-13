import { platformStatus, summarise, worst } from "./health";
import type { PlatformInfo } from "./health";

const base: PlatformInfo = { id: "telegram", name: "Telegram", enabled: true, configured: true, gateway_running: true, state: "connected", error_message: null };

describe("health status mapping", () => {
  it("maps platform states", () => {
    expect(platformStatus(base)).toBe("ok");
    expect(platformStatus({ ...base, enabled: false, state: "disabled" })).toBe("off");
    expect(platformStatus({ ...base, state: "startup_failed" })).toBe("fail");
    expect(platformStatus({ ...base, state: "pending_restart" })).toBe("busy");
    expect(platformStatus({ ...base, gateway_running: false, state: "gateway_stopped" })).toBe("off");
    expect(platformStatus({ ...base, configured: false, state: "not_configured" })).toBe("fail");
    expect(platformStatus({ ...base, state: "retrying", error_message: "401" })).toBe("fail");
  });

  it("lets the worst status win", () => {
    expect(worst(["ok", "off", "fail"])).toBe("fail");
    expect(worst(["ok", "busy"])).toBe("busy");
    expect(worst(["off"])).toBe("off");
    expect(worst([])).toBe("off");
  });

  it("separates messaging from the api server", () => {
    const s = summarise([base, { ...base, id: "api_server", name: "API server", state: "startup_failed" }, { ...base, id: "slack", enabled: false }]);
    expect(s.messaging).toBe("ok");
    expect(s.apiServer).toBe("fail");
    expect(s.enabled.map((p) => p.id)).toEqual(["telegram"]);
  });
});
