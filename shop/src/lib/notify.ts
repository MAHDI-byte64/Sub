import "server-only";
import { db } from "./db";
import { sendPushToUser } from "./push";

export type NotifyInput = {
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
  serviceId?: string | null;
};

export const NOTIFICATION_ICONS: Record<string, string> = {
  expiry_soon: "⏳",
  expired: "⌛",
  quota_low: "📦",
  order_approved: "✅",
  order_rejected: "⚠️",
  wallet_credit: "💰",
  auto_renew: "🔄",
  rotated: "🔐",
  referral: "🎁",
  service_created: "🌐",
  ticket_reply: "💬",
  announcement: "📣",
};

/** ساخت اعلان درون‌سایتی برای کاربر */
export async function notifyUser(input: NotifyInput): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        href: input.href ?? null,
        serviceId: input.serviceId ?? null,
      },
    });
  } catch {
    /* اعلان نباید جریان اصلی را متوقف کند */
  }

  // همان اعلان روی گوشی/مرورگر کاربر هم می‌رود (اگر اجازه داده باشد)
  try {
    await sendPushToUser(input.userId, {
      title: `${NOTIFICATION_ICONS[input.kind] ?? "🔔"} ${input.title}`,
      body: input.body ?? "",
      url: input.href ?? "/dashboard/notifications",
      tag: input.kind,
    });
  } catch {
    /* پوش هم نباید جریان اصلی را متوقف کند */
  }
}

/** آیا اعلان مشابهی برای این سرویس در N روز اخیر ساخته شده؟ */
export async function alreadyNotified(
  userId: string,
  kind: string,
  serviceId: string | null,
  withinMs: number,
): Promise<boolean> {
  const existing = await db.notification.findFirst({
    where: {
      userId,
      kind,
      serviceId,
      createdAt: { gte: new Date(Date.now() - withinMs) },
    },
    select: { id: true },
  });
  return Boolean(existing);
}

/** تعداد اعلان‌های خوانده‌نشده */
export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}
