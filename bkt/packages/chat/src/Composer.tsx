import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { takeChatPrefill } from "@bkt/shared/prefill";
import { ui } from "@bkt/shared/sdk";
import { MAX_ATTACHMENT_BYTES } from "./useGatewaySession";

interface ComposerProps {
  busy: boolean;
  disabled: boolean;
  /** Resolves true when the message was accepted (the draft is then cleared). */
  onSend: (text: string, files: File[]) => Promise<boolean>;
  onStop: () => void;
  /** A prompt handed over from bkt-prompts may name the profile it was written for. */
  onPrefillProfile: (profile: string) => void;
}

export function Composer({ busy, disabled, onSend, onStop, onPrefillProfile }: ComposerProps) {
  const Button = ui("Button");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Read once: a later mount must not re-apply the same hand-off.
    const prefill = takeChatPrefill();
    if (!prefill) return;
    setText(prefill.text);
    if (prefill.profile) onPrefillProfile(prefill.profile);
    input.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design
  }, []);

  const send = async () => {
    if (sending || disabled || (!text.trim() && !files.length)) return;
    setSending(true);
    try {
      if (await onSend(text, files)) {
        setText("");
        setFiles([]);
      }
    } finally {
      setSending(false);
      input.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const tooBig = picked.filter((f) => f.size > MAX_ATTACHMENT_BYTES).map((f) => f.name);
    setProblem(tooBig.length ? `Larger than 25 MB: ${tooBig.join(", ")}` : null);
    setFiles((current) => [...current, ...picked.filter((f) => f.size <= MAX_ATTACHMENT_BYTES)]);
  };

  return (
    <div className="bkt-chat-composer bkt-panel">
      {files.length > 0 && (
        <div className="bkt-row">
          {files.map((file, index) => (
            <span key={`${file.name}-${index}`} className="bkt-badge">
              {file.name}
              <button
                type="button"
                className="bkt-chat-chip-remove"
                aria-label={`Remove ${file.name}`}
                onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {problem && <div className="bkt-error">{problem}</div>}
      <textarea
        ref={input}
        className="bkt-input bkt-chat-input"
        value={text}
        rows={3}
        placeholder={disabled ? "Connecting…" : "Message the agent (Enter to send, Shift+Enter for a new line, /command)"}
        aria-label="Message"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          if (e.clipboardData.files.length) {
            e.preventDefault();
            addFiles(e.clipboardData.files);
          }
        }}
      />
      <div className="bkt-row">
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button type="button" outlined size="sm" onClick={() => picker.current?.click()} disabled={disabled}>
          Attach
        </Button>
        <span className="bkt-grow" />
        {busy && (
          <Button type="button" destructive size="sm" onClick={onStop}>
            Stop
          </Button>
        )}
        <Button type="button" size="sm" onClick={() => void send()} disabled={disabled || sending || (!text.trim() && !files.length)}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
