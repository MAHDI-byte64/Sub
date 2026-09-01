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

export function planVolumeLabel(volumeGb: number): string {
  return volumeGb > 0 ? `${faNum(volumeGb)} گیگابایت` : "حجم نامحدود";
}

export function planDaysLabel(days: number): string {
  return days > 0 ? `${faNum(days)} روزه` : "بدون محدودیت زمانی";
}

export function deviceLabel(limit: number): string {
  return limit > 0 ? `${faNum(limit)} کاربر همزمان` : "بدون محدودیت کاربر";
}
