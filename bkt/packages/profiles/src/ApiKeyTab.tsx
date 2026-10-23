import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { errorMessage } from "@bkt/shared/api";
import { ui } from "@bkt/shared/sdk";
import { advertisedModel, apiKeySamples } from "./api-key-samples";
import { deleteApiKey, generateApiKey, getApiKey, restartGateway, restartNeeded } from "./profile-api";
import type { ApiKeyInfo, WorkbenchTabProps } from "./profile-api";

type Pending = "generate" | "rotate" | "delete" | "restart" | null;

const SOURCE_LABEL: Record<ApiKeyInfo["source"], string> = {
  env: ".env (API_SERVER_KEY)",
  config: "config.yaml (platforms.api_server.key)",
  none: "not set",
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const Button = ui("Button");
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <Button
      size="sm"
      outlined
      onClick={() =>
        navigator.clipboard
          .writeText(text)
          .then(() => setState("copied"))
          .catch(() => setState("failed"))
      }
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed; select the text" : label}
    </Button>
  );
}

function KeyFacts({ info }: { info: ApiKeyInfo }) {
  let strength: ReactNode = "—";
  if (info.present) {
    strength = info.strong
      ? <span className="bkt-badge bkt-badge-ok">usable</span>
      : <span className="bkt-badge bkt-badge-warn">too weak: the API server refuses to start</span>;
  }
  return (
    <dl className="bkt-profiles-facts">
      <dt>Key</dt>
      <dd className="bkt-mono">{info.present ? info.masked : "—"}</dd>
      <dt>Source</dt>
      <dd>{SOURCE_LABEL[info.source]}</dd>
      <dt>Strength</dt>
      <dd>{strength}</dd>
    </dl>
  );
}

function RestartNotice({ shared, endpoint, running, busy, onRestart }: {
  shared: boolean;
  endpoint: string;
  running: boolean;
  busy: boolean;
  onRestart: () => void;
}) {
  const Button = ui("Button");
  if (shared) {
    return (
      <div className="bkt-callout">
        Served by the default profile's shared gateway at <span className="bkt-mono">{endpoint}</span>. A new key takes
        effect immediately; no restart is needed.
      </div>
    );
  }
  return (
    <div className="bkt-callout">
      A new or rotated key takes effect after this profile's gateway restarts.
      {running ? (
        <>
          {" "}
          <Button size="sm" outlined disabled={busy} onClick={onRestart}>
            Restart gateway
          </Button>
        </>
      ) : (
        " The gateway is not running; it picks the key up when started."
      )}
    </div>
  );
}

function EndpointPanel({ baseUrl, samples }: { baseUrl: string; samples: { curl: string; python: string } }) {
  return (
    <div className="bkt-panel bkt-col">
      <h2 className="bkt-profiles-subtitle">OpenAI-compatible endpoint</h2>
      <div className="bkt-row">
        <span className="bkt-mono bkt-grow bkt-profiles-url">{baseUrl}</span>
        <CopyButton text={baseUrl} label="Copy URL" />
      </div>
      <div className="bkt-muted">Export the key as API_SERVER_KEY in the client's environment; the samples read it from there.</div>
      <div className="bkt-col">
        <div className="bkt-row">
          <span className="bkt-muted bkt-grow">curl</span>
          <CopyButton text={samples.curl} label="Copy" />
        </div>
        <pre className="bkt-code">{samples.curl}</pre>
        <div className="bkt-row">
          <span className="bkt-muted bkt-grow">Python (openai)</span>
          <CopyButton text={samples.python} label="Copy" />
        </div>
        <pre className="bkt-code">{samples.python}</pre>
      </div>
    </div>
  );
}

