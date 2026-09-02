import { db } from "./db";

export type SettingType = "text" | "textarea" | "number" | "bool" | "password";

export type SettingDef = {
  key: string;
  label: string;
  type: SettingType;
  group: string;
  default: string;
  hint?: string;
};

/** همه تنظیمات قابل ویرایش در پنل ادمین */
export const SETTING_DEFS: SettingDef[] = [
  { key: "site_name", label: "نام سایت", type: "text", group: "عمومی", default: "فندق" },
  { key: "site_tagline", label: "شعار سایت", type: "text", group: "عمومی", default: "اینترنت بدون محدودیت، ساده و پرسرعت" },
  { key: "site_description", label: "توضیح کوتاه (سئو)", type: "textarea", group: "عمومی", default: "خرید اشتراک پرسرعت VLESS با پشتیبانی ۲۴ ساعته، تحویل آنی و امکان تست رایگان." },
  { key: "announcement", label: "اطلاعیه بالای سایت", type: "text", group: "عمومی", default: "", hint: "خالی بگذارید تا نمایش داده نشود." },
  { key: "support_telegram", label: "آیدی تلگرام پشتیبانی", type: "text", group: "عمومی", default: "@fandogh_support" },
  { key: "support_email", label: "ایمیل پشتیبانی", type: "text", group: "عمومی", default: "support@example.com" },

  { key: "card_number", label: "شماره کارت", type: "text", group: "پرداخت", default: "6037-9900-0000-0000" },
  { key: "card_holder", label: "نام صاحب کارت", type: "text", group: "پرداخت", default: "نام و نام خانوادگی" },
  { key: "card_bank", label: "نام بانک", type: "text", group: "پرداخت", default: "بانک ملی ایران" },
  { key: "payment_note", label: "توضیح صفحه پرداخت", type: "textarea", group: "پرداخت", default: "پس از واریز، تصویر رسید را در همین صفحه بارگذاری کنید. سفارش شما حداکثر تا ۳۰ دقیقه بررسی و سرویس تحویل داده می‌شود." },
  { key: "order_expire_minutes", label: "مهلت پرداخت سفارش (دقیقه)", type: "number", group: "پرداخت", default: "60" },

  { key: "wallet_enabled", label: "کیف پول فعال باشد", type: "bool", group: "کیف پول و دعوت", default: "1", hint: "کاربر می‌تواند حساب را شارژ کند و خرید آنی انجام دهد." },
  { key: "min_topup", label: "حداقل مبلغ شارژ (تومان)", type: "number", group: "کیف پول و دعوت", default: "50000" },
  { key: "referral_percent", label: "درصد پاداش دعوت", type: "number", group: "کیف پول و دعوت", default: "10", hint: "درصدی از اولین خرید کاربر دعوت‌شده که به کیف پول دعوت‌کننده اضافه می‌شود. صفر = غیرفعال." },
  { key: "auto_renew_enabled", label: "تمدید خودکار از کیف پول", type: "bool", group: "کیف پول و دعوت", default: "1" },

  {
    key: "rotate_enabled",
    label: "کاربر بتواند کانفیگ را بازتولید کند",
    type: "bool",
    group: "امنیت سرویس",
    default: "1",
    hint: "با بازتولید، UUID و لینک اشتراک عوض می‌شود و دستگاه‌هایی که کانفیگ قدیمی دارند قطع می‌شوند.",
  },
  {
    key: "rotate_cooldown_minutes",
    label: "فاصله مجاز بین دو بازتولید (دقیقه)",
    type: "number",
    group: "امنیت سرویس",
    default: "30",
    hint: "برای جلوگیری از فشار روی پنل. مدیر محدودیتی ندارد.",
  },

  { key: "expiry_reminder_days", label: "یادآوری انقضا چند روز قبل", type: "number", group: "اطلاع‌رسانی", default: "3" },
  { key: "quota_warn_percent", label: "هشدار اتمام حجم در چند درصد", type: "number", group: "اطلاع‌رسانی", default: "85" },

  { key: "trial_enabled", label: "اکانت تست رایگان فعال باشد", type: "bool", group: "تست رایگان", default: "1" },
  { key: "trial_volume_gb", label: "حجم تست (گیگابایت)", type: "number", group: "تست رایگان", default: "1" },
  { key: "trial_days", label: "مدت تست (روز)", type: "number", group: "تست رایگان", default: "1" },
  { key: "trial_device_limit", label: "تعداد کاربر همزمان تست", type: "number", group: "تست رایگان", default: "1" },

  {
    key: "canned_replies",
    label: "پاسخ‌های آماده پشتیبانی (هر خط یک پاسخ)",
    type: "textarea",
    group: "پشتیبانی",
    default: [
      "سلام، ممنون از پیام شما. در حال بررسی هستیم و تا چند دقیقه دیگر نتیجه را اعلام می‌کنیم.",
      "لطفاً لینک اشتراک را در برنامه یک بار «به‌روزرسانی» (Update Subscription) کنید و نتیجه را بگویید.",
      "سرور شما تعویض شد. لطفاً لینک اشتراک را به‌روزرسانی کنید و دوباره امتحان کنید.",
      "سرویس شما تمدید شد. حجم و زمان جدید در پنل کاربری قابل مشاهده است.",
      "مشکل برطرف شد. اگر باز هم تکرار شد همین‌جا بنویسید. روز خوبی داشته باشید 🌹",
    ].join("\n"),
    hint: "در صفحه پاسخ به تیکت، این‌ها به‌صورت دکمه‌های یک‌کلیکی نمایش داده می‌شوند.",
  },
  { key: "support_hours", label: "ساعات پاسخ‌گویی", type: "text", group: "پشتیبانی", default: "۲۴ ساعته، هر روز هفته" },

  { key: "telegram_bot_token", label: "توکن ربات تلگرام", type: "password", group: "اطلاع‌رسانی", default: "", hint: "برای اطلاع‌رسانی سفارش‌ها به ادمین." },
  { key: "telegram_admin_chat_id", label: "آیدی عددی چت ادمین", type: "text", group: "اطلاع‌رسانی", default: "" },
  {
    key: "telegram_webhook_secret",
    label: "کلید امنیتی وب‌هوک (خودکار)",
    type: "password",
    group: "اطلاع‌رسانی",
    default: "",
    hint: "با فعال‌سازی ربات به‌صورت خودکار ساخته می‌شود؛ نیازی به تغییر دستی نیست.",
  },
  { key: "notify_on_new_order", label: "اطلاع‌رسانی سفارش جدید", type: "bool", group: "اطلاع‌رسانی", default: "1" },
  { key: "notify_on_ticket", label: "اطلاع‌رسانی تیکت جدید", type: "bool", group: "اطلاع‌رسانی", default: "1" },
];

const DEFAULTS: Record<string, string> = Object.fromEntries(
  SETTING_DEFS.map((d) => [d.key, d.default]),
);

export type Settings = Record<string, string>;

export async function getSettings(): Promise<Settings> {
  const rows = await db.setting.findMany();
  const values: Settings = { ...DEFAULTS };
  for (const row of rows) values[row.key] = row.value;
  return values;
}

export async function saveSettings(values: Record<string, string>): Promise<void> {
  const known = new Set(SETTING_DEFS.map((d) => d.key));
  for (const [key, value] of Object.entries(values)) {
    if (!known.has(key)) continue;
    await db.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}

export function asBool(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "on";
}

export function asNum(value: string | undefined, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
