import { MERMAID_CONFIG, isMermaidFence } from "./mermaid";

describe("isMermaidFence", () => {
  it("detects the mermaid language class", () => {
    expect(isMermaidFence(["language-mermaid"])).toBe(true);
    expect(isMermaidFence("hljs language-mermaid")).toBe(true);
  });

  it("ignores other fences and lookalikes", () => {
    expect(isMermaidFence(["language-js"])).toBe(false);
    expect(isMermaidFence("language-mermaidx")).toBe(false);
    expect(isMermaidFence(undefined)).toBe(false);
  });

  it("initialises mermaid in strict mode without auto start", () => {
    expect(MERMAID_CONFIG.securityLevel).toBe("strict");
    expect(MERMAID_CONFIG.startOnLoad).toBe(false);
  });
});
