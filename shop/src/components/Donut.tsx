import { faNum } from "@/lib/format";

export type DonutSegment = { label: string; value: number; color: string };

/** دوناتِ توزیع وضعیت با راهنمای کنار آن */
export default function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 168,
}: {
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
  size?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="donut">
      <svg viewBox="0 0 180 180" style={{ width: size, height: size }} role="img" aria-label={centerLabel}>
        <circle cx="90" cy="90" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="18" />
        {total > 0
          ? segments.map((seg) => {
              const length = (seg.value / total) * c;
              const dash = `${length} ${c - length}`;
              const el = (
                <circle
                  key={seg.label}
                  cx="90"
                  cy="90"
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="18"
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 90 90)"
                  strokeLinecap="butt"
                />
              );
              offset += length;
              return el;
            })
          : null}
        <text
          x="90"
          y="86"
          textAnchor="middle"
          style={{ fontFamily: "var(--font)", fontWeight: 900, fontSize: 26, fill: "#fde08a" }}
        >
          {centerValue}
        </text>
        <text
          x="90"
          y="108"
          textAnchor="middle"
          style={{ fontFamily: "var(--font)", fontSize: 12, fill: "#8b8379" }}
        >
          {centerLabel}
        </text>
      </svg>

      <div className="donut-legend">
        {segments.map((seg) => (
          <div key={seg.label}>
            <i style={{ background: seg.color }} />
            <span>{seg.label}</span>
            <b>{faNum(seg.value)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
