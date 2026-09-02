"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { faNum, toman } from "@/lib/format";

type PlanOption = {
  id: string;
  title: string;
  volumeGb: number;
  days: number;
  priceToman: number;
};

/** مصرف تقریبی هر فعالیت به گیگابایت در ساعت */
const PROFILES = [
  { key: "browse", label: "وب‌گردی و پیام‌رسان", icon: "💬", perHour: 0.15 },
  { key: "social", label: "شبکه‌های اجتماعی", icon: "📱", perHour: 0.4 },
  { key: "video", label: "تماشای ویدیو (HD)", icon: "🎬", perHour: 1.5 },
  { key: "game", label: "بازی آنلاین", icon: "🎮", perHour: 0.12 },
];

export default function PlanEstimator({ plans }: { plans: PlanOption[] }) {
  const [profile, setProfile] = useState(PROFILES[0].key);
  const [hours, setHours] = useState(2);
  const [devices, setDevices] = useState(1);

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
        <h3>🧮 چقدر حجم لازم دارید؟</h3>
        <span className="badge badge-info">تخمین ماهانه</span>
      </div>

      <div className="field">
        <label>بیشتر برای چه کاری استفاده می‌کنید؟</label>
        <div className="subject-chips">
          {PROFILES.map((p) => (
            <button
              type="button"
              key={p.key}
              className={`chip${profile === p.key ? " is-active" : ""}`}
              onClick={() => setProfile(p.key)}
            >
              {p.icon} {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="est-hours">
            روزی چند ساعت؟ <b className="gold">{faNum(hours)} ساعت</b>
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
            چند دستگاه؟ <b className="gold">{faNum(devices)} دستگاه</b>
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
          <span>مصرف تقریبی شما</span>
          <b>{faNum(monthlyGb)} گیگابایت در ماه</b>
        </div>
        {suggestion ? (
          <div className="estimator-plan">
            <span>پلن پیشنهادی</span>
            <b>{suggestion.title}</b>
            <small>
              {suggestion.volumeGb > 0 ? `${faNum(suggestion.volumeGb)} گیگ` : "نامحدود"} ·{" "}
              {toman(suggestion.priceToman)}
            </small>
            <Link className="btn btn-sm btn-primary" href={`/checkout?plan=${suggestion.id}`}>
              خرید همین پلن
            </Link>
          </div>
        ) : (
          <div className="estimator-plan">
            <span>پلن مناسبی پیدا نشد</span>
            <small>با پشتیبانی تماس بگیرید تا پلن اختصاصی بسازیم.</small>
          </div>
        )}
      </div>

      <p className="field-hint">
        این عدد تخمینی است؛ کیفیت ویدیو و مدت استفاده می‌تواند آن را کم یا زیاد کند.
      </p>
    </div>
  );
}
