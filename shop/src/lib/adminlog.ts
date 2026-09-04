import "server-only";
import { db } from "./db";
import { getCurrentUser } from "./auth";

/** برچسب فارسی هر نوع اقدام مدیر */
export const ACTION_LABELS: Record<string, { label: string; icon: string }> = {
  order_approved: { label: "تأیید سفارش", icon: "✅" },
  order_rejected: { label: "رد سفارش", icon: "⚠️" },
  service_created: { label: "ساخت دستی سرویس", icon: "🌐" },
  service_extended: { label: "تمدید دستی سرویس", icon: "➕" },
  service_traffic_reset: { label: "صفر کردن مصرف", icon: "🔄" },
  service_toggled: { label: "تغییر وضعیت سرویس", icon: "🔀" },
  service_rotated: { label: "بازتولید کانفیگ", icon: "🔐" },
  service_deleted: { label: "حذف سرویس", icon: "🗑️" },
  services_synced: { label: "همگام‌سازی همه سرویس‌ها", icon: "🔃" },
  services_pruned: { label: "پاک‌سازی سرویس‌های منقضی", icon: "🧹" },
  panel_saved: { label: "ذخیره سرور", icon: "🖥️" },
  panel_deleted: { label: "حذف سرور", icon: "🗑️" },
  panel_tested: { label: "تست اتصال سرور", icon: "🔌" },
  panels_checked: { label: "بررسی سلامت سرورها", icon: "📡" },
  panel_resumed: { label: "بازگرداندن سرور به فروش", icon: "🟢" },
  plan_saved: { label: "ذخیره پلن", icon: "🏷️" },
  plan_deleted: { label: "حذف پلن", icon: "🗑️" },
  discount_saved: { label: "ذخیره کد تخفیف", icon: "🎟️" },
  discount_deleted: { label: "حذف کد تخفیف", icon: "🗑️" },
  user_blocked: { label: "مسدود کردن کاربر", icon: "⛔" },
  user_unblocked: { label: "آزادسازی کاربر", icon: "✅" },
  user_trial_reset: { label: "آزادسازی تست رایگان", icon: "🎁" },
  user_vip_on: { label: "کاربر ویژه شد", icon: "⭐" },
  user_vip_off: { label: "لغو کاربر ویژه", icon: "☆" },
  reseller_on: { label: "فعال‌سازی نمایندگی", icon: "🤝" },
  reseller_off: { label: "غیرفعال‌سازی نمایندگی", icon: "🚫" },
  wallet_adjusted: { label: "تنظیم کیف پول", icon: "💰" },
  settings_saved: { label: "ذخیره تنظیمات", icon: "⚙️" },
  gateway_saved: { label: "ذخیره درگاه پرداخت", icon: "💳" },
  gateway_deleted: { label: "حذف درگاه پرداخت", icon: "🗑️" },
  wallet_saved: { label: "ذخیره آدرس ارز دیجیتال", icon: "🪙" },
  wallet_deleted: { label: "حذف آدرس ارز دیجیتال", icon: "🗑️" },
  telegram_tested: { label: "تست ربات تلگرام", icon: "✈️" },
  mail_tested: { label: "تست ارسال ایمیل", icon: "📧" },
  push_enabled: { label: "فعال‌سازی اعلان پوش", icon: "🔔" },
  push_broadcast: { label: "ارسال اطلاعیه پوش", icon: "📣" },
  announcement_sent: { label: "ارسال اطلاعیه به کاربران", icon: "📣" },
  telegram_webhook_set: { label: "فعال‌سازی ربات تلگرام", icon: "🤖" },
  ticket_replied: { label: "پاسخ به تیکت", icon: "💬" },
  backup_downloaded: { label: "دانلود پشتیبان", icon: "💾" },
  service_migrated: { label: "انتقال سرویس به سرور دیگر", icon: "🚚" },
  user_support_on: { label: "دادن نقش پشتیبان", icon: "🎧" },
  user_support_off: { label: "گرفتن نقش پشتیبان", icon: "🎧" },
  totp_enabled: { label: "روشن‌کردن ورود دومرحله‌ای", icon: "🔐" },
  totp_disabled: { label: "خاموش‌کردن ورود دومرحله‌ای", icon: "🔓" },
  totp_backup_codes: { label: "ساخت کدهای پشتیبان تازه", icon: "🗝️" },
  panel_services_migrated: { label: "انتقال گروهی سرویس‌ها", icon: "🚚" },
  backup_created: { label: "ساخت پشتیبان", icon: "🗄️" },
  backup_sent: { label: "ارسال پشتیبان به تلگرام", icon: "📤" },
  backup_deleted: { label: "حذف پشتیبان", icon: "🗑️" },
  backup_restored: { label: "بازیابی از پشتیبان", icon: "♻️" },
};

/** ثبت یک اقدام مدیریتی (خطا هرگز جریان اصلی را متوقف نمی‌کند) */
export async function logAdmin(action: string, target?: string | null, detail?: string | null) {
  try {
    const user = await getCurrentUser();
    await db.adminLog.create({
      data: {
        adminEmail: user?.email ?? "system",
        action,
        target: target ?? null,
        detail: detail ? detail.slice(0, 400) : null,
      },
    });
  } catch {
    /* گزارش‌گیری نباید کار مدیر را خراب کند */
  }
}
