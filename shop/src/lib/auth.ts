import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db";

export const SESSION_COOKIE = "fandogh_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, key] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** خطای متنی در صورت نامعتبر بودن ایمیل/رمز */
export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "ایمیل وارد شده معتبر نیست.";
  if (password.length < 8) return "رمز عبور باید حداقل ۸ کاراکتر باشد.";
  return null;
}

/**
 * آیا درخواست فعلی روی HTTPS است؟
 *
 * کوکی نشست فقط وقتی فلگ Secure می‌گیرد که واقعاً روی HTTPS باشیم؛ وگرنه مرورگر
 * کوکی را ذخیره نمی‌کند و کاربر بعد از ورود دوباره به صفحه لاگین برمی‌گردد
 * (حالت رایج: اجرای سایت روی http://IP:3000 بدون دامنه و SSL).
 */
async function isSecureRequest(): Promise<boolean> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-proto");
    if (forwarded) return forwarded.split(",")[0].trim().toLowerCase() === "https";
    const proto = h.get("x-forwarded-protocol") ?? h.get("x-url-scheme");
    if (proto) return proto.toLowerCase() === "https";
    if (h.get("x-forwarded-ssl") === "on" || h.get("front-end-https") === "on") return true;
  } catch {
    /* خارج از چرخه درخواست */
  }
  return (process.env.APP_URL ?? "").startsWith("https://");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  let userAgent: string | null = null;
  try {
    userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  } catch {
    /* خارج از چرخه درخواست */
  }
  await db.session.create({ data: { id: token, userId, userAgent, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await isSecureRequest(),
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: token } });
  jar.delete(SESSION_COOKIE);
}

/** شناسهٔ نشست فعلی (برای علامت‌زدن دستگاه جاری) */
export async function currentSessionId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/** نام خواندنی دستگاه از روی User-Agent */
export function describeDevice(userAgent: string | null | undefined): { name: string; icon: string } {
  const ua = (userAgent || "").toLowerCase();
  if (!ua) return { name: "دستگاه ناشناس", icon: "❓" };

  const os = ua.includes("android")
    ? "اندروید"
    : /iphone|ipad|ipod/.test(ua)
      ? "آی‌او‌اس"
      : ua.includes("windows")
        ? "ویندوز"
        : ua.includes("mac os")
          ? "مک"
          : ua.includes("linux")
            ? "لینوکس"
            : "سیستم نامشخص";

  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("samsungbrowser")
      ? "Samsung Internet"
      : ua.includes("firefox")
        ? "Firefox"
        : ua.includes("chrome")
          ? "Chrome"
          : ua.includes("safari")
            ? "Safari"
            : "مرورگر نامشخص";

  const icon = /android|iphone|ipad|mobile/.test(ua) ? "📱" : "💻";
  return { name: `${browser} روی ${os}`, icon };
}

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isBlocked: boolean;
  trialUsedAt: Date | null;
  /** کاربر ویژه: روش‌های پرداختِ «فقط ویژه» برای او باز است */
  isVip: boolean;
  /** نماینده: پنل نمایندگی هم دارد (پنل کاربری عادی سر جای خودش می‌ماند) */
  isReseller: boolean;
  /** درصد تخفیف نمایندگی */
  resellerOff: number;
};

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { id: token }, include: { user: true } });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  const { user } = session;
  if (user.isBlocked) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isBlocked: user.isBlocked,
    trialUsedAt: user.trialUsedAt,
    isVip: user.isVip,
    isReseller: user.isReseller,
    resellerOff: user.resellerOff,
  };
});

export async function requireUser(returnTo = "/dashboard"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fadmin");
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

/**
 * ورود به پنل نمایندگی.
 * مدیر هم می‌تواند وارد شود (برای بررسی)، ولی کاربر عادی به پنل خودش برمی‌گردد.
 */
export async function requireReseller(returnTo = "/reseller"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  if (!user.isReseller && user.role !== "admin") redirect("/dashboard");
  return user;
}
