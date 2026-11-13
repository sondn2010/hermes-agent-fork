import { pluginAssetUrl } from "./sdk";

/** Strict mode: no click directives, no raw HTML labels; output is DOMPurify-sanitised. */
export const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: "strict",
  theme: "dark",
} as const;

export interface MermaidApi {
  initialize(config: typeof MERMAID_CONFIG): void;
  render(id: string, source: string): Promise<{ svg: string }>;
}

declare global {
  interface Window {
    mermaid?: MermaidApi;
    __BKT_MERMAID__?: Promise<MermaidApi | null>;
  }
}

/** Whether a fenced code block's class names it a mermaid diagram. */
export function isMermaidFence(className: unknown): boolean {
  const names = Array.isArray(className) ? className : typeof className === "string" ? className.split(/\s+/) : [];
  return names.some((name) => name === "language-mermaid");
}

/** Built by ``bkt/install`` into bkt-brand (git-ignored): one copy shared by every plugin. */
export function mermaidVendorUrl(): string {
  return pluginAssetUrl("bkt-brand", "dist/vendor/mermaid.js");
}

/** Load the vendor mermaid once per page; resolves null when it was never built. */
export function loadMermaid(): Promise<MermaidApi | null> {
  if (window.__BKT_MERMAID__) return window.__BKT_MERMAID__;
  window.__BKT_MERMAID__ = new Promise((resolve) => {
    const ready = () => {
      const api = window.mermaid;
      if (!api) return resolve(null);
      api.initialize(MERMAID_CONFIG);
      resolve(api);
    };
    if (window.mermaid) return ready();
    const script = document.createElement("script");
    script.src = mermaidVendorUrl();
    script.async = true;
    script.dataset.bktMermaid = "1";
    script.onload = ready;
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return window.__BKT_MERMAID__;
}
