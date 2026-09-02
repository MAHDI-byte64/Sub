import type { Locale } from "./i18n";

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** تبدیل ارقام لاتین به فارسی */
export function faNum(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** ۱۲۵۰۰۰ → «۱۲۵,۰۰۰ تومان» */
export function toman(amount: number, withUnit = true): string {
  const s = faNum(Math.round(amount).toLocaleString("en-US"));
  return withUnit ? `${s} تومان` : s;
}

export const GB = 1024 * 1024 * 1024;

export function gbToBytes(gb: number): number {
  return Math.round(gb * GB);
}

/** نمایش حجم؛ صفر یعنی نامحدود */
export function formatBytes(bytes: number, unlimitedLabel = "نامحدود"): string {
  if (!bytes || bytes <= 0) return unlimitedLabel;
  const units = ["بایت", "کیلوبایت", "مگابایت", "گیگابایت", "ترابایت"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(value >= 10 ? 1 : 2);
  return `${faNum(rounded.replace(/\.?0+$/, ""))} ${units[i]}`;
}

/** میلادی → شمسی (الگوریتم استاندارد جلالی) */
export function toJalali(date: Date): { jy: number; jm: number; jd: number } {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1;
  const gd = date.getDate();
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  const gy2 = gy <= 1600 ? gy - 621 : gy - 1600;
  const gm2 = gm > 2 ? gy2 + 1 : gy2;
  let days =
    365 * gy2 +
    Math.floor((gm2 + 3) / 4) -
    Math.floor((gm2 + 99) / 100) +
    Math.floor((gm2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

/** «۱۲ مرداد ۱۴۰۴» */
export function faDate(date: Date | string | null | undefined, withTime = false): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  const { jy, jm, jd } = toJalali(d);
  const base = `${faNum(jd)} ${JALALI_MONTHS[jm - 1]} ${faNum(jy)}`;
  if (!withTime) return base;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${base} ساعت ${faNum(hh)}:${faNum(mm)}`;
}

/** «۱۲ روز مانده» یا «منقضی شده» */
export function remainingDays(expiresAt: Date | null | undefined): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

/** «۳ ساعت پیش» — برای فهرست‌ها خواناتر از تاریخ کامل است */
export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";

  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const suffix = future ? "دیگر" : "پیش";

  if (abs < 60_000) return "چند لحظه پیش";
  if (abs < 3_600_000) return `${faNum(Math.round(abs / 60_000))} دقیقه ${suffix}`;
  if (abs < 86_400_000) return `${faNum(Math.round(abs / 3_600_000))} ساعت ${suffix}`;
  if (abs < 7 * 86_400_000) return `${faNum(Math.round(abs / 86_400_000))} روز ${suffix}`;
  return faDate(d);
}

/** «۲ ساعت و ۱۵ دقیقه» برای نمایش مدت */
export function durationLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${faNum(minutes)} دقیقه`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${faNum(hours)} ساعت و ${faNum(rest)} دقیقه` : `${faNum(hours)} ساعت`;
  const days = Math.floor(hours / 24);
  return `${faNum(days)} روز`;
}

export function planVolumeLabel(volumeGb: number): string {
  return volumeGb > 0 ? `${faNum(volumeGb)} گیگابایت` : "حجم نامحدود";
}

export function planDaysLabel(days: number): string {
  return days > 0 ? `${faNum(days)} روزه` : "بدون محدودیت زمانی";
}

export function deviceLabel(limit: number): string {
  return limit > 0 ? `${faNum(limit)} کاربر همزمان` : "بدون محدودیت کاربر";
}

/* -------------------------------------------------------------------------- */
/*                        نسخهٔ دو زبانهٔ همین قالب‌بندی‌ها                        */
/* -------------------------------------------------------------------------- */

const EN_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const BYTE_UNITS_EN = ["B", "KB", "MB", "GB", "TB"];

/**
 * قالب‌بندی وابسته به زبان.
 *
 * در فارسی همان رفتار قبلی (ارقام فارسی، تاریخ شمسی) و در انگلیسی ارقام لاتین و
 * تاریخ میلادی. `const f = fmt(locale)` و بعد `f.money(...)`.
 */
export function fmt(locale: Locale) {
  const fa = locale === "fa";

  const num = (input: string | number) => (fa ? faNum(input) : String(input));

  const money = (amount: number, withUnit = true) => {
    const value = Math.round(amount).toLocaleString("en-US");
    const text = fa ? faNum(value) : value;
    return withUnit ? (fa ? `${text} تومان` : `${text} Toman`) : text;
  };

  const bytes = (input: number, unlimitedLabel?: string) => {
    if (!input || input <= 0) return unlimitedLabel ?? (fa ? "نامحدود" : "Unlimited");
    if (fa) return formatBytes(input, unlimitedLabel ?? "نامحدود");
    let value = input;
    let i = 0;
    while (value >= 1024 && i < BYTE_UNITS_EN.length - 1) {
      value /= 1024;
      i += 1;
    }
    const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(value >= 10 ? 1 : 2);
    return `${rounded.replace(/\.?0+$/, "")} ${BYTE_UNITS_EN[i]}`;
  };

  const date = (input: Date | string | null | undefined, withTime = false) => {
    if (!input) return "—";
    const d = typeof input === "string" ? new Date(input) : input;
    if (Number.isNaN(d.getTime())) return "—";
    if (fa) return faDate(d, withTime);
    const base = `${d.getDate()} ${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    if (!withTime) return base;
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${base}, ${hh}:${mm}`;
  };

  const relative = (input: Date | string | null | undefined) => {
    if (!input) return "—";
    const d = typeof input === "string" ? new Date(input) : input;
    if (Number.isNaN(d.getTime())) return "—";
    if (fa) return relativeTime(d);

    const diff = Date.now() - d.getTime();
    const abs = Math.abs(diff);
    const suffix = diff < 0 ? "from now" : "ago";
    if (abs < 60_000) return "just now";
    if (abs < 3_600_000) return `${Math.round(abs / 60_000)} min ${suffix}`;
    if (abs < 86_400_000) return `${Math.round(abs / 3_600_000)} h ${suffix}`;
    if (abs < 7 * 86_400_000) return `${Math.round(abs / 86_400_000)} d ${suffix}`;
    return date(d);
  };

  const volume = (volumeGb: number) =>
    volumeGb > 0
      ? fa
        ? `${faNum(volumeGb)} گیگابایت`
        : `${volumeGb} GB`
      : fa
        ? "حجم نامحدود"
        : "Unlimited data";

  const days = (value: number) =>
    value > 0
      ? fa
        ? `${faNum(value)} روزه`
        : `${value} days`
      : fa
        ? "بدون محدودیت زمانی"
        : "No time limit";

  const devices = (limit: number) =>
    limit > 0
      ? fa
        ? `${faNum(limit)} کاربر همزمان`
        : `${limit} device${limit > 1 ? "s" : ""}`
      : fa
        ? "بدون محدودیت کاربر"
        : "Unlimited devices";

  const daysLeft = (value: number) =>
    fa ? `${faNum(value)} روز مانده` : `${value} days left`;

  return { locale, num, money, bytes, date, relative, volume, days, devices, daysLeft };
}

export type Fmt = ReturnType<typeof fmt>;
