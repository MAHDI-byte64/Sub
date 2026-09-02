import "server-only";
import webpush from "web-push";
import { db } from "./db";
import { asBool, getSettings, saveSettings } from "./settings";

/**
 * اعلان پوش مرورگر (Web Push).
 *
 * کلیدهای VAPID یک بار ساخته و در تنظیمات ذخیره می‌شوند؛ کلید عمومی به مرورگر
 * داده می‌شود تا اشتراک بسازد و کلید خصوصی فقط سمت سرور برای امضای پیام است.
 */

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  icon?: string;
  tag?: string;
};

export type VapidKeys = { publicKey: string; privateKey: string };

/** کلیدهای موجود یا ساخت کلید تازه (فقط بار اول) */
export async function ensureVapidKeys(): Promise<VapidKeys> {
  const settings = await getSettings();
  const publicKey = settings.vapid_public?.trim();
  const privateKey = settings.vapid_private?.trim();
  if (publicKey && privateKey) return { publicKey, privateKey };

  const keys = webpush.generateVAPIDKeys();
  await saveSettings({ vapid_public: keys.publicKey, vapid_private: keys.privateKey });
  return keys;
}

export async function pushPublicKey(): Promise<string | null> {
  const settings = await getSettings();
  if (!asBool(settings.push_enabled)) return null;
  return settings.vapid_public?.trim() || null;
}

/** آیا اعلان پوش آمادهٔ استفاده است؟ */
export async function pushReady(): Promise<boolean> {
  const settings = await getSettings();
  return (
    asBool(settings.push_enabled) &&
    Boolean(settings.vapid_public?.trim()) &&
    Boolean(settings.vapid_private?.trim())
  );
}

async function configure(): Promise<boolean> {
  const settings = await getSettings();
  const publicKey = settings.vapid_public?.trim();
  const privateKey = settings.vapid_private?.trim();
  if (!asBool(settings.push_enabled) || !publicKey || !privateKey) return false;

  const contact = settings.support_email?.includes("@")
    ? `mailto:${settings.support_email}`
    : "mailto:admin@example.com";
  webpush.setVapidDetails(contact, publicKey, privateKey);
  return true;
}

/** ثبت یا به‌روزرسانی اشتراک یک دستگاه */
export async function saveSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string | null,
): Promise<void> {
  await db.pushSub.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent ?? null,
    },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent ?? null },
  });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.pushSub.deleteMany({ where: { endpoint } });
}

/**
 * ارسال پوش به همهٔ دستگاه‌های یک کاربر.
 * اشتراک‌های باطل (۴۰۴/۴۱۰) خودکار پاک می‌شوند تا فهرست تمیز بماند.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!(await configure())) return 0;

  const subs = await db.pushSub.findMany({ where: { userId } });
  if (!subs.length) return 0;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/dashboard",
    icon: payload.icon ?? "/icons/icon-192.png",
    tag: payload.tag ?? "fandogh",
  });

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.pushSub.deleteMany({ where: { endpoint: sub.endpoint } }).catch(() => null);
      }
    }
  }
  return sent;
}

/** ارسال پوش به همهٔ کاربرانی که اشتراک دارند (اطلاعیه) */
export async function broadcastPush(payload: PushPayload): Promise<{ users: number; sent: number }> {
  if (!(await configure())) return { users: 0, sent: 0 };

  const userIds = await db.pushSub.findMany({ select: { userId: true }, distinct: ["userId"] });
  let sent = 0;
  for (const { userId } of userIds) sent += await sendPushToUser(userId, payload);
  return { users: userIds.length, sent };
}
