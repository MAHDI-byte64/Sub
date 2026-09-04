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
  migrated: "🚚",
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

/* -------------------------- اطلاعیه برای همه --------------------------- */

export type Audience = "all" | "active" | "resellers";

export const AUDIENCE_LABEL: Record<Audience, string> = {
  all: "همهٔ کاربران",
  active: "فقط کاربران دارای سرویس فعال",
  resellers: "فقط نمایندگان",
};

/** شناسهٔ کاربرانی که اطلاعیه برایشان می‌رود */
export async function audienceUserIds(audience: Audience): Promise<string[]> {
  const where =
    audience === "resellers"
      ? { isReseller: true, isBlocked: false }
      : audience === "active"
        ? { isBlocked: false, services: { some: { status: "active" } } }
        : { isBlocked: false };

  const users = await db.user.findMany({ where, select: { id: true } });
  return users.map((user) => user.id);
}

/**
 * اطلاعیهٔ همگانی.
 *
 * برای هر کاربر یک اعلان درون‌سایتی ساخته می‌شود (همان زنگ بالای صفحه)؛
 * اعلان پوش اختیاری است، چون فقط به دستگاه‌هایی می‌رسد که کاربر اجازه داده.
 */
export async function announceToUsers(input: {
  audience: Audience;
  title: string;
  body?: string;
  href?: string;
  push?: boolean;
}): Promise<{ users: number; pushed: number }> {
  const ids = await audienceUserIds(input.audience);
  if (!ids.length) return { users: 0, pushed: 0 };

  const href = input.href?.trim() || "/dashboard/notifications";
  await db.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      kind: "announcement",
      title: input.title,
      body: input.body?.trim() || null,
      href,
    })),
  });

  let pushed = 0;
  if (input.push) {
    for (const userId of ids) {
      pushed += await sendPushToUser(userId, {
        title: `${NOTIFICATION_ICONS.announcement} ${input.title}`,
        body: input.body?.trim() || "",
        url: href,
        tag: "announcement",
      });
    }
  }

  return { users: ids.length, pushed };
}
