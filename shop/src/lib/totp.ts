import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { hashPassword, verifyPassword } from "./roles";

/**
 * ورود دومرحله‌ای با کد یک‌بارمصرف زمانی (TOTP، همان استاندارد
 * Google Authenticator / Authy / ۲FAS).
 *
 * پیاده‌سازی کامل در همین‌جا انجام شده تا وابستگی تازه‌ای اضافه نشود:
 * RFC 4648 برای Base32، RFC 6238 با HMAC-SHA1، بازهٔ ۳۰ ثانیه و کد ۶ رقمی
 * که همهٔ برنامه‌های احرازهویت با همین تنظیمات کار می‌کنند.
 */

const DIGITS = 6;
const PERIOD = 30;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/* ------------------------------- Base32 ------------------------------- */

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[=\s-]/g, "").toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/* -------------------------------- TOTP -------------------------------- */

/** کلید تازه (۲۰ بایت = همان طولی که اپ‌های احرازهویت انتظار دارند) */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** کد شش‌رقمی یک بازهٔ مشخص */
export function totpCode(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const message = Buffer.alloc(8);
  message.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  message.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac("sha1", key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** کد فعلی (برای تست و نمایش) */
export function currentTotp(secret: string, now = Date.now()): string {
  return totpCode(secret, Math.floor(now / 1000 / PERIOD));
}

/**
 * بررسی کد کاربر.
 *
 * یک بازه قبل و بعد هم پذیرفته می‌شود تا اختلاف ساعت گوشی و سرور (تا ۳۰ ثانیه)
 * دردسر نشود؛ مقایسه هم زمان‌ثابت است تا از روی زمان پاسخ چیزی لو نرود.
 */
export function verifyTotp(secret: string, code: string, now = Date.now(), window = 1): boolean {
  const clean = code.replace(/[\s-]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  if (!/^\d{6}$/.test(clean) || !secret) return false;

  const counter = Math.floor(now / 1000 / PERIOD);
  for (let step = -window; step <= window; step += 1) {
    const expected = Buffer.from(totpCode(secret, counter + step));
    const given = Buffer.from(clean);
    if (expected.length === given.length && timingSafeEqual(expected, given)) return true;
  }
  return false;
}

/** آدرس otpauth:// برای QR (اپ احرازهویت همین را می‌خواند) */
export function otpauthUrl(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** کلید را چهارتایی جدا می‌کند تا دستی هم راحت وارد شود */
export function prettySecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/* ---------------------------- کدهای پشتیبان ---------------------------- */

/**
 * کدهای پشتیبان برای وقتی گوشی در دسترس نیست.
 * فقط یک بار به کاربر نشان داده می‌شوند و در دیتابیس هش‌شده می‌مانند.
 */
export function newBackupCodes(count = 8): { codes: string[]; hashed: string } {
  const codes = Array.from({ length: count }, () =>
    `${String(randomInt(0, 100_000)).padStart(5, "0")}-${String(randomInt(0, 100_000)).padStart(5, "0")}`,
  );
  return { codes, hashed: JSON.stringify(codes.map((code) => hashPassword(code))) };
}

/** اگر کد پشتیبان درست باشد، همان کد مصرف و از فهرست حذف می‌شود */
export function useBackupCode(
  stored: string | null | undefined,
  code: string,
): { ok: boolean; rest: string; left: number } {
  const clean = code.replace(/\s/g, "");
  let hashes: string[] = [];
  try {
    hashes = stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    hashes = [];
  }

  const index = hashes.findIndex((hash) => verifyPassword(clean, hash));
  if (index < 0) return { ok: false, rest: JSON.stringify(hashes), left: hashes.length };

  hashes.splice(index, 1);
  return { ok: true, rest: JSON.stringify(hashes), left: hashes.length };
}

export function backupCodesLeft(stored: string | null | undefined): number {
  try {
    return stored ? (JSON.parse(stored) as string[]).length : 0;
  } catch {
    return 0;
  }
}
