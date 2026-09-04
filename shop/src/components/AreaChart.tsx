import { faNum } from "@/lib/format";

export type ChartPoint = { label: string; value: number; title?: string };

/**
 * نمودار ناحیه‌ای ساده و سبک (بدون کتابخانه) با خط نرم و گرادیان طلایی.
 */
export default function AreaChart({
  id,
  points,
  height = 160,
  formatValue = (v: number) => faNum(Math.round(v)),
}: {
  id: string;
  points: ChartPoint[];
  height?: number;
  formatValue?: (value: number) => string;
}) {
  if (!points.length) return null;

  const W = 600;
  const H = height;
  const padY = 16;
  const max = Math.max(...points.map((p) => p.value), 1);
  const stepX = points.length > 1 ? W / (points.length - 1) : W;

  const coords = points.map((p, i) => ({
    x: i * stepX,
    y: H - padY - (p.value / max) * (H - padY * 2),
    ...p,
  }));

  // خط نرم با نقاط میانی
  let line = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i += 1) {
    const prev = coords[i - 1];
    const cur = coords[i];
    const midX = (prev.x + cur.x) / 2;
    line += ` C ${midX} ${prev.y}, ${midX} ${cur.y}, ${cur.x} ${cur.y}`;
  }
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;

  return (
    <div className="area-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="نمودار">
        <defs>
          <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(var(--accent-rgb), 0.42)" />
            <stop offset="100%" stopColor="rgba(var(--accent-rgb), 0)" />
          </linearGradient>
          <linearGradient id={`line-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--gold-light)" />
            <stop offset="100%" stopColor="var(--gold-deep)" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((r) => (
          <line
            key={r}
            x1="0"
            x2={W}
            y1={H * r}
            y2={H * r}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        ))}

        <path d={area} fill={`url(#area-${id})`} />
        <path d={line} fill="none" stroke={`url(#line-${id})`} strokeWidth="2.5" strokeLinecap="round" />

        {coords.map((c) => (
          <g key={`${c.label}-${c.x}`}>
            <circle
              cx={c.x}
              cy={c.y}
              r="3.5"
              strokeWidth="2"
              style={{ fill: "var(--bg-2)", stroke: "var(--gold)" }}
            />
            <title>{c.title ?? `${c.label}: ${formatValue(c.value)}`}</title>
          </g>
        ))}
      </svg>
      <div className="area-labels">
        {points.map((p, i) => (
          <span key={`${p.label}-${i}`}>{i % Math.ceil(points.length / 7) === 0 ? p.label : ""}</span>
        ))}
      </div>
    </div>
  );
}
