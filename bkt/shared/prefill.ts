// Hand-off from bkt-prompts to bkt-chat: one prompt text, read once by the next composer mount.
export const PREFILL_KEY = "bkt-chat:prefill";

export interface ChatPrefill {
  text: string;
  profile?: string;
}

export function writeChatPrefill(prefill: ChatPrefill): void {
  try {
    sessionStorage.setItem(PREFILL_KEY, JSON.stringify(prefill));
  } catch {
    // sessionStorage unavailable: the user can still paste the prompt by hand.
  }
}

export function takeChatPrefill(): ChatPrefill | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PREFILL_KEY);
    sessionStorage.removeItem(PREFILL_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ChatPrefill>;
    if (typeof parsed.text !== "string" || !parsed.text) return null;
    return typeof parsed.profile === "string" ? { text: parsed.text, profile: parsed.profile } : { text: parsed.text };
  } catch {
    return null;
  }
}
