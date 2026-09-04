import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["application/pdf", "pdf"],
]);

const MAX_BYTES = 6 * 1024 * 1024;

export function uploadDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR || "./data/uploads");
}

export function uploadPath(fileName: string): string {
  // جلوگیری از path traversal
  const safe = path.basename(fileName);
  return path.join(/*turbopackIgnore: true*/ uploadDir(), safe);
}

export type SavedFile = { ok: true; fileName: string } | { ok: false; error: string };

/**
 * ذخیرهٔ یک فایل آپلودی (رسید پرداخت یا پیوست تیکت).
 *
 * نام فایل روی دیسک همیشه ساختهٔ خودمان است (زمان + بایت تصادفی) و پسوند از
 * روی نوع اعلام‌شده انتخاب می‌شود، پس نام فرستادهٔ کاربر هیچ‌وقت به مسیر
 * فایل راه پیدا نمی‌کند.
 */
export async function saveUpload(file: File): Promise<SavedFile> {
  if (!file || file.size === 0) return { ok: false, error: "فایلی انتخاب نشده است." };
  if (file.size > MAX_BYTES) return { ok: false, error: "حجم فایل نباید بیشتر از ۶ مگابایت باشد." };
  const ext = ALLOWED.get(file.type);
  if (!ext) return { ok: false, error: "فقط تصویر (JPG, PNG, WEBP) یا PDF مجاز است." };

  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  const fileName = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, fileName), buffer);
  return { ok: true, fileName };
}

/** رسید پرداخت */
export function saveReceipt(file: File): Promise<SavedFile> {
  return saveUpload(file);
}

/** پیوست تیکت پشتیبانی؛ همان محدودیت‌های رسید را دارد */
export function saveAttachment(file: File): Promise<SavedFile> {
  return saveUpload(file);
}

/** نام امن برای نمایش (نام اصلی فایل کاربر، بدون مسیر و بدون کاراکتر خطرناک) */
export function displayName(name: string, max = 60): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f<>"']/g, "").trim();
  return clean.slice(0, max) || "پیوست";
}

/** آیا این فایل تصویر است (برای نمایش پیش‌نمایش) */
export function isImageFile(fileName: string): boolean {
  return contentTypeOf(fileName).startsWith("image/");
}

export function contentTypeOf(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    default:
      return "image/jpeg";
  }
}
