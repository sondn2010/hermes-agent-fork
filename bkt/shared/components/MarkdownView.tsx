import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isMermaidFence, loadMermaid } from "../mermaid";

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function textOf(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function MermaidBlock({ source }: { source: string }) {
  const id = `bkt-mermaid-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void loadMermaid()
      .then(async (api) => {
        if (!api) throw new Error("mermaid unavailable");
        const out = await api.render(id, source);
        if (live) setSvg(out.svg);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [id, source]);

  if (svg && !failed) {
    // Output of mermaid's strict mode, which runs DOMPurify over the SVG.
    return <div className="bkt-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
  }
  return (
    <pre className="bkt-code">
      <code>{source}</code>
    </pre>
  );
}

const components: Components = {
  pre({ node, children }) {
    const code = (node as HastNode | undefined)?.children?.find((c) => c.type === "element" && c.tagName === "code");
    if (code && isMermaidFence(code.properties?.className)) {
      return <MermaidBlock source={textOf(code).replace(/\n$/, "")} />;
    }
    return <pre className="bkt-code">{children}</pre>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  },
};

interface MarkdownViewProps {
  children: string;
  className?: string;
  /** Rendered after the markdown, inside the same container. */
  footer?: ReactNode;
}

/** GFM markdown without raw HTML; agent and file content is untrusted. */
export function MarkdownView({ children, className, footer }: MarkdownViewProps) {
  return (
    <div className={className ? `bkt-markdown ${className}` : "bkt-markdown"}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {children}
      </ReactMarkdown>
      {footer}
    </div>
  );
}
