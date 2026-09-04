import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { getSettings } from "./settings";
import { hashPassword } from "./roles";
import { mailReady, mailTemplate, sendMail } from "./mail";
import { notifyUser } from "./notify";

/**
 * بازیابی رمز عبور.
 *
 * توکن فقط یک بار و در همان ایمیل دیده می‌شود؛ در دیتابیس فقط هش SHA-256 آن
 * می‌ماند، پس حتی با دسترسی به دیتابیس هم نمی‌شود لینک بازیابی ساخت. هر توکن
 * یک‌بارمصرف است، عمر کوتاه دارد و با ساخت درخواست تازه، درخواست‌های قبلی
 * باطل می‌شوند.
 */

const TOKEN_TTL_MS = 30 * 60_000;

export type ResetCode =
  | "sent"
  | "not-configured"
  | "mail-failed"
  | "invalid"
  | "expired"
  | "used"
  | "done";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function resetLink(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/+$/, "") || "";
  return `${base}/reset?token=${token}`;
}

/**
 * ساخت درخواست بازیابی و فرستادن ایمیل.
 *
 * برای اینکه کسی نتواند با این صفحه بفهمد چه ایمیل‌هایی در سایت ثبت‌نام
 * کرده‌اند، پیام بیرونی همیشه یکسان است؛ این تابع فقط برای لاگ و تست
 * جزئیات را برمی‌گرداند.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ code: ResetCode; token?: string }> {
  const settings = await getSettings();
  if (!mailReady(settings)) return { code: "not-configured" };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.isBlocked) return { code: "sent" };

  // درخواست‌های استفاده‌نشدهٔ قبلی باطل می‌شوند تا فقط آخرین لینک کار کند
  await db.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });

  const token = randomBytes(32).toString("hex");
  await db.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  const link = resetLink(process.env.APP_URL ?? "", token);
  const minutes = Math.round(TOKEN_TTL_MS / 60_000);
  const site = settings.site_name || "فروشگاه";

  const mail = await sendMail({
    to: user.email,
    subject: `بازیابی رمز عبور ${site}`,
    text: `برای ساخت رمز تازه این نشانی را باز کنید (تا ${minutes} دقیقه معتبر است):\n${link}\n\nاگر شما درخواست نداده‌اید، این ایمیل را نادیده بگیرید؛ رمز فعلی‌تان عوض نمی‌شود.`,
    html: mailTemplate({
      siteName: site,
      title: "بازیابی رمز عبور",
      body: `سلام${user.name ? ` ${user.name}` : ""}،<br>برای حساب <b style="direction:ltr;display:inline-block">${user.email}</b> درخواست بازیابی رمز ثبت شده است. با دکمهٔ زیر رمز تازه بسازید؛ این لینک <b>${minutes} دقیقه</b> و فقط <b>یک بار</b> کار می‌کند.`,
      buttonLabel: "ساخت رمز تازه",
      buttonUrl: link,
      footer:
        "اگر شما این درخواست را نداده‌اید، کاری لازم نیست؛ رمز فعلی شما بدون تغییر می‌ماند و این لینک به‌زودی منقضی می‌شود.",
    }),
  });

  if (!mail.ok) return { code: "mail-failed", token };
  return { code: "sent", token };
}

/** بررسی توکن بدون مصرف‌کردنش (برای باز شدن صفحهٔ رمز تازه) */
export async function checkResetToken(token: string): Promise<{ ok: boolean; code: ResetCode }> {
  const row = token ? await db.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } }) : null;
  if (!row) return { ok: false, code: "invalid" };
  if (row.usedAt) return { ok: false, code: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, code: "expired" };
  return { ok: true, code: "done" };
}

/**
 * ثبت رمز تازه.
 *
 * بعد از تغییر رمز، همهٔ نشست‌های آن حساب بسته می‌شوند تا اگر کسی با رمز قبلی
 * وارد بوده، بیرون بیفتد.
 */
export async function completePasswordReset(
  token: string,
  password: string,
): Promise<{ ok: boolean; code: ResetCode }> {
  const hash = hashToken(token);
  const row = token ? await db.passwordReset.findUnique({ where: { tokenHash: hash } }) : null;
  if (!row) return { ok: false, code: "invalid" };
  if (row.usedAt) return { ok: false, code: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, code: "expired" };

  // مقایسهٔ زمان‌ثابت روی هش، محض احتیاط
  const given = Buffer.from(hash);
  const stored = Buffer.from(row.tokenHash);
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
    return { ok: false, code: "invalid" };
  }

  await db.user.update({
    where: { id: row.userId },
    data: { passwordHash: hashPassword(password) },
  });
  await db.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  await db.session.deleteMany({ where: { userId: row.userId } });

  await notifyUser({
    userId: row.userId,
    kind: "security",
    title: "رمز عبور شما عوض شد",
    body: "رمز حساب با لینک بازیابی تغییر کرد و از همهٔ دستگاه‌ها خارج شدید. اگر خودتان نبودید، همین حالا با پشتیبانی تماس بگیرید.",
    href: "/dashboard/profile",
  });

  return { ok: true, code: "done" };
}

/** پاک‌کردن درخواست‌های قدیمی (در کارهای پس‌زمینه) */
export async function pruneResetTokens(): Promise<number> {
  const { count } = await db.passwordReset.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }] },
  });
  return count;
}
