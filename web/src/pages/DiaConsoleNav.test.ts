import { describe, expect, it } from "vitest";

import { DIA_COMMON_PLUGIN, isDiaConsoleNavVisible } from "@/lib/dia-console-api";

const common = { name: DIA_COMMON_PLUGIN };
const other = { name: "bkt-files" };

describe("DIA AI Console nav entry", () => {
  it("is shown once plugins loaded and the bkt-dia-common manifest is present", () => {
    expect(isDiaConsoleNavVisible([other, common], false)).toBe(true);
  });

  it("is hidden when the manifest is absent (plugin hidden or disabled)", () => {
    expect(isDiaConsoleNavVisible([other], false)).toBe(false);
    expect(isDiaConsoleNavVisible([], false)).toBe(false);
  });

  it("stays hidden while plugins are still loading, even with a cached manifest", () => {
    expect(isDiaConsoleNavVisible([common], true)).toBe(false);
  });
});
