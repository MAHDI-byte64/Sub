"use client";

import { useEffect, useState } from "react";
import { removePushAction, savePushAction } from "@/app/actions/push";
import { t, type Locale } from "@/lib/i18n";

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
export default function PushToggle({
  publicKey,
  locale = "fa",
}: {
  publicKey: string;
  locale?: Locale;
}) {
  const tr = (key: string) => t(locale, key);
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
      setMessage(tr("push.onDone"));
    } catch (err) {
      setMessage(`${tr("push.turnOn")}: ${(err as Error).message}`);
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
      setMessage(tr("push.offDone"));
    } catch (err) {
      setMessage(`${tr("push.turnOff")}: ${(err as Error).message}`);
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
          <b>{tr("push.title")}</b>
          <small>{state === "on" ? tr("push.onText") : tr("push.offText")}</small>
        </div>
      </div>

      {message ? <div className="alert alert-info">{message}</div> : null}

      {state === "loading" ? (
        <span className="dim" style={{ fontSize: 12.5 }}>
          {tr("push.checking")}
        </span>
      ) : state === "unsupported" ? (
        <span className="dim" style={{ fontSize: 12.5 }}>
          {tr("push.unsupported")}
        </span>
      ) : state === "denied" ? (
        <span className="dim" style={{ fontSize: 12.5 }}>
          {tr("push.denied")}
        </span>
      ) : state === "on" ? (
        <button type="button" className="btn btn-sm" onClick={disable} disabled={busy}>
          {busy ? "…" : tr("push.turnOff")}
        </button>
      ) : (
        <button type="button" className="btn btn-sm btn-primary" onClick={enable} disabled={busy}>
          {busy ? "…" : tr("push.turnOn")}
        </button>
      )}
    </div>
  );
}
