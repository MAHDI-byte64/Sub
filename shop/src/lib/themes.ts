/**
 * تم‌های رنگی سایت.
 *
 * تم را فقط مدیر از تنظیمات انتخاب می‌کند و برای همهٔ بازدیدکننده‌ها یکی است
 * (کلید `site_theme`). هر تم فقط مجموعه‌ای از متغیرهای CSS است: مقدارها همین‌جا
 * تعریف می‌شوند و در `layout.tsx` به شکل یک بلوک `:root` روی صفحه می‌نشینند،
 * پس برای اضافه‌کردن تم تازه کافی است یک عضو به `THEMES` اضافه کنید.
 *
 * این فایل عمداً هیچ import ی ندارد تا کامپوننت‌های کلاینت (پیش‌نمایش زندهٔ
 * تم در پنل مدیر) هم بتوانند از آن استفاده کنند.
 */

export type ThemeVars = {
  bg: string;
  bg2: string;
  surface: string;
  surface2: string;
  surface3: string;
  surfaceHover: string;
  border: string;
  borderStrong: string;
  ring: string;
  text: string;
  textSoft: string;
  muted: string;
  dim: string;
  /** رنگ اصلی برند (در CSS با نام تاریخی --gold شناخته می‌شود) */
  accent: string;
  accentLight: string;
  accentDeep: string;
  grad: string;
  gradSoft: string;
  shadowAccent: string;
  /** هاله‌های محو پس‌زمینه و رنگ ذرات متحرک */
  glow1: string;
  glow2: string;
  particle: string;
  particleLine: string;
};

export type Theme = {
  id: string;
  label: string;
  labelEn: string;
  /** یک خط توضیح برای کارت انتخاب تم در پنل مدیر */
  hint: string;
  /** رنگ نوار بالای مرورگر و PWA */
  themeColor: string;
  vars: ThemeVars;
};

