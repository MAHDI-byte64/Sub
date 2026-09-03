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

  {
    key: "card_enabled",
    label: "پرداخت کارت‌به‌کارت فعال باشد",
    type: "bool",
    group: "پرداخت",
    default: "1",
    hint: "مشتری مبلغ را کارت‌به‌کارت می‌کند و رسید می‌فرستد تا مدیر تأیید کند.",
  },
  {
    key: "card_vip_only",
    label: "کارت‌به‌کارت فقط برای کاربران ویژه",
    type: "bool",
    group: "پرداخت",
    default: "0",
    hint: "با روشن‌کردن، شماره کارت فقط به کاربرانی نشان داده می‌شود که در پنل «ویژه» علامت زده‌اید.",
  },
  { key: "card_number", label: "شماره کارت", type: "text", group: "پرداخت", default: "6037-9900-0000-0000" },
  { key: "card_holder", label: "نام صاحب کارت", type: "text", group: "پرداخت", default: "نام و نام خانوادگی" },
  { key: "card_bank", label: "نام بانک", type: "text", group: "پرداخت", default: "بانک ملی ایران" },
  { key: "payment_note", label: "توضیح صفحه پرداخت", type: "textarea", group: "پرداخت", default: "پس از واریز، تصویر رسید را در همین صفحه بارگذاری کنید. سفارش شما حداکثر تا ۳۰ دقیقه بررسی و سرویس تحویل داده می‌شود." },
  { key: "order_expire_minutes", label: "مهلت پرداخت سفارش (دقیقه)", type: "number", group: "پرداخت", default: "60" },

  {
    key: "gateway_enabled",
    label: "پرداخت آنلاین فعال باشد",
    type: "bool",
    group: "درگاه پرداخت آنلاین",
    default: "0",
    hint: "با فعال‌شدن، مشتری می‌تواند به‌جای کارت‌به‌کارت مستقیم از درگاه پرداخت کند و سرویس در همان لحظه تحویل می‌شود.",
  },
  {
    key: "gateway_driver",
    label: "درگاه پرداخت",
    type: "text",
    group: "درگاه پرداخت آنلاین",
    default: "zarinpal",
    hint: "zarinpal | idpay | zibal | payping | nextpay | custom (درگاه دلخواه با تنظیم دستی).",
  },
  {
    key: "gateway_key",
    label: "کلید / مرچنت درگاه",
    type: "password",
    group: "درگاه پرداخت آنلاین",
    default: "",
    hint: "زرین‌پال: مرچنت کد · آی‌دی‌پی و نکست‌پی: کلید API · پی‌پینگ: توکن · زیبال: مرچنت.",
  },
  {
    key: "gateway_secret",
    label: "کلید محرمانه درگاه (Secret)",
    type: "password",
    group: "درگاه پرداخت آنلاین",
    default: "",
    hint: "هوش‌پی برای اعتبارسنجی وب‌هوک از این کلید استفاده می‌کند.",
  },
  {
    key: "gateway_fee_mode",
    label: "کارمزد درگاه را چه کسی بدهد",
    type: "text",
    group: "درگاه پرداخت آنلاین",
    default: "buyer",
    hint: "hooshpay: buyer (به مبلغ مشتری اضافه می‌شود) | seller (از سهم شما) | split (نصف‌نصف).",
  },
  {
    key: "gateway_sandbox",
    label: "حالت آزمایشی (Sandbox)",
    type: "bool",
    group: "درگاه پرداخت آنلاین",
    default: "0",
    hint: "برای تست بدون پرداخت واقعی؛ قبل از فروش حتماً خاموشش کنید.",
  },
  {
    key: "gateway_min_amount",
    label: "حداقل مبلغ پرداخت آنلاین (تومان)",
    type: "number",
    group: "درگاه پرداخت آنلاین",
    default: "10000",
  },
  {
    key: "gateway_custom",
    label: "تنظیمات درگاه دلخواه (JSON)",
    type: "textarea",
    group: "درگاه پرداخت آنلاین",
    default: "",
    hint:
      "فقط وقتی درگاه روی custom است. نمونه: " +
      '{"requestUrl":"https://gw.example/request","verifyUrl":"https://gw.example/verify",' +
      '"startUrl":"https://gw.example/pay/{ref}","currency":"rial","auth":"header","authHeader":"X-API-KEY",' +
      '"amountField":"amount","callbackField":"callback","orderField":"order_id","refPath":"data.token",' +
      '"successPath":"status","successValue":"100","callbackRefParam":"token","verifyRefPath":"data.ref_id"}',
  },

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

  {
    key: "push_enabled",
    label: "اعلان پوش مرورگر",
    type: "bool",
    group: "اطلاع‌رسانی",
    default: "0",
    hint: "بعد از روشن‌کردن، دکمهٔ «فعال‌سازی اعلان پوش» را در همین صفحه بزنید تا کلیدها ساخته شوند.",
  },
  { key: "vapid_public", label: "کلید عمومی VAPID (خودکار)", type: "text", group: "اطلاع‌رسانی", default: "" },
  { key: "vapid_private", label: "کلید خصوصی VAPID (خودکار)", type: "password", group: "اطلاع‌رسانی", default: "" },

  { key: "expiry_reminder_days", label: "یادآوری انقضا چند روز قبل", type: "number", group: "اطلاع‌رسانی", default: "3" },
  { key: "quota_warn_percent", label: "هشدار اتمام حجم در چند درصد", type: "number", group: "اطلاع‌رسانی", default: "85" },

  {
    key: "crypto_enabled",
    label: "پرداخت با ارز دیجیتال (تتر TRC20)",
    type: "bool",
    group: "ارز دیجیتال",
    default: "0",
    hint: "مشتری تتر را به آدرس شما می‌فرستد و هش تراکنش را وارد می‌کند؛ بعد از تأیید شما سرویس تحویل می‌شود.",
  },
  {
    key: "crypto_min_amount",
    label: "حداقل مبلغ سفارش برای پرداخت تتری (تومان)",
    type: "number",
    group: "ارز دیجیتال",
    default: "0",
    hint: "صفر یعنی محدودیتی نیست.",
  },
  {
    key: "crypto_note",
    label: "راهنمای پرداخت تتری",
    type: "textarea",
    group: "ارز دیجیتال",
    default:
      "فقط شبکهٔ TRC20 (ترون) را انتخاب کنید. بعد از ارسال، هش تراکنش (TXID) را در همین صفحه وارد کنید تا سفارش شما بررسی و تحویل شود.",
  },
  {
    key: "usdt_rate_auto",
    label: "نرخ تتر خودکار به‌روز شود",
    type: "bool",
    group: "ارز دیجیتال",
    default: "1",
    hint: "هر ۱۰ دقیقه از منبع زیر خوانده می‌شود؛ اگر در دسترس نبود، نرخ دستی ملاک است.",
  },
  {
    key: "usdt_rate_url",
    label: "آدرس منبع نرخ",
    type: "text",
    group: "ارز دیجیتال",
    default: "https://api.nobitex.ir/v2/orderbook/USDTIRT",
  },
  {
    key: "usdt_rate_path",
    label: "مسیر عدد نرخ در پاسخ JSON",
    type: "text",
    group: "ارز دیجیتال",
    default: "lastTradePrice",
    hint: "با نقطه، مثلاً data.price — اگر عدد به ریال باشد خودکار به تومان تبدیل می‌شود.",
  },
  {
    key: "usdt_rate_manual",
    label: "نرخ دستی هر تتر (تومان)",
    type: "number",
    group: "ارز دیجیتال",
    default: "0",
    hint: "وقتی نرخ خودکار خاموش یا در دسترس نباشد، از این عدد استفاده می‌شود.",
  },
  {
    key: "usdt_rate_margin",
    label: "حاشیهٔ امن روی نرخ (درصد)",
    type: "number",
    group: "ارز دیجیتال",
    default: "2",
    hint: "برای پوشش نوسان چند دقیقه‌ای بین ثبت سفارش و پرداخت.",
  },
  { key: "usdt_rate_cached", label: "نرخ کش‌شده (خودکار)", type: "text", group: "ارز دیجیتال", default: "0" },
  {
    key: "usdt_rate_cached_at",
    label: "زمان کش نرخ (خودکار)",
    type: "text",
    group: "ارز دیجیتال",
    default: "0",
  },

  {
    key: "monitor_enabled",
    label: "بررسی خودکار سلامت سرورها",
    type: "bool",
    group: "پایش سرورها",
    default: "1",
    hint: "هر ۱۵ دقیقه به همهٔ سرورها وصل می‌شود، زمان پاسخ را ثبت می‌کند و خرابی را به تلگرام خبر می‌دهد.",
  },
  {
    key: "monitor_fail_threshold",
    label: "توقف فروش بعد از چند خرابی پیاپی",
    type: "number",
    group: "پایش سرورها",
    default: "3",
    hint: "سرور خراب از چرخهٔ فروش کنار می‌رود و با اولین پاسخ درست، خودکار برمی‌گردد.",
  },
  {
    key: "monitor_keep_days",
    label: "نگهداری تاریخچه بررسی (روز)",
    type: "number",
    group: "پایش سرورها",
    default: "7",
  },
  {
    key: "status_page_enabled",
    label: "صفحهٔ وضعیت سرورها برای بازدیدکنندگان",
    type: "bool",
    group: "پایش سرورها",
    default: "1",
    hint: "آدرس /status — فقط نام، لوکیشن، آپتایم و پینگ نمایش داده می‌شود، نه آدرس پنل.",
  },

  {
    key: "maintenance_mode",
    label: "حالت تعمیر و نگهداری",
    type: "bool",
    group: "تعمیر و نگهداری",
    default: "0",
    hint: "سایت برای همه به صفحهٔ «در حال به‌روزرسانی» می‌رود؛ مدیر همچنان به همه‌جا دسترسی دارد.",
  },
  {
    key: "maintenance_title",
    label: "عنوان صفحه تعمیر",
    type: "text",
    group: "تعمیر و نگهداری",
    default: "در حال به‌روزرسانی هستیم",
  },
  {
    key: "maintenance_message",
    label: "متن صفحه تعمیر",
    type: "textarea",
    group: "تعمیر و نگهداری",
    default:
      "برای بهتر شدن سرویس، سایت چند دقیقه‌ای در دسترس نیست. سرویس‌های فعال شما بدون قطعی کار می‌کنند و لینک اشتراکتان برقرار است.",
  },
  {
    key: "maintenance_until",
    label: "زمان تقریبی بازگشت",
    type: "text",
    group: "تعمیر و نگهداری",
    default: "",
    hint: "مثلاً «تا ساعت ۲۲» — خالی بگذارید تا نمایش داده نشود.",
  },

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
