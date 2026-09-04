/**
 * قیمت‌گذاری حجم و زمان دلخواه.
 *
 * دو جا از همین نرخ‌ها استفاده می‌شود:
 *  ۱. «خرید حجم اضافه» توسط مشتری روی سرویس فعالش (فقط گیگابایت، بدون تمدید تاریخ)
 *  ۲. فروش/تمدید دلخواه در پنل نمایندگی (گیگابایت + روز، با تخفیف نمایندگی)
 *
 * فرمول عمداً ساده است تا صاحب فروشگاه با دو عدد در تنظیمات همه‌چیز را کنترل
 * کند: قیمت = (گیگابایت × نرخ گیگ) + (روز × نرخ روز)، رو به بالا رند شده.
 *
 * این فایل عمداً هیچ import ی ندارد تا کامپوننت‌های کلاینت هم بتوانند همان
 * محاسبهٔ سرور را برای پیش‌نمایش قیمت اجرا کنند (settings.ts به دیتابیس وصل
 * است و در کلاینت قابل import نیست). دو کمکی کوچک زیر معادل asBool/asNum اند.
 */

function bool(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "on";
}

function num(value: string | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export type CustomRates = {
  perGb: number;
  perDay: number;
  roundTo: number;
  minGb: number;
  maxGb: number;
  minDays: number;
  maxDays: number;
  deviceLimit: number;
  /** خرید حجم اضافه برای مشتری روشن است */
  addonEnabled: boolean;
  /** فروش دلخواه در پنل نماینده روشن است */
  resellerCustom: boolean;
  /** پلن‌های آماده به نماینده نشان داده می‌شوند */
  resellerPlans: boolean;
};

export function customRates(settings: Record<string, string>): CustomRates {
  const minGb = Math.max(1, Math.round(num(settings.custom_min_gb, 5)));
  const minDays = Math.max(1, Math.round(num(settings.custom_min_days, 7)));
  return {
    perGb: Math.max(0, Math.round(num(settings.custom_price_per_gb, 0))),
    perDay: Math.max(0, Math.round(num(settings.custom_price_per_day, 0))),
    roundTo: Math.max(0, Math.round(num(settings.custom_round_to, 0))),
    minGb,
    maxGb: Math.max(minGb, Math.round(num(settings.custom_max_gb, 500))),
    minDays,
    maxDays: Math.max(minDays, Math.round(num(settings.custom_max_days, 365))),
    deviceLimit: Math.max(0, Math.round(num(settings.custom_device_limit, 0))),
    addonEnabled: bool(settings.addon_enabled),
    resellerCustom: bool(settings.reseller_custom_enabled),
    resellerPlans: bool(settings.reseller_plans_visible),
  };
}

/** قیمت خام یک ترکیب حجم/زمان (بدون تخفیف نمایندگی) */
export function customPrice(rates: CustomRates, gb: number, days: number): number {
  const volume = Math.max(0, Math.round(gb)) * rates.perGb;
  const time = Math.max(0, Math.round(days)) * rates.perDay;
  const raw = volume + time;
  if (raw <= 0 || rates.roundTo <= 0) return raw;
  return Math.ceil(raw / rates.roundTo) * rates.roundTo;
}

/** آیا نرخ‌ها طوری تنظیم شده‌اند که فروش دلخواه معنا داشته باشد */
export function ratesReady(rates: CustomRates): boolean {
  return rates.perGb > 0 || rates.perDay > 0;
}

export type CustomCheck = { ok: true; gb: number; days: number } | { ok: false; error: string };

/**
 * اعتبارسنجی ورودی کاربر.
 *
 * `mode` تعیین می‌کند روز هم گرفته می‌شود یا نه: در «حجم اضافه» فقط گیگابایت
 * معنا دارد و تاریخ انقضای سرویس دست‌نخورده می‌ماند.
 */
export function checkCustom(
  rates: CustomRates,
  input: { gb: unknown; days?: unknown },
  mode: "custom" | "addon" = "custom",
): CustomCheck {
  const gb = Math.round(Number(input.gb));
  const days = mode === "addon" ? 0 : Math.round(Number(input.days));

  if (!Number.isFinite(gb) || gb <= 0) return { ok: false, error: "حجم را به گیگابایت وارد کنید." };
  if (gb < rates.minGb) return { ok: false, error: `کمترین حجم ${rates.minGb} گیگابایت است.` };
  if (gb > rates.maxGb) return { ok: false, error: `بیشترین حجم ${rates.maxGb} گیگابایت است.` };

  if (mode === "custom") {
    if (!Number.isFinite(days) || days <= 0) return { ok: false, error: "مدت را به روز وارد کنید." };
    if (days < rates.minDays) return { ok: false, error: `کمترین مدت ${rates.minDays} روز است.` };
    if (days > rates.maxDays) return { ok: false, error: `بیشترین مدت ${rates.maxDays} روز است.` };
  }

  return { ok: true, gb, days };
}
