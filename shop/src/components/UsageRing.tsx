import { fmt } from "@/lib/format";
import { t as translate, type Locale } from "@/lib/i18n";

/**
 * حلقهٔ مصرف: کمان بیرونی حجم باقی‌مانده و کمان داخلی زمان باقی‌مانده را نشان می‌دهد.
 * مقدارها بین ۰ تا ۱ هستند (۱ یعنی کامل باقی مانده).
 */
export default function UsageRing({
  id,
  volume,
  time,
  centerValue,
  centerLabel,
  locale = "fa",
}: {
  id: string;
  volume: number;
  time: number;
  centerValue: string;
  centerLabel: string;
  locale?: Locale;
}) {
  const f = fmt(locale);
  const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
  const rOuter = 58;
  const rInner = 43;
  const cOuter = 2 * Math.PI * rOuter;
  const cInner = 2 * Math.PI * rInner;
  const v = clamp(volume);
  const t = clamp(time);

  return (
    <div>
      <svg
        className="usage-ring"
        viewBox="0 0 140 140"
        role="img"
        aria-label={`${centerLabel}: ${centerValue}`}
      >
        <defs>
          <linearGradient id={`gold-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--gold-light)" />
            <stop offset="100%" stopColor="var(--gold-deep)" />
          </linearGradient>
          <linearGradient id={`green-${id}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#2f9e63" />
            <stop offset="100%" stopColor="#5ee6a0" />
          </linearGradient>
        </defs>

        <circle className="ring-track" cx="70" cy="70" r={rOuter} strokeWidth="10" />
        <circle
          className="ring-bar ring-bar--volume"
          cx="70"
          cy="70"
          r={rOuter}
          strokeWidth="10"
          stroke={`url(#gold-${id})`}
          strokeDasharray={`${(cOuter * v).toFixed(1)} ${cOuter.toFixed(1)}`}
          transform="rotate(-90 70 70)"
        />

        <circle className="ring-track" cx="70" cy="70" r={rInner} strokeWidth="7" />
        <circle
          className="ring-bar ring-bar--time"
          cx="70"
          cy="70"
          r={rInner}
          strokeWidth="7"
          stroke={`url(#green-${id})`}
          strokeDasharray={`${(cInner * t).toFixed(1)} ${cInner.toFixed(1)}`}
          transform="rotate(-90 70 70)"
        />

        <text className="ring-value" x="70" y="70" textAnchor="middle">
          {centerValue}
        </text>
        <text className="ring-label" x="70" y="90" textAnchor="middle">
          {centerLabel}
        </text>
      </svg>
      <div className="ring-legend">
        <span>
          <i className="lg-volume" />
          {translate(locale, "profile.ringVolume")} {f.num(Math.round(v * 100))}٪
        </span>
        <span>
          <i className="lg-time" />
          {translate(locale, "profile.ringTime")} {f.num(Math.round(t * 100))}٪
        </span>
      </div>
    </div>
  );
}
