import { PROFILE_TRANSPORT, profileRequest } from "./api";
import type { ProfileEndpoint } from "./api";

function concrete(endpoint: ProfileEndpoint) {
  return { params: Object.fromEntries([...endpoint.matchAll(/:([a-z]+)/g)].map((m) => [m[1], "x y"])) };
}

describe("profileRequest", () => {
  it.each(Object.keys(PROFILE_TRANSPORT) as ProfileEndpoint[])("names the profile where %s reads it", (endpoint) => {
    const { url, init } = profileRequest(endpoint, "work", { ...concrete(endpoint), body: { a: 1 } });
    const parsed = new URL(url, "http://host");
    // Every request carries the explicit profile in the query, so the host never adds another.
    expect(parsed.searchParams.get("profile")).toBe("work");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    if (PROFILE_TRANSPORT[endpoint] === "body") expect(body.profile).toBe("work");
    else expect(body).not.toHaveProperty("profile");
  });

  it("puts pairing approve and revoke profiles in the JSON body", () => {
    for (const endpoint of ["/api/pairing/approve", "/api/pairing/revoke"] as const) {
      const { init } = profileRequest(endpoint, "b", { body: { platform: "telegram" } });
      expect(JSON.parse(String(init.body))).toEqual({ platform: "telegram", profile: "b" });
      expect(init.method).toBe("POST");
    }
  });

  it("keeps the pairing list profile in the query", () => {
    const { url, init } = profileRequest("/api/pairing", "b");
    expect(url).toBe("/api/pairing?profile=b");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("encodes path parameters and extra query values", () => {
    const { url } = profileRequest("/api/messaging/platforms/:id/test", "p 1", {
      params: { id: "a/b" },
      query: { verbose: true, skip: undefined },
      method: "POST",
    });
    expect(url).toBe("/api/messaging/platforms/a%2Fb/test?verbose=true&profile=p+1");
  });

  it("refuses a missing path parameter", () => {
    expect(() => profileRequest("/api/messaging/platforms/:id", "a")).toThrow(/missing path parameter id/);
  });

  it("rejects endpoints outside the table at compile time", () => {
    // @ts-expect-error -- an unknown endpoint is a type error, never a silent query fallback
    expect(() => profileRequest("/api/unknown", "a")).not.toThrow();
  });
});
