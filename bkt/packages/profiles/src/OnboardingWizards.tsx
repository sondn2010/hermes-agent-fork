import { useEffect, useRef, useState } from "react";
import { errorMessage, profileFetch } from "@bkt/shared/api";
import { ui } from "@bkt/shared/sdk";
import { QrCode } from "./QrCode";

const POLL_MS = 2500;

interface WizardProps {
  profile: string;
  open: boolean;
  onClose: (applied: boolean) => void;
}

interface TelegramStart {
  pairing_id: string;
  suggested_username: string;
  deep_link: string;
  qr_payload: string;
  expires_at: string;
}

interface TelegramStatus {
  status: "waiting" | "ready";
  bot_username?: string | null;
  owner_user_id?: string | null;
  expires_at?: string;
}

interface ApplyResult {
  ok: boolean;
  needs_restart?: boolean;
  restart_error?: string;
}

function applyNotice(result: ApplyResult): string {
  return result.needs_restart
    ? `Saved. Restart the gateway to connect${result.restart_error ? ` (${result.restart_error})` : ""}.`
    : "Saved. The gateway is restarting with the new channel.";
}

/** Poll ``tick`` every few seconds while ``active``; stops on unmount or when ``tick`` returns true. */
function usePoll(active: boolean, tick: () => Promise<boolean>) {
  const tickRef = useRef(tick);
  tickRef.current = tick;
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (stopped) return;
      const done = await tickRef.current();
      if (!done && !stopped) timer = setTimeout(() => void loop(), POLL_MS);
    };
    timer = setTimeout(() => void loop(), POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active]);
}

