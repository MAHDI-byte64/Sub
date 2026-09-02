"use client";

import { useEffect, useState } from "react";
import { removePushAction, savePushAction } from "@/app/actions/push";

type State = "loading" | "unsupported" | "off" | "on" | "denied";

/** تبدیل کلید VAPID (base64url) به Uint8Array که مرورگر می‌خواهد */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * روشن/خاموش کردن اعلان پوش روی همین دستگاه.
 * اگر مرورگر پشتیبانی نکند (مثلاً سافاری قدیمی) پیام راهنما نشان می‌دهد.
 */
export default function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (alive) setState("unsupported");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const existing = await registration.pushManager.getSubscription();
        if (!alive) return;
        if (Notification.permission === "denied") setState("denied");
        else setState(existing ? "on" : "off");
      } catch {
        if (alive) setState("unsupported");
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const sub =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const result = await savePushAction({
        endpoint: json.endpoint ?? "",
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      });
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setState("on");
      setMessage("اعلان‌ها روی این دستگاه روشن شد.");
    } catch (err) {
      setMessage(`روشن‌کردن اعلان ناموفق بود: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await removePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setMessage("اعلان‌ها روی این دستگاه خاموش شد.");
    } catch (err) {
      setMessage(`خاموش‌کردن اعلان ناموفق بود: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`push-box${state === "on" ? " is-on" : ""}`}>
      <div className="push-head">
        <span className="push-icon" aria-hidden>
          {state === "on" ? "🔔" : "🔕"}
        </span>
        <div>
          <b>اعلان روی این دستگاه</b>
          <small>
            {state === "on"
              ? "یادآوری انقضا، اتمام حجم و پاسخ پشتیبانی را حتی وقتی سایت باز نیست می‌گیرید."
              : "با روشن‌کردن، یادآوری انقضا و پاسخ پشتیبانی مستقیم روی گوشی‌تان می‌آید."}
          </small>
        </div>
      </div>

      {message ? <div className="alert alert-info">{message}</div> : null}

      {state === "loading" ? (
        <span className="dim" style={{ fontSize: 12.5 }}>
          در حال بررسی…
        </span>
      ) : state === "unsupported" ? (
        <span className="dim" style={{ fontSize: 12.5 }}>
          مرورگر شما اعلان پوش را پشتیبانی نمی‌کند. روی آیفون، اول سایت را با «افزودن به صفحهٔ اصلی»
          نصب کنید.
        </span>
      ) : state === "denied" ? (
        <span className="dim" style={{ fontSize: 12.5 }}>
          اجازهٔ نمایش اعلان در مرورگر بسته شده است؛ از تنظیمات سایت در مرورگر، اعلان‌ها را مجاز کنید.
        </span>
      ) : state === "on" ? (
        <button type="button" className="btn btn-sm" onClick={disable} disabled={busy}>
          {busy ? "…" : "خاموش کردن اعلان"}
        </button>
      ) : (
        <button type="button" className="btn btn-sm btn-primary" onClick={enable} disabled={busy}>
          {busy ? "…" : "روشن کردن اعلان"}
        </button>
      )}
    </div>
  );
}
