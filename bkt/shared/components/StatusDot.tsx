export type Status = "ok" | "busy" | "off" | "fail";

const LABELS: Record<Status, string> = { ok: "Healthy", busy: "Working", off: "Disabled", fail: "Failing" };

/** Lime when healthy, indigo while busy, grey when off, red when failing. */
export function StatusDot({ status, title, pulse }: { status: Status; title?: string; pulse?: boolean }) {
  const label = title ?? LABELS[status];
  return (
    <span
      className={`bkt-dot bkt-dot-${status}${pulse ? " bkt-pulse" : ""}`}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}
