import { useCallback, useEffect, useState } from "react";
import { errorMessage, profileFetch } from "@bkt/shared/api";
import { ui } from "@bkt/shared/sdk";
import type { ApprovedUser, PendingPairing, WorkbenchTabProps } from "./profile-api";

interface PairingResponse {
  pending: PendingPairing[];
  approved: ApprovedUser[];
}

type Confirm = { kind: "revoke"; user: ApprovedUser } | { kind: "clear" } | null;

function PendingTable({ rows, busy, onApprove }: {
  rows: PendingPairing[];
  busy: boolean;
  onApprove: (row: PendingPairing) => void;
}) {
  const Button = ui("Button");
  return (
    <table className="bkt-profiles-table">
      <thead>
        <tr>
          <th>Platform</th>
          <th>User</th>
          <th>Age</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.platform}:${row.request_id || row.user_id}`}>
            <td>{row.platform}</td>
            <td>
              {row.user_name || "—"} <span className="bkt-muted bkt-mono">{row.user_id}</span>
            </td>
            <td className="bkt-muted">{row.age_minutes} min</td>
            <td>
              {row.request_id ? (
                <Button size="sm" disabled={busy} onClick={() => onApprove(row)}>
                  Approve
                </Button>
              ) : (
                <span className="bkt-muted">Approve by code below</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ApprovedTable({ rows, busy, onRevoke }: {
  rows: ApprovedUser[];
  busy: boolean;
  onRevoke: (user: ApprovedUser) => void;
}) {
  const Button = ui("Button");
  return (
    <table className="bkt-profiles-table">
      <thead>
        <tr>
          <th>Platform</th>
          <th>User</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((user) => (
          <tr key={`${user.platform}:${user.user_id}`}>
            <td>{user.platform}</td>
            <td>
              {user.user_name || "—"} <span className="bkt-muted bkt-mono">{user.user_id}</span>
            </td>
            <td>
              <Button size="sm" outlined destructive disabled={busy} onClick={() => onRevoke(user)}>
                Revoke
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ApproveByCode({ platforms, busy, onApprove }: {
  platforms: string[];
  busy: boolean;
  onApprove: (platform: string, code: string) => Promise<void>;
}) {
  const Button = ui("Button");
  const [platform, setPlatform] = useState("");
  const [code, setCode] = useState("");
  const ready = !!platform.trim() && !!code.trim();
  return (
    <form
      className="bkt-panel bkt-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) void onApprove(platform.trim(), code.trim()).then(() => setCode(""));
      }}
    >
      <span className="bkt-profiles-subtitle">Approve by code</span>
      <input
        className="bkt-input bkt-profiles-narrow"
        aria-label="Platform"
        placeholder="platform (e.g. telegram)"
        list="bkt-profiles-pairing-platforms"
        value={platform}
        onChange={(e) => setPlatform(e.target.value)}
      />
      <datalist id="bkt-profiles-pairing-platforms">
        {platforms.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <input
        className="bkt-input bkt-profiles-narrow bkt-mono"
        aria-label="Pairing code"
        placeholder="code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <Button size="sm" type="submit" disabled={busy || !ready}>
        Approve
      </Button>
    </form>
  );
}

export function PairingTab({ profile }: WorkbenchTabProps) {
  const Button = ui("Button");
  const ConfirmDialog = ui("ConfirmDialog");
  const name = profile.name;

  const [data, setData] = useState<PairingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const load = useCallback(async () => {
    try {
      setData(await profileFetch<PairingResponse>("/api/pairing", name));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [name]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      setNotice(done);
      setError(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
      setNotice(null);
    } finally {
      setBusy(false);
    }
  }

  const approveRequest = (row: PendingPairing) =>
    run(
      () =>
        profileFetch("/api/pairing/approve", name, { body: { platform: row.platform, request_id: row.request_id } }),
      `Approved ${row.user_name || row.user_id} on ${row.platform}.`,
    );

  const approveCode = (platform: string, code: string) =>
    run(
      () => profileFetch("/api/pairing/approve", name, { body: { platform, code } }),
      `Approved code ${code.toUpperCase()} on ${platform}.`,
    );

  const platforms = [...new Set([...(data?.pending ?? []), ...(data?.approved ?? [])].map((r) => r.platform))];

  return (
    <div className="bkt-col">
      <p className="bkt-muted">
        Users who message a bot of <strong>{name}</strong> receive a one-time code; approving it here grants access in
        this profile only.
      </p>
      {error && <div className="bkt-error">{error}</div>}
      {notice && <div className="bkt-success">{notice}</div>}

      <div className="bkt-panel bkt-col">
        <div className="bkt-row">
          <h2 className="bkt-profiles-subtitle bkt-grow">Pending requests</h2>
          <Button size="sm" outlined onClick={() => void load()}>
            Refresh
          </Button>
          <Button size="sm" outlined destructive disabled={busy || !data?.pending.length} onClick={() => setConfirm({ kind: "clear" })}>
            Clear all
          </Button>
        </div>
        {!data && !error && <div className="bkt-muted">Loading…</div>}
        {data && !data.pending.length && <div className="bkt-muted">No pending requests.</div>}
        {data && data.pending.length > 0 && <PendingTable rows={data.pending} busy={busy} onApprove={(row) => void approveRequest(row)} />}
      </div>

      <ApproveByCode platforms={platforms} busy={busy} onApprove={approveCode} />

      <div className="bkt-panel bkt-col">
        <h2 className="bkt-profiles-subtitle">Approved users</h2>
        {data && !data.approved.length && <div className="bkt-muted">No approved users.</div>}
        {data && data.approved.length > 0 && (
          <ApprovedTable rows={data.approved} busy={busy} onRevoke={(user) => setConfirm({ kind: "revoke", user })} />
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        destructive
        title={confirm?.kind === "revoke" ? "Revoke access?" : "Clear pending requests?"}
        description={
          confirm?.kind === "revoke"
            ? `${confirm.user.user_name || confirm.user.user_id} loses access to ${name} on ${confirm.user.platform}.`
            : `Every pending pairing request of ${name} is discarded.`
        }
        confirmLabel={confirm?.kind === "revoke" ? "Revoke" : "Clear"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const current = confirm;
          setConfirm(null);
          if (current?.kind === "revoke") {
            void run(
              () =>
                profileFetch("/api/pairing/revoke", name, {
                  body: { platform: current.user.platform, user_id: current.user.user_id },
                }),
              `Revoked ${current.user.user_name || current.user.user_id}.`,
            );
          } else if (current?.kind === "clear") {
            void run(() => profileFetch("/api/pairing/clear-pending", name, { method: "POST" }), "Cleared pending requests.");
          }
        }}
      />
    </div>
  );
}