export function TelegramWizard({ profile, open, onClose }: WizardProps) {
  const Button = ui("Button");
  const Dialog = ui("Dialog");
  const DialogContent = ui("DialogContent");
  const DialogHeader = ui("DialogHeader");
  const DialogTitle = ui("DialogTitle");
  const DialogDescription = ui("DialogDescription");
  const DialogFooter = ui("DialogFooter");

  const [botName, setBotName] = useState("Hermes Agent");
  const [session, setSession] = useState<TelegramStart | null>(null);
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [allowed, setAllowed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  usePoll(open && !!session && status?.status !== "ready", async () => {
    if (!session) return true;
    try {
      const next = await profileFetch<TelegramStatus>("/api/messaging/telegram/onboarding/:id", profile, {
        params: { id: session.pairing_id },
      });
      setStatus(next);
      if (next.status === "ready" && next.owner_user_id) setAllowed((a) => a || String(next.owner_user_id));
      return next.status === "ready";
    } catch (err) {
      setError(errorMessage(err));
      return true;
    }
  });

  function reset() {
    setSession(null);
    setStatus(null);
    setAllowed("");
    setError(null);
    setResult(null);
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      setSession(
        await profileFetch<TelegramStart>("/api/messaging/telegram/onboarding/start", profile, {
          body: { bot_name: botName.trim() || "Hermes Agent" },
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!session) return;
    setBusy(true);
    try {
      const ids = allowed.split(/[\s,]+/).filter(Boolean);
      const res = await profileFetch<ApplyResult>("/api/messaging/telegram/onboarding/:id/apply", profile, {
        params: { id: session.pairing_id },
        body: { allowed_user_ids: ids },
      });
      setResult(applyNotice(res));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    const applied = result !== null;
    if (session && !applied) {
      // Best effort: the server prunes expired setups on its own.
      await profileFetch("/api/messaging/telegram/onboarding/:id", profile, {
        method: "DELETE",
        params: { id: session.pairing_id },
      }).catch(() => undefined);
    }
    reset();
    onClose(applied);
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && void close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Telegram setup for {profile}</DialogTitle>
          <DialogDescription>Creates a bot through Telegram and saves its token to this profile.</DialogDescription>
        </DialogHeader>
        <div className="bkt-col">
          {error && <div className="bkt-error">{error}</div>}
          {result ? (
            <div className="bkt-success">{result}</div>
          ) : !session ? (
            <label className="bkt-col">
              <span className="bkt-muted">Bot name</span>
              <input className="bkt-input" value={botName} onChange={(e) => setBotName(e.target.value)} />
            </label>
          ) : status?.status !== "ready" ? (
            <div className="bkt-col bkt-profiles-center">
              <QrCode text={session.qr_payload || session.deep_link} label="Telegram setup QR code" />
              <a href={session.deep_link} target="_blank" rel="noopener noreferrer">
                Open in Telegram
              </a>
              <span className="bkt-muted">Waiting for Telegram… expires {new Date(session.expires_at).toLocaleTimeString()}</span>
            </div>
          ) : (
            <div className="bkt-col">
              <div>
                Bot ready: <strong>@{status.bot_username ?? session.suggested_username}</strong>
              </div>
              <label className="bkt-col">
                <span className="bkt-muted">Allowed Telegram user IDs (comma separated)</span>
                <input className="bkt-input bkt-mono" value={allowed} onChange={(e) => setAllowed(e.target.value)} />
              </label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button outlined onClick={() => void close()}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!session && (
            <Button disabled={busy} onClick={() => void start()}>
              Start
            </Button>
          )}
          {session && status?.status === "ready" && !result && (
            <Button disabled={busy || !allowed.trim()} onClick={() => void apply()}>
              Save and restart
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface WhatsAppSession {
  pairing_id: string;
  status: string;
  qr_payload: string | null;
  expires_at: string | null;
  mode: string;
  allowed_users: string;
  account_name: string | null;
  account_phone: string | null;
  error: string | null;
}

export function WhatsAppWizard({ profile, open, onClose }: WizardProps) {
  const Button = ui("Button");
  const Dialog = ui("Dialog");
  const DialogContent = ui("DialogContent");
  const DialogHeader = ui("DialogHeader");
  const DialogTitle = ui("DialogTitle");
  const DialogDescription = ui("DialogDescription");
  const DialogFooter = ui("DialogFooter");

  const [mode, setMode] = useState<"bot" | "self-chat">("bot");
  const [allowedUsers, setAllowedUsers] = useState("");
  const [resetSession, setResetSession] = useState(false);
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const terminal = session && ["connected", "error", "expired", "cancelled"].includes(session.status);

  usePoll(open && !!session && !terminal, async () => {
    if (!session) return true;
    try {
      const next = await profileFetch<WhatsAppSession>("/api/messaging/whatsapp/onboarding/:id", profile, {
        params: { id: session.pairing_id },
      });
      setSession(next);
      return ["connected", "error", "expired", "cancelled"].includes(next.status);
    } catch (err) {
      setError(errorMessage(err));
      return true;
    }
  });

  async function start() {
    setBusy(true);
    setError(null);
    try {
      setSession(
        await profileFetch<WhatsAppSession>("/api/messaging/whatsapp/onboarding/start", profile, {
          body: { mode, allowed_users: allowedUsers, reset_session: resetSession },
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!session) return;
    setBusy(true);
    try {
      const res = await profileFetch<ApplyResult>("/api/messaging/whatsapp/onboarding/:id/apply", profile, {
        params: { id: session.pairing_id },
        body: { mode, allowed_users: allowedUsers },
      });
      setResult(applyNotice(res));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    const applied = result !== null;
    if (session && !applied) {
      await profileFetch("/api/messaging/whatsapp/onboarding/:id", profile, {
        method: "DELETE",
        params: { id: session.pairing_id },
      }).catch(() => undefined);
    }
    setSession(null);
    setError(null);
    setResult(null);
    onClose(applied);
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && void close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>WhatsApp setup for {profile}</DialogTitle>
          <DialogDescription>Link a WhatsApp account by scanning the QR code from WhatsApp → Linked devices.</DialogDescription>
        </DialogHeader>
        <div className="bkt-col">
          {error && <div className="bkt-error">{error}</div>}
          {result ? (
            <div className="bkt-success">{result}</div>
          ) : !session ? (
            <>
              <label className="bkt-col">
                <span className="bkt-muted">Mode</span>
                <select className="bkt-select" value={mode} onChange={(e) => setMode(e.target.value as "bot" | "self-chat")}>
                  <option value="bot">Bot (a dedicated number others message)</option>
                  <option value="self-chat">Self-chat (message yourself)</option>
                </select>
              </label>
              <label className="bkt-col">
                <span className="bkt-muted">Allowed phone numbers (comma separated, optional)</span>
                <input className="bkt-input bkt-mono" value={allowedUsers} onChange={(e) => setAllowedUsers(e.target.value)} />
              </label>
              <label className="bkt-row">
                <input type="checkbox" checked={resetSession} onChange={(e) => setResetSession(e.target.checked)} />
                <span>Re-pair even if a device is already linked</span>
              </label>
            </>
          ) : session.status === "connected" ? (
            <div>
              Linked: <strong>{session.account_name || session.account_phone || "WhatsApp account"}</strong>
            </div>
          ) : session.status === "error" || session.status === "expired" || session.status === "cancelled" ? (
            <div className="bkt-error">{session.error || `WhatsApp setup ${session.status}.`}</div>
          ) : session.qr_payload ? (
            <div className="bkt-col bkt-profiles-center">
              <QrCode text={session.qr_payload} label="WhatsApp linking QR code" />
              <span className="bkt-muted">Scan with WhatsApp → Settings → Linked devices.</span>
            </div>
          ) : (
            <div className="bkt-muted">Starting the WhatsApp bridge…</div>
          )}
        </div>
        <DialogFooter>
          <Button outlined onClick={() => void close()}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!session && (
            <Button disabled={busy} onClick={() => void start()}>
              Start
            </Button>
          )}
          {session?.status === "connected" && !result && (
            <Button disabled={busy} onClick={() => void apply()}>
              Save and restart
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
