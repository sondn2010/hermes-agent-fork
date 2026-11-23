import { OVERVIEW_TAB, readTabParam, resolveTab, writeTabParam } from "./dia-tabs";

describe("console sub-tab in ?tab=", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/dia?x=1#top");
  });

  it("defaults to the overview and falls back to it for an unknown slug", () => {
    expect(resolveTab(null, [OVERVIEW_TAB, "domain-lookup"])).toBe(OVERVIEW_TAB);
    expect(resolveTab("decision-support", [OVERVIEW_TAB, "domain-lookup"])).toBe(OVERVIEW_TAB);
    expect(resolveTab("domain-lookup", [OVERVIEW_TAB, "domain-lookup"])).toBe("domain-lookup");
  });

  it("round-trips a slug through the URL and keeps the route, other params and hash", () => {
    writeTabParam("domain-lookup");
    expect(window.location.pathname).toBe("/dia");
    expect(window.location.hash).toBe("#top");
    expect(new URLSearchParams(window.location.search).get("x")).toBe("1");
    expect(readTabParam()).toBe("domain-lookup");

    writeTabParam(OVERVIEW_TAB);
    expect(readTabParam()).toBeNull();
    expect(window.location.search).toBe("?x=1");
  });
});
