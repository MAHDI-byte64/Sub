"use client";

import { useEffect, useState } from "react";
import { t, type Locale } from "@/lib/i18n";

const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const two = (n: number, locale: Locale, pad = 2) => {
  const text = String(n).padStart(pad, "0");
  return locale === "fa" ? text.replace(/\d/g, (d) => FA[Number(d)]) : text;
};

/** شمارش معکوس زنده برای مهلت پرداخت */
export default function Countdown({
  until,
  expiredLabel,
  locale = "fa",
}: {
  until: string;
  expiredLabel?: string;
  locale?: Locale;
}) {
  const target = new Date(until).getTime();
  const [left, setLeft] = useState(() => target - Date.now());

  useEffect(() => {
    const timer = setInterval(() => setLeft(target - Date.now()), 1000);
    return () => clearInterval(timer);
  }, [target]);

  if (!Number.isFinite(target)) return null;
  if (left <= 0) {
    return (
      <span className="countdown is-expired">⏱ {expiredLabel ?? t(locale, "order.deadlineOver")}</span>
    );
  }

  const totalSeconds = Math.floor(left / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const urgent = left < 10 * 60_000;

  return (
    <span className={`countdown${urgent ? " is-urgent" : ""}`}>
      ⏱ {hours > 0 ? `${two(hours, locale)}:` : ""}
      {two(minutes, locale)}:{two(seconds, locale)}
      <small>{t(locale, "order.untilDeadline")}</small>
    </span>
  );
}
