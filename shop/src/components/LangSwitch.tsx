"use client";

import { LOCALE_COOKIE, LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n";

/**
 * تعویض زبان سایت.
 *
 * زبان در یک کوکی معمولی (نه httpOnly) نگه داشته می‌شود تا هم سرور در همان
 * درخواست بعدی آن را بخواند و هم بین بازدیدها بماند.
 */
export default function LangSwitch({ locale }: { locale: Locale }) {
  function choose(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
    window.location.reload();
  }

  return (
    <div className="lang-switch" role="group" aria-label={locale === "fa" ? "زبان" : "Language"}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          className={`lang-btn${code === locale ? " is-active" : ""}`}
          onClick={() => choose(code)}
          lang={code}
        >
          {code === "fa" ? "فا" : "EN"}
          <span className="sr-only"> {LOCALE_LABEL[code]}</span>
        </button>
      ))}
    </div>
  );
}
