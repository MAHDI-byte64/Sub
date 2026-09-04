"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notify";
import { useBackupCode, verifyTotp } from "@/lib/totp";
import { rateLimit, resetLimit } from "@/lib/ratelimit";
import { asBool, getSettings } from "@/lib/settings";
import { mailReady } from "@/lib/mail";
import { completePasswordReset, requestPasswordReset } from "@/lib/reset";
import {
  createSession,
  destroySession,
  hashPassword,
  isStaff,
  normalizeEmail,
  pendingSession,
  promoteSession,
  validateCredentials,
  verifyPassword,
} from "@/lib/auth";

export type AuthState = { error?: string };

/** فقط مسیرهای داخلی مجازند */
function safeNext(value: FormDataEntryValue | null, fallback = "/dashboard"): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") || ""));
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  const name = String(formData.get("name") || "").trim();
  const next = safeNext(formData.get("next"));

  const invalid = validateCredentials(email, password);
  if (invalid) return { error: invalid };
  if (password !== confirm) return { error: "رمز عبور و تکرار آن یکسان نیستند." };

  const limit = rateLimit(`register:${email}`, 5, 10 * 60_000);
  if (!limit.ok) {
    return { error: `تعداد درخواست‌ها زیاد است. ${limit.retryAfter} ثانیه دیگر دوباره تلاش کنید.` };
  }

  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return { error: "این ایمیل قبلاً ثبت شده است. وارد شوید." };

  const isFirstUser = (await db.user.count()) === 0;

  // کد دعوت: اگر با لینک معرف آمده باشد ثبت می‌شود
  const refCode = String(formData.get("ref") || "").trim().toUpperCase();
  let referredById: string | null = null;
  if (refCode) {
    const inviter = await db.user.findFirst({ where: { referralCode: refCode } });
    if (inviter) referredById = inviter.id;
  }

  const { randomBytes } = await import("node:crypto");
  const user = await db.user.create({
    data: {
      email,
      name: name || null,
      passwordHash: hashPassword(password),
      role: isFirstUser ? "admin" : "user",
      referredById,
      referralCode: randomBytes(4).toString("hex").toUpperCase(),
    },
  });

  await createSession(user.id);
  redirect(next);
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") || ""));
  const password = String(formData.get("password") || "");
  const next = safeNext(formData.get("next"));

  // حداکثر ۸ تلاش ناموفق در هر ۱۰ دقیقه
  const limit = rateLimit(`login:${email}`, 8, 10 * 60_000);
  if (!limit.ok) {
    return { error: `تعداد تلاش‌های ناموفق زیاد است. ${limit.retryAfter} ثانیه دیگر دوباره تلاش کنید.` };
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "ایمیل یا رمز عبور درست نیست." };
  }
  if (user.isBlocked) return { error: "حساب شما مسدود شده است. با پشتیبانی تماس بگیرید." };

  resetLimit(`login:${email}`);

  // ورود دومرحله‌ای: نشست نیمه‌کاره تا وقتی کد تأیید شود
  if (user.totpEnabledAt) {
    await createSession(user.id, true);
    redirect(`/login/verify?next=${encodeURIComponent(next)}`);
  }

  await createSession(user.id);
  redirect(isStaff(user.role) && next === "/dashboard" ? "/admin" : next);
}

/** مرحلهٔ دوم ورود: کد اپ احرازهویت یا یکی از کدهای پشتیبان */
export async function verifyTotpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const pending = await pendingSession();
  if (!pending) return { error: "زمان تأیید تمام شد؛ دوباره وارد شوید." };

  const next = safeNext(formData.get("next"));
  const code = String(formData.get("code") || "").trim();
  if (!code) return { error: "کد را وارد کنید." };

  // ۶ تلاش در هر ۵ دقیقه برای هر نشست
  const limit = rateLimit(`totp:${pending.id}`, 6, 5 * 60_000);
  if (!limit.ok) {
    await db.session.deleteMany({ where: { id: pending.id } });
    return { error: "تلاش‌های ناموفق زیاد بود؛ دوباره وارد شوید." };
  }

  const user = await db.user.findUnique({ where: { id: pending.userId } });
  if (!user?.totpSecret) return { error: "ورود دومرحله‌ای برای این حساب تنظیم نشده است." };

  let ok = verifyTotp(user.totpSecret, code);
  let usedBackup = false;

  if (!ok) {
    const backup = useBackupCode(user.totpBackupCodes, code);
    if (backup.ok) {
      ok = true;
      usedBackup = true;
      await db.user.update({ where: { id: user.id }, data: { totpBackupCodes: backup.rest } });
    }
  }
  if (!ok) return { error: "کد درست نیست. کد تازه را از اپ بخوانید و دوباره امتحان کنید." };

  resetLimit(`totp:${pending.id}`);
  await promoteSession(pending.id);

  if (usedBackup) {
    await notifyUser({
      userId: user.id,
      kind: "security",
      title: "ورود با کد پشتیبان",
      body: "یکی از کدهای پشتیبان دومرحله‌ای شما مصرف شد. اگر خودتان نبودید، همین حالا رمز عبور را عوض کنید.",
      href: "/dashboard/profile",
    });
  }

  redirect(isStaff(user.role) && next === "/dashboard" ? "/admin" : next);
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

