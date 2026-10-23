import { advertisedModel, apiKeySamples } from "./api-key-samples";
import { restartNeeded } from "./profile-api";

describe("apiKeySamples", () => {
  it("points at the endpoint and reads the key from the environment", () => {
    const { curl, python } = apiKeySamples("http://127.0.0.1:8642/p/work/v1", "work");
    expect(curl).toContain("http://127.0.0.1:8642/p/work/v1/chat/completions");
    expect(curl).toContain("Bearer $API_SERVER_KEY");
    expect(curl).toContain('"model": "work"');
    expect(python).toContain('base_url="http://127.0.0.1:8642/p/work/v1"');
    expect(python).toContain('os.environ["API_SERVER_KEY"]');
  });

  it("advertises the profile name for named profiles only", () => {
    expect(advertisedModel("work")).toBe("work");
    expect(advertisedModel("default")).toBe("hermes-agent");
  });
});

describe("profile helpers", () => {
  it("needs a restart only on a profile's own listener", () => {
    expect(restartNeeded("/v1")).toBe(true);
    expect(restartNeeded("/p/work/v1")).toBe(false);
  });
});
