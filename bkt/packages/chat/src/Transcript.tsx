import { useEffect, useRef } from "react";
import { MarkdownView } from "@bkt/shared/components/MarkdownView";
import type { ToolCall, TranscriptItem } from "./reducer";

function formatArgs(args: Record<string, unknown> | undefined): string {
  if (!args || !Object.keys(args).length) return "";
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

const TOOL_STATUS: Record<ToolCall["status"], string> = { running: "running", done: "done", error: "failed" };

function ToolCard({ tool }: { tool: ToolCall }) {
  const args = formatArgs(tool.args);
  return (
    <details className={`bkt-chat-tool bkt-chat-tool-${tool.status}`}>
      <summary>
        <span className="bkt-chat-tool-name bkt-mono">{tool.name}</span>
        {tool.context && <span className="bkt-chat-tool-context bkt-mono">{tool.context}</span>}
        <span className="bkt-chat-tool-status">
          {tool.progress ?? TOOL_STATUS[tool.status]}
          {typeof tool.durationS === "number" ? ` · ${tool.durationS.toFixed(1)}s` : ""}
        </span>
      </summary>
      {args && (
        <div className="bkt-chat-tool-section">
          <div className="bkt-muted">Arguments</div>
          <pre className="bkt-code">{args}</pre>
        </div>
      )}
      {tool.result && (
        <div className="bkt-chat-tool-section">
          <div className="bkt-muted">Result</div>
          <pre className="bkt-code">{tool.result}</pre>
        </div>
      )}
    </details>
  );
}

const TURN_LABEL = { complete: "Turn complete", interrupted: "Turn stopped", error: "Turn failed" } as const;

function Item({ item }: { item: TranscriptItem }) {
  switch (item.kind) {
    case "user":
      return (
        <div className="bkt-callout bkt-chat-user">
          <div className="bkt-chat-user-text">{item.text}</div>
          {item.attachments && <div className="bkt-muted">Attached: {item.attachments.join(", ")}</div>}
        </div>
      );
    case "assistant":
      return <MarkdownView className={`bkt-chat-assistant${item.streaming ? " is-streaming" : ""}`}>{item.text}</MarkdownView>;
    case "tool":
      return <ToolCard tool={item.tool} />;
    case "notice":
      return <div className={item.tone === "error" ? "bkt-error bkt-chat-notice" : "bkt-muted bkt-chat-notice"}>{item.text}</div>;
    case "turn":
      return (
        <div className={`bkt-chat-turn bkt-chat-turn-${item.status}`} role="status">
          <span aria-hidden="true">{item.status === "complete" ? "✓" : item.status === "interrupted" ? "■" : "!"}</span>
          {TURN_LABEL[item.status]}
        </div>
      );
  }
}

interface TranscriptProps {
  items: TranscriptItem[];
  activity: string | null;
  busy: boolean;
}

export function Transcript({ items, activity, busy }: TranscriptProps) {
  const end = useRef<HTMLDivElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const pinned = useRef(true);

  useEffect(() => {
    if (pinned.current) end.current?.scrollIntoView({ block: "end" });
  }, [items, activity]);

  return (
    <div
      className="bkt-chat-transcript"
      ref={box}
      aria-live="polite"
      onScroll={() => {
        const el = box.current;
        if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      {!items.length && <div className="bkt-muted bkt-chat-empty">Start a conversation. Enter sends, Shift+Enter adds a line, / runs a command.</div>}
      {items.map((item) => (
        <Item key={item.id} item={item} />
      ))}
      {busy && <div className="bkt-muted bkt-chat-activity">{activity ?? "Working…"}</div>}
      <div ref={end} />
    </div>
  );
}
