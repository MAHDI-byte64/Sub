"use client";

import { useEffect, useState } from "react";

const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const fa = (n: number, pad = 2) =>
  String(n)
    .padStart(pad, "0")
    .replace(/\d/g, (d) => FA[Number(d)]);

/** شمارش معکوس زنده برای مهلت پرداخت */
export default function Countdown({
  until,
  expiredLabel = "مهلت پرداخت تمام شد",
}: {
  until: string;
  expiredLabel?: string;
}) {
  const target = new Date(until).getTime();
  const [left, setLeft] = useState(() => target - Date.now());

  useEffect(() => {
    const timer = setInterval(() => setLeft(target - Date.now()), 1000);
    return () => clearInterval(timer);
  }, [target]);

  if (!Number.isFinite(target)) return null;
  if (left <= 0) {
    return <span className="countdown is-expired">⏱ {expiredLabel}</span>;
  }

  const totalSeconds = Math.floor(left / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const urgent = left < 10 * 60_000;

  return (
    <span className={`countdown${urgent ? " is-urgent" : ""}`}>
      ⏱ {hours > 0 ? `${fa(hours)}:` : ""}
      {fa(minutes)}:{fa(seconds)}
      <small>تا پایان مهلت</small>
    </span>
  );
}
