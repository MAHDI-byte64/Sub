import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./i18n";

/**
 * زبان درخواست فعلی: اول کوکی (انتخاب خود کاربر)، بعد هدر Accept-Language.
 * با `cache` در طول یک درخواست فقط یک بار محاسبه می‌شود.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const jar = await cookies();
  const chosen = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  const accept = (await headers()).get("accept-language")?.toLowerCase() ?? "";
  // فارسی پیش‌فرض است؛ فقط اگر مرورگر صراحتاً انگلیسی را جلوتر از فارسی بخواهد، انگلیسی می‌شود
  const fa = accept.indexOf("fa");
  const en = accept.indexOf("en");
  if (en !== -1 && (fa === -1 || en < fa)) return "en";
  return DEFAULT_LOCALE;
});