export async function revokeOtherSessionsAction(
  _prev: AuthState & { success?: string },
): Promise<AuthState & { success?: string }> {
  const { getCurrentUser, currentSessionId } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };

  const current = await currentSessionId();
  const result = await db.session.deleteMany({
    where: { userId: user.id, ...(current ? { id: { not: current } } : {}) },
  });

  return {
    success: result.count
      ? `از ${result.count} دستگاه دیگر خارج شدید.`
      : "دستگاه دیگری وارد نشده است.",
  };
}

export async function changePasswordAction(_prev: AuthState & { success?: string }, formData: FormData) {
  const { getCurrentUser } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };

  const current = String(formData.get("current") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!verifyPassword(current, row.passwordHash)) return { error: "رمز فعلی درست نیست." };
  if (password.length < 8) return { error: "رمز جدید باید حداقل ۸ کاراکتر باشد." };
  if (password !== confirm) return { error: "رمز جدید و تکرار آن یکسان نیستند." };

  await db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password) } });
  return { success: "رمز عبور با موفقیت تغییر کرد." };
}

/* --------------------------- بازیابی رمز عبور --------------------------- */

export type ResetState = { error?: string; success?: string };

/** مرحلهٔ ۱: درخواست لینک بازیابی */
export async function forgotPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = normalizeEmail(String(formData.get("email") || ""));
  if (!email) return { error: "ایمیل حساب را وارد کنید." };

  const settings = await getSettings();
  if (!asBool(settings.reset_enabled) || !mailReady(settings)) {
    return { error: "بازیابی رمز با ایمیل روی این سایت فعال نیست؛ با پشتیبانی تماس بگیرید." };
  }

  // ۳ درخواست در هر ۱۵ دقیقه برای هر ایمیل
  const limit = rateLimit(`reset:${email}`, 3, 15 * 60_000);
  if (!limit.ok) {
    return { error: `درخواست‌های زیاد. ${limit.retryAfter} ثانیه دیگر دوباره تلاش کنید.` };
  }

  const result = await requestPasswordReset(email);
  if (result.code === "not-configured") {
    return { error: "ارسال ایمیل روی این سایت تنظیم نشده است؛ با پشتیبانی تماس بگیرید." };
  }
  if (result.code === "mail-failed") {
    return { error: "ارسال ایمیل انجام نشد. کمی بعد دوباره امتحان کنید یا به پشتیبانی بگویید." };
  }

  // پیام یکسان برای ایمیل موجود و ناموجود، تا فهرست کاربران لو نرود
  return {
    success:
      "اگر این ایمیل در سایت ثبت شده باشد، لینک ساخت رمز تازه برایش فرستاده شد. صندوق ورودی و پوشهٔ اسپم را ببینید؛ لینک تا ۳۰ دقیقه معتبر است.",
  };
}

/** مرحلهٔ ۲: ثبت رمز تازه با توکن ایمیل */
export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  if (password !== confirm) return { error: "دو رمز واردشده یکی نیستند." };
  if (password.length < 8) return { error: "رمز عبور باید حداقل ۸ کاراکتر باشد." };

  const limit = rateLimit(`reset-submit:${token.slice(0, 16)}`, 6, 15 * 60_000);
  if (!limit.ok) return { error: "تلاش‌های زیاد. کمی بعد دوباره امتحان کنید." };

  const result = await completePasswordReset(token, password);
  if (!result.ok) {
    const message =
      result.code === "expired"
        ? "این لینک منقضی شده است. دوباره درخواست بازیابی بدهید."
        : result.code === "used"
          ? "این لینک قبلاً استفاده شده است. اگر باز هم لازم دارید، درخواست تازه بدهید."
          : "لینک معتبر نیست. آدرس را کامل از ایمیل کپی کنید یا درخواست تازه بدهید.";
    return { error: message };
  }

  redirect("/login?reset=1");
}
