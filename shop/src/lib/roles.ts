/**
 * نقش‌ها و رمز عبور — بدون وابستگی به Next.
 *
 * این‌ها از `auth.ts` جدا شده‌اند تا کتابخانه‌هایی مثل `totp.ts` و تست‌ها بتوانند
 * بدون کشیدنِ `next/navigation` و بقیهٔ چرخهٔ درخواست از آن‌ها استفاده کنند.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

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

/** کارکنان پنل: مدیر یا پشتیبان */
export function isStaff(role: string): boolean {
  return role === "admin" || role === "support";
}

export function roleLabel(role: string): string {
  return role === "admin" ? "مدیر" : role === "support" ? "پشتیبان" : "کاربر";
}