export function ApiKeyTab({ profile, reloadProfiles }: WorkbenchTabProps) {
  const Button = ui("Button");
  const ConfirmDialog = ui("ConfirmDialog");
  const Dialog = ui("Dialog");
  const DialogContent = ui("DialogContent");
  const DialogHeader = ui("DialogHeader");
  const DialogTitle = ui("DialogTitle");
  const DialogDescription = ui("DialogDescription");
  const DialogFooter = ui("DialogFooter");
  const name = profile.name;

  const [info, setInfo] = useState<ApiKeyInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  // The full key lives only in this state while the reveal dialog is open.
  const [revealed, setRevealed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInfo(await getApiKey(name));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [name]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(kind: Exclude<Pending, null>) {
    setBusy(true);
    setNotice(null);
    try {
      if (kind === "generate" || kind === "rotate") {
        const result = await generateApiKey(name, kind === "rotate");
        const { key, ...rest } = result;
        setInfo(rest);
        setRevealed(key);
      } else if (kind === "delete") {
        setInfo(await deleteApiKey(name));
        setNotice("API server key removed from this profile's .env.");
      } else {
        await restartGateway(name);
        setNotice("Gateway restart started.");
        await reloadProfiles();
      }
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!info) return error ? <div className="bkt-error">{error}</div> : <div className="bkt-muted">Loading…</div>;

  const shared = !restartNeeded(info.endpoint);
  const configWins = info.source === "config";
  const samples = apiKeySamples(info.base_url, shared ? "hermes-agent" : advertisedModel(name));

  const confirmText: Record<Exclude<Pending, null>, { title: string; description: string; label: string }> = {
    generate: {
      title: "Generate an API server key?",
      description: `A new random key is saved to ${name}'s .env and shown once.`,
      label: "Generate",
    },
    rotate: {
      title: "Rotate the API server key?",
      description: `Clients using the current key of ${name} stop working once the new key is in effect.`,
      label: "Rotate",
    },
    delete: {
      title: "Remove the API server key?",
      description: `The API server of ${name} refuses to start (or rejects requests) without a key.`,
      label: "Remove",
    },
    restart: {
      title: "Restart the gateway?",
      description: `Restarts ${name}'s gateway now; live sessions are interrupted.`,
      label: "Restart",
    },
  };
  const current = pending ? confirmText[pending] : null;

  return (
    <div className="bkt-col">
      {error && <div className="bkt-error">{error}</div>}
      {notice && <div className="bkt-success">{notice}</div>}

      <div className="bkt-panel bkt-col">
        <h2 className="bkt-profiles-subtitle">API server key</h2>
        <KeyFacts info={info} />
        {configWins && (
          <div className="bkt-warning">
            This profile's key is set in config.yaml (<span className="bkt-mono">platforms.api_server.key</span>). A
            generated .env key would replace it for every client, so generation is disabled here. Remove the config.yaml
            key to manage it from this page.
          </div>
        )}
        <div className="bkt-row">
          {!info.present || configWins ? (
            <Button size="sm" disabled={busy || configWins} onClick={() => setPending("generate")}>
              Generate key
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => setPending("rotate")}>
              Rotate key
            </Button>
          )}
          {info.present && info.source === "env" && (
            <Button size="sm" outlined destructive disabled={busy} onClick={() => setPending("delete")}>
              Remove
            </Button>
          )}
        </div>
        <RestartNotice
          shared={shared}
          endpoint={info.endpoint}
          running={!!profile.gateway_running}
          busy={busy}
          onRestart={() => setPending("restart")}
        />
      </div>

      <EndpointPanel baseUrl={info.base_url} samples={samples} />

      <ConfirmDialog
        open={current !== null}
        destructive={pending === "delete" || pending === "rotate"}
        title={current?.title ?? ""}
        description={current?.description}
        confirmLabel={current?.label}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const kind = pending;
          setPending(null);
          if (kind) void act(kind);
        }}
      />

      <Dialog open={revealed !== null} onOpenChange={(open: boolean) => !open && setRevealed(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New API server key for {name}</DialogTitle>
            <DialogDescription>Copy it now. It is not shown again; the page only keeps the masked form.</DialogDescription>
          </DialogHeader>
          <div className="bkt-col">
            <code className="bkt-code bkt-profiles-secret" aria-label="API server key">
              {revealed}
            </code>
            {revealed && <CopyButton text={revealed} label="Copy key" />}
            {!shared && <div className="bkt-muted">Restart the gateway of {name} to start using this key.</div>}
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
