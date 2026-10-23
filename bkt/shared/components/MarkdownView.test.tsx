import { act } from "react";
import { createRoot } from "react-dom/client";
import { MarkdownView } from "./MarkdownView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(markdown: string): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(<MarkdownView>{markdown}</MarkdownView>);
  });
  return host;
}

describe("MarkdownView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.__BKT_MERMAID__;
    delete window.mermaid;
  });

  it("renders GFM tables", async () => {
    const host = await render("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(host.querySelector("table td")?.textContent).toBe("1");
  });

  it("leaves raw HTML inert", async () => {
    const host = await render('before <script>window.pwned = 1</script> <img src=x onerror="alert(1)"> after');
    expect(host.querySelector("script")).toBeNull();
    expect(host.querySelector("img")).toBeNull();
    expect((window as { pwned?: number }).pwned).toBeUndefined();
  });

  it("strips javascript: links", async () => {
    const host = await render("[x](javascript:alert(1))");
    expect(host.querySelector("a")?.getAttribute("href") ?? "").not.toMatch(/javascript:/i);
  });

  it("shows a mermaid fence with a click directive as plain code when mermaid is unavailable", async () => {
    const source = 'flowchart LR\n  A-->B\n  click A call alert("x")';
    const host = await render("```mermaid\n" + source + "\n```");
    // The vendor script fails to load in jsdom; the fence falls back to inert text.
    await act(async () => {
      document.querySelector<HTMLScriptElement>("script[data-bkt-mermaid]")?.onerror?.(new Event("error"));
      await window.__BKT_MERMAID__;
    });
    expect(host.querySelector("pre code")?.textContent).toBe(source);
    expect(host.querySelector("svg")).toBeNull();
  });
});
