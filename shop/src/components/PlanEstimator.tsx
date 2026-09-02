"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fmt } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";

type PlanOption = {
  id: string;
  title: string;
  volumeGb: number;
  days: number;
  priceToman: number;
};

/** مصرف تقریبی هر فعالیت به گیگابایت در ساعت */
const PROFILES = [
  { key: "browse", icon: "💬", perHour: 0.15 },
  { key: "social", icon: "📱", perHour: 0.4 },
  { key: "video", icon: "🎬", perHour: 1.5 },
  { key: "game", icon: "🎮", perHour: 0.12 },
];

export default function PlanEstimator({
  plans,
  locale = "fa",
}: {
  plans: PlanOption[];
  locale?: Locale;
}) {
  const [profile, setProfile] = useState(PROFILES[0].key);
  const [hours, setHours] = useState(2);
  const [devices, setDevices] = useState(1);

  const f = fmt(locale);
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);

  const perHour = PROFILES.find((p) => p.key === profile)?.perHour ?? 0.15;
  const monthlyGb = useMemo(
    () => Math.max(1, Math.round(perHour * hours * 30 * devices)),
    [perHour, hours, devices],
  );

  const suggestion = useMemo(() => {
    const limited = plans
      .filter((p) => p.volumeGb > 0 && p.volumeGb >= monthlyGb)
      .sort((a, b) => a.priceToman - b.priceToman)[0];
    if (limited) return limited;
    return plans.filter((p) => p.volumeGb === 0).sort((a, b) => a.priceToman - b.priceToman)[0] ?? null;
  }, [plans, monthlyGb]);

  return (
    <div className="card estimator">
      <div className="card-title">
        <h3>🧮 {tr("estimator.title")}</h3>
        <span className="badge badge-info">{tr("estimator.monthly")}</span>
      </div>

      <div className="field">
        <label>{tr("estimator.usage")}</label>
        <div className="subject-chips">
          {PROFILES.map((p) => (
            <button
              type="button"
              key={p.key}
              className={`chip${profile === p.key ? " is-active" : ""}`}
              onClick={() => setProfile(p.key)}
            >
              {p.icon} {tr(`estimator.${p.key}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="est-hours">
            {tr("estimator.hours")} <b className="gold">{f.num(hours)}</b>
          </label>
          <input
            id="est-hours"
            type="range"
            min={1}
            max={12}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="est-devices">
            {tr("estimator.devices")} <b className="gold">{f.num(devices)}</b>
          </label>
          <input
            id="est-devices"
            type="range"
            min={1}
            max={5}
            value={devices}
            onChange={(e) => setDevices(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="estimator-result">
        <div>
          <span>{tr("estimator.monthly")}</span>
          <b>{f.volume(monthlyGb)}</b>
        </div>
        {suggestion ? (
          <div className="estimator-plan">
            <span>{tr("estimator.suggested")}</span>
            <b>{suggestion.title}</b>
            <small>
              {f.volume(suggestion.volumeGb)} · {f.money(suggestion.priceToman)}
            </small>
            <Link className="btn btn-sm btn-primary" href={`/checkout?plan=${suggestion.id}`}>
              {tr("estimator.seePlan")}
            </Link>
          </div>
        ) : (
          <div className="estimator-plan">
            <span>{tr("estimator.none")}</span>
          </div>
        )}
      </div>

      <p className="field-hint">{tr("estimator.subtitle")}</p>
    </div>
  );
}