export const THEMES: Theme[] = [
  {
    id: "fandogh",
    label: "فندق (طلایی)",
    labelEn: "Fandogh (gold)",
    hint: "تم پیش‌فرض: تیرهٔ مجلسی با لهجهٔ طلایی",
    themeColor: "#07060b",
    vars: {
      bg: "#07060b",
      bg2: "#0b0910",
      surface: "rgba(20, 17, 26, 0.66)",
      surface2: "rgba(28, 24, 34, 0.72)",
      surface3: "rgba(38, 32, 44, 0.6)",
      surfaceHover: "rgba(45, 38, 52, 0.8)",
      border: "rgba(255, 255, 255, 0.09)",
      borderStrong: "rgba(244, 183, 64, 0.3)",
      ring: "rgba(244, 183, 64, 0.28)",
      text: "#f8f5f0",
      textSoft: "#d9d3ca",
      muted: "#a29a90",
      dim: "#6e675f",
      accent: "#f4b740",
      accentLight: "#fcd77a",
      accentDeep: "#c07c12",
      grad: "linear-gradient(135deg, #f7c65c, #d68a12)",
      gradSoft: "linear-gradient(135deg, rgba(244, 183, 64, 0.16), rgba(214, 138, 18, 0.08))",
      shadowAccent: "0 16px 42px rgba(196, 130, 26, 0.32)",
      glow1: "#f4b740",
      glow2: "#b45309",
      particle: "rgba(252, 215, 122, 0.75)",
      particleLine: "244, 183, 64",
    },
  },
  {
    id: "midnight",
    label: "نیمه‌شب (آبی)",
    labelEn: "Midnight (blue)",
    hint: "آبی سرد و آرام، مناسب برند‌های فنی",
    themeColor: "#05070f",
    vars: {
      bg: "#05070f",
      bg2: "#080b16",
      surface: "rgba(16, 21, 36, 0.68)",
      surface2: "rgba(22, 29, 47, 0.74)",
      surface3: "rgba(31, 40, 61, 0.62)",
      surfaceHover: "rgba(38, 49, 74, 0.82)",
      border: "rgba(255, 255, 255, 0.09)",
      borderStrong: "rgba(96, 165, 250, 0.34)",
      ring: "rgba(96, 165, 250, 0.3)",
      text: "#f2f6ff",
      textSoft: "#cfd9ec",
      muted: "#95a3bd",
      dim: "#64708a",
      accent: "#60a5fa",
      accentLight: "#a5cdff",
      accentDeep: "#1d4ed8",
      grad: "linear-gradient(135deg, #7cb8ff, #2563eb)",
      gradSoft: "linear-gradient(135deg, rgba(96, 165, 250, 0.18), rgba(37, 99, 235, 0.08))",
      shadowAccent: "0 16px 42px rgba(37, 99, 235, 0.34)",
      glow1: "#3b82f6",
      glow2: "#1e3a8a",
      particle: "rgba(165, 205, 255, 0.75)",
      particleLine: "96, 165, 250",
    },
  },
  {
    id: "emerald",
    label: "زمرد (سبز)",
    labelEn: "Emerald (green)",
    hint: "سبز زمردی روی زمینهٔ جنگلی تیره",
    themeColor: "#04100c",
    vars: {
      bg: "#04100c",
      bg2: "#061510",
      surface: "rgba(13, 32, 26, 0.68)",
      surface2: "rgba(18, 42, 34, 0.74)",
      surface3: "rgba(26, 55, 45, 0.62)",
      surfaceHover: "rgba(33, 68, 55, 0.82)",
      border: "rgba(255, 255, 255, 0.09)",
      borderStrong: "rgba(52, 211, 153, 0.32)",
      ring: "rgba(52, 211, 153, 0.28)",
      text: "#f0fbf6",
      textSoft: "#c9e6da",
      muted: "#8fb3a4",
      dim: "#5f7d70",
      accent: "#34d399",
      accentLight: "#86efac",
      accentDeep: "#047857",
      grad: "linear-gradient(135deg, #5eead4, #059669)",
      gradSoft: "linear-gradient(135deg, rgba(52, 211, 153, 0.18), rgba(5, 150, 105, 0.08))",
      shadowAccent: "0 16px 42px rgba(5, 150, 105, 0.32)",
      glow1: "#10b981",
      glow2: "#065f46",
      particle: "rgba(134, 239, 172, 0.72)",
      particleLine: "52, 211, 153",
    },
  },
  {
    id: "royal",
    label: "ارغوانی (بنفش)",
    labelEn: "Royal (purple)",
    hint: "بنفش سلطنتی با درخشش ملایم",
    themeColor: "#090613",
    vars: {
      bg: "#090613",
      bg2: "#0d0919",
      surface: "rgba(25, 18, 43, 0.68)",
      surface2: "rgba(33, 24, 55, 0.74)",
      surface3: "rgba(45, 33, 71, 0.62)",
      surfaceHover: "rgba(55, 41, 86, 0.82)",
      border: "rgba(255, 255, 255, 0.09)",
      borderStrong: "rgba(167, 139, 250, 0.34)",
      ring: "rgba(167, 139, 250, 0.3)",
      text: "#f6f2ff",
      textSoft: "#d8cfee",
      muted: "#a294c4",
      dim: "#6f6390",
      accent: "#a78bfa",
      accentLight: "#d8b4fe",
      accentDeep: "#6d28d9",
      grad: "linear-gradient(135deg, #c4b5fd, #7c3aed)",
      gradSoft: "linear-gradient(135deg, rgba(167, 139, 250, 0.18), rgba(124, 58, 237, 0.08))",
      shadowAccent: "0 16px 42px rgba(124, 58, 237, 0.34)",
      glow1: "#8b5cf6",
      glow2: "#4c1d95",
      particle: "rgba(216, 180, 254, 0.75)",
      particleLine: "167, 139, 250",
    },
  },
  {
    id: "crimson",
    label: "یاقوت (قرمز)",
    labelEn: "Crimson (red)",
    hint: "قرمز گرم و پرانرژی روی زمینهٔ زغالی",
    themeColor: "#0e0508",
    vars: {
      bg: "#0e0508",
      bg2: "#14080c",
      surface: "rgba(35, 16, 22, 0.68)",
      surface2: "rgba(46, 21, 29, 0.74)",
      surface3: "rgba(60, 28, 38, 0.62)",
      surfaceHover: "rgba(73, 34, 46, 0.82)",
      border: "rgba(255, 255, 255, 0.09)",
      borderStrong: "rgba(251, 113, 133, 0.34)",
      ring: "rgba(251, 113, 133, 0.3)",
      text: "#fff3f5",
      textSoft: "#eccdd4",
      muted: "#c0949e",
      dim: "#8a6069",
      accent: "#fb7185",
      accentLight: "#fda4af",
      accentDeep: "#9f1239",
      grad: "linear-gradient(135deg, #fda4af, #e11d48)",
      gradSoft: "linear-gradient(135deg, rgba(251, 113, 133, 0.18), rgba(225, 29, 72, 0.08))",
      shadowAccent: "0 16px 42px rgba(225, 29, 72, 0.32)",
      glow1: "#f43f5e",
      glow2: "#881337",
      particle: "rgba(253, 164, 175, 0.75)",
      particleLine: "251, 113, 133",
    },
  },
  {
    id: "graphite",
    label: "گرافیت (نقره‌ای)",
    labelEn: "Graphite (silver)",
    hint: "خنثی و کم‌رنگ؛ وقتی می‌خواهید محتوا جلو بیاید",
    themeColor: "#08090c",
    vars: {
      bg: "#08090c",
      bg2: "#0c0e12",
      surface: "rgba(22, 25, 31, 0.68)",
      surface2: "rgba(30, 34, 41, 0.74)",
      surface3: "rgba(41, 46, 55, 0.62)",
      surfaceHover: "rgba(51, 57, 67, 0.82)",
      border: "rgba(255, 255, 255, 0.1)",
      borderStrong: "rgba(203, 213, 225, 0.3)",
      ring: "rgba(203, 213, 225, 0.26)",
      text: "#f5f7fa",
      textSoft: "#d3d9e2",
      muted: "#9aa3b1",
      dim: "#697180",
      accent: "#cbd5e1",
      accentLight: "#f1f5f9",
      accentDeep: "#64748b",
      grad: "linear-gradient(135deg, #e2e8f0, #94a3b8)",
      gradSoft: "linear-gradient(135deg, rgba(203, 213, 225, 0.16), rgba(100, 116, 139, 0.08))",
      shadowAccent: "0 16px 42px rgba(100, 116, 139, 0.3)",
      glow1: "#94a3b8",
      glow2: "#334155",
      particle: "rgba(226, 232, 240, 0.7)",
      particleLine: "203, 213, 225",
    },
  },
];

