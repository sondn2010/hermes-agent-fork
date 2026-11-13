// Prompt templates: {{name}} placeholders, filled before a prompt is sent to chat.
const VARIABLE_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*\}\}/g;

export interface PromptDraft {
  title: string;
  body: string;
  tags: string[];
}

export interface Prompt extends PromptDraft {
  id: string;
  variables: string[];
  updated_at: number;
}

/** Placeholder names in first-seen order (mirrors the backend's ``variables_of``). */
export function variablesOf(body: string): string[] {
  return [...new Set([...body.matchAll(VARIABLE_RE)].map((m) => m[1]))];
}

/** Replace every placeholder with its value; unknown names stay as written. */
export function fillVariables(body: string, values: Record<string, string>): string {
  return body.replace(VARIABLE_RE, (whole, name: string) => (name in values ? values[name] : whole));
}

export function parseTags(text: string): string[] {
  return [...new Set(text.split(",").map((t) => t.trim()).filter(Boolean))];
}

export function matchesFilter(prompt: Prompt, query: string, tag: string | null): boolean {
  if (tag && !prompt.tags.includes(tag)) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return prompt.title.toLowerCase().includes(q) || prompt.body.toLowerCase().includes(q)
    || prompt.tags.some((t) => t.toLowerCase().includes(q));
}

export const EXPORT_FORMAT = "bkt-prompts/v1";

export function exportJson(prompts: Prompt[]): string {
  const items = prompts.map(({ title, body, tags }) => ({ title, body, tags }));
  return JSON.stringify({ format: EXPORT_FORMAT, prompts: items }, null, 2);
}

/** Accepts this plugin's export or a bare array of ``{title, body, tags?}``. */
export function parseImport(text: string): PromptDraft[] {
  const data: unknown = JSON.parse(text);
  const list = Array.isArray(data) ? data : (data as { prompts?: unknown })?.prompts;
  if (!Array.isArray(list)) throw new Error("Expected a JSON array of prompts or a bkt-prompts export");
  return list.map((item, i) => {
    const { title, body, tags } = (item ?? {}) as Record<string, unknown>;
    if (typeof title !== "string" || typeof body !== "string") throw new Error(`Prompt ${i + 1} needs a title and a body`);
    const tagList = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [];
    return { title, body, tags: tagList };
  });
}
