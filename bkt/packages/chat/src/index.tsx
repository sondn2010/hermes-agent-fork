import { useCallback, useEffect, useRef, useState } from "react";
import { useProfiles } from "@bkt/shared/api";
import { StatusDot } from "@bkt/shared/components/StatusDot";
import type { Status } from "@bkt/shared/components/StatusDot";
import { bundleProfile, registerPlugin } from "@bkt/shared/sdk";
import { ApprovalDialog } from "./ApprovalDialog";
import { ClarifyDialog } from "./ClarifyDialog";
import { Composer } from "./Composer";
import { SessionRail } from "./SessionRail";
import type { ModelChoice } from "./SessionRail";
import { Transcript } from "./Transcript";
import type { ConnectionStatus } from "./reducer";
import { useGatewaySession } from "./useGatewaySession";

interface ModelGroup {
  provider: string;
  label: string;
  models: string[];
}

function connectionView(status: ConnectionStatus): { dot: Status; label: string } {
  switch (status.state) {
    case "open":
      return { dot: "ok", label: "Connected" };
    case "connecting":
      return { dot: "busy", label: "Connecting…" };
    case "reconnecting":
      return { dot: "fail", label: `Reconnecting (attempt ${status.attempt}${status.delayMs ? `, in ${Math.ceil(status.delayMs / 1000)}s` : ""})` };
    case "closed":
      return { dot: "off", label: "Disconnected" };
  }
}

function ChatPage() {
  const { profiles } = useProfiles();
  const chosen = useRef(false);
  const [profile, setProfile] = useState(() => bundleProfile() || "default");
  const [model, setModel] = useState<ModelChoice | null>(null);
  const [models, setModels] = useState<ModelGroup[]>([]);
  const session = useGatewaySession(profile);
  const { state } = session;

  const pickProfile = useCallback((next: string) => {
    chosen.current = true;
    setModel(null);
    setProfile(next);
  }, []);

  // Without a host-selected profile, follow the active one once the list arrives.
  useEffect(() => {
    if (chosen.current || bundleProfile() || !profiles.length) return;
    const active = profiles.find((p) => p.is_active) ?? profiles.find((p) => p.is_default);
    if (active) setProfile(active.name);
  }, [profiles]);

  const open = state.connection.state === "open";
  const { modelOptions } = session;
  useEffect(() => {
    if (!open) return;
    let live = true;
    modelOptions()
      .then((result) => {
        if (!live) return;
        setModels(
          (result.providers ?? [])
            .filter((p) => p.models?.length && p.authenticated !== false)
            .map((p) => ({ provider: p.slug, label: p.name || p.slug, models: p.models ?? [] })),
        );
      })
      .catch(() => live && setModels([]));
    return () => {
      live = false;
    };
  }, [open, profile, modelOptions]);

  const connection = connectionView(state.connection);
  const approval = state.approvals[0] ?? null;

  return (
    <div className="bkt-page bkt-chat">
      <div className="bkt-split bkt-chat-layout">
        <SessionRail
          profile={profile}
          profiles={profiles}
          onProfile={pickProfile}
          activeStoredId={state.storedId}
          version={state.sessionsVersion}
          onResume={(id, title) => void session.resume(id, title)}
          onNew={session.newSession}
          models={models}
          model={model}
          onModel={setModel}
          currentModel={state.model}
        />
        <section className="bkt-col bkt-chat-main">
          <header className="bkt-row bkt-chat-header">
            <StatusDot status={connection.dot} title={connection.label} pulse={state.busy} />
            <strong className="bkt-grow bkt-chat-title">{state.title ?? (state.storedId ? state.storedId : "New chat")}</strong>
            <span className="bkt-badge">{state.profile}</span>
            {state.model && <span className="bkt-badge bkt-mono">{state.model}</span>}
            <span className="bkt-muted">{connection.label}</span>
          </header>
          <Transcript items={state.items} activity={state.activity} busy={state.busy} />
          <Composer
            busy={state.busy}
            disabled={!open}
            onSend={(text, files) => session.submit(text, files, model ?? {})}
            onStop={() => void session.interrupt()}
            onPrefillProfile={pickProfile}
          />
        </section>
      </div>
      <ApprovalDialog
        card={approval}
        queued={Math.max(0, state.approvals.length - 1)}
        otherSession={!!approval && !!state.sessionId && approval.sessionId !== state.sessionId}
        onAnswer={(card, choice) => void session.answerApproval(card, choice)}
      />
      {!approval && (
        <ClarifyDialog
          card={state.clarify}
          otherSession={!!state.clarify && !!state.sessionId && state.clarify.sessionId !== state.sessionId}
          onAnswer={session.answerClarify}
        />
      )}
    </div>
  );
}

registerPlugin("bkt-chat", ChatPage);
