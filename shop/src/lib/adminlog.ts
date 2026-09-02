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
  service_deleted: { label: "حذف سرویس", icon: "🗑️" },
  services_synced: { label: "همگام‌سازی همه سرویس‌ها", icon: "🔃" },
  services_pruned: { label: "پاک‌سازی سرویس‌های منقضی", icon: "🧹" },
  panel_saved: { label: "ذخیره سرور", icon: "🖥️" },
  panel_deleted: { label: "حذف سرور", icon: "🗑️" },
  panel_tested: { label: "تست اتصال سرور", icon: "🔌" },
  plan_saved: { label: "ذخیره پلن", icon: "🏷️" },
  plan_deleted: { label: "حذف پلن", icon: "🗑️" },
  discount_saved: { label: "ذخیره کد تخفیف", icon: "🎟️" },
  discount_deleted: { label: "حذف کد تخفیف", icon: "🗑️" },
  user_blocked: { label: "مسدود کردن کاربر", icon: "⛔" },
  user_unblocked: { label: "آزادسازی کاربر", icon: "✅" },
  user_trial_reset: { label: "آزادسازی تست رایگان", icon: "🎁" },
  wallet_adjusted: { label: "تنظیم کیف پول", icon: "💰" },
  settings_saved: { label: "ذخیره تنظیمات", icon: "⚙️" },
  telegram_tested: { label: "تست ربات تلگرام", icon: "✈️" },
  telegram_webhook_set: { label: "فعال‌سازی ربات تلگرام", icon: "🤖" },
  ticket_replied: { label: "پاسخ به تیکت", icon: "💬" },
  backup_downloaded: { label: "دانلود پشتیبان", icon: "💾" },
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
