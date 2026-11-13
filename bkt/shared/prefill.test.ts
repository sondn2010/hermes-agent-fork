import { PREFILL_KEY, takeChatPrefill, writeChatPrefill } from "./prefill";

describe("chat prefill", () => {
  beforeEach(() => sessionStorage.clear());

  it("is read exactly once", () => {
    writeChatPrefill({ text: "hello", profile: "work" });
    expect(takeChatPrefill()).toEqual({ text: "hello", profile: "work" });
    expect(takeChatPrefill()).toBeNull();
  });

  it("drops malformed values", () => {
    sessionStorage.setItem(PREFILL_KEY, "{not json");
    expect(takeChatPrefill()).toBeNull();
    sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ text: 3 }));
    expect(takeChatPrefill()).toBeNull();
  });
});
