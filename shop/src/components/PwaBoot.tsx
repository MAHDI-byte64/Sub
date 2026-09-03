"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "fandogh-install-dismissed";

/**
 * راه‌اندازی PWA:
 *   ۱) ثبت سرویس‌ورکر (برای صفحهٔ آفلاین و اعلان پوش)
 *   ۲) پیشنهاد «نصب اپ» وقتی مرورگر اجازه می‌دهد — یک بار، و اگر کاربر ببندد
 *      تا یک ماه دیگر پیشنهاد نمی‌شود
 */
export default function PwaBoot() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => null);
    }

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    const recentlyDismissed = Date.now() - dismissedAt < 30 * 86_400_000;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      if (!recentlyDismissed) setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setVisible(false));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible || !event) return null;

  return (
    <div className="install-bar" role="dialog" aria-label="نصب اپ">
      <span className="install-icon" aria-hidden>
        📲
      </span>
      <div className="install-text">
        <b>نصب اپ فندق</b>
        <small>سریع‌تر باز می‌شود و اعلان انقضا را روی گوشی می‌گیرید.</small>
      </div>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={async () => {
            await event.prompt();
            await event.userChoice.catch(() => null);
            setVisible(false);
          }}
        >
          نصب
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
            setVisible(false);
          }}
        >
          بعداً
        </button>
      </div>
    </div>
  );
}
