import "server-only";
import { headers } from "next/headers";

/**
 * آدرس عمومی سایت برای ساختن لینک بازگشت درگاه و لینک‌های داخل اعلان‌ها.
 * اول از APP_URL خوانده می‌شود و اگر نبود، از هدرهای همان درخواست ساخته می‌شود.
 */
export async function siteUrl(): Promise<string> {
  const fromEnv = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;

  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") || (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
