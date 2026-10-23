import { useMemo } from "react";
import { encodeQr } from "./qr";

const QUIET_ZONE = 4;

/** SVG QR symbol for ``text`` (dark modules on white, with the standard quiet zone). */
export function QrCode({ text, size = 240, label }: { text: string; size?: number; label: string }) {
  const { path, dimension } = useMemo(() => {
    const matrix = encodeQr(text);
    const parts: string[] = [];
    matrix.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) parts.push(`M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`);
      }),
    );
    return { path: parts.join(""), dimension: matrix.length + QUIET_ZONE * 2 };
  }, [text]);

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${dimension} ${dimension}`}
      shapeRendering="crispEdges"
      className="bkt-profiles-qr"
    >
      <rect width={dimension} height={dimension} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