export const DEFAULT_THEME_ID = "fandogh";

/** «#a78bfa» → «167, 139, 250» تا بشود با شفافیت دلخواه در rgba() به‌کار برد */
function rgbOf(hex: string): string {
  const clean = hex.trim().replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(value)) return "244, 183, 64";
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

/** تم معتبر از روی مقدار تنظیمات؛ مقدار ناشناخته به تم پیش‌فرض برمی‌گردد */
export function themeById(id?: string | null): Theme {
  const found = THEMES.find((theme) => theme.id === (id ?? "").trim());
  return found ?? THEMES.find((theme) => theme.id === DEFAULT_THEME_ID) ?? THEMES[0];
}

/** نگاشت متغیرهای CSS یک تم (کلید با -- شروع می‌شود) */
export function themeVars(theme: Theme): Record<string, string> {
  const v = theme.vars;
  return {
    "--bg": v.bg,
    "--bg-2": v.bg2,
    "--surface": v.surface,
    "--surface-2": v.surface2,
    "--surface-3": v.surface3,
    "--surface-hover": v.surfaceHover,
    "--border": v.border,
    "--border-strong": v.borderStrong,
    "--ring": v.ring,
    "--text": v.text,
    "--text-soft": v.textSoft,
    "--muted": v.muted,
    "--dim": v.dim,
    "--gold": v.accent,
    "--gold-light": v.accentLight,
    "--gold-deep": v.accentDeep,
    // همان سه رنگ به‌صورت RGB؛ استایل‌ها با شفافیت‌های مختلف از این‌ها استفاده می‌کنند
    "--accent-rgb": rgbOf(v.accent),
    "--accent-light-rgb": rgbOf(v.accentLight),
    "--accent-deep-rgb": rgbOf(v.accentDeep),
    "--grad": v.grad,
    "--grad-soft": v.gradSoft,
    "--shadow-gold": v.shadowAccent,
    "--glow-1": v.glow1,
    "--glow-2": v.glow2,
    "--particle": v.particle,
    "--particle-line": v.particleLine,
  };
}

/**
 * بلوک CSS تم برای گذاشتن در `<style>`.
 *
 * مقدارها فقط از همین فایل می‌آیند (نه از ورودی کاربر)، ولی برای اطمینان
 * کاراکترهایی که می‌توانند از بلوک بیرون بزنند حذف می‌شوند.
 */
export function themeCss(theme: Theme): string {
  const body = Object.entries(themeVars(theme))
    .map(([key, value]) => `${key}:${value.replace(/[<>{};]/g, "")}`)
    .join(";");
  return `:root{${body}}`;
}
