"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { rateLimit, resetLimit } from "@/lib/ratelimit";
import {
  createSession,
  destroySession,
  hashPassword,
  normalizeEmail,
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
  await createSession(user.id);
  redirect(user.role === "admin" && next === "/dashboard" ? "/admin" : next);
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
