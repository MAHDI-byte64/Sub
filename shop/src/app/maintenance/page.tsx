import Link from "next/link";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "در حال به‌روزرسانی",
  robots: { index: false, follow: false },
};

export default async function MaintenancePage() {
  const s = await getSettings();
  const tg = s.support_telegram.replace("@", "");

  return (
    <div className="container section maint-wrap">
      <div className="card maint-card">
        <div className="maint-icon" aria-hidden>
          🛠️
        </div>
        <h1>{s.maintenance_title || "در حال به‌روزرسانی هستیم"}</h1>
        <p>{s.maintenance_message}</p>

        {s.maintenance_until ? (
          <div className="maint-eta">
            <span>⏰ زمان تقریبی بازگشت</span>
            <b>{s.maintenance_until}</b>
          </div>
        ) : null}

        <div className="maint-note">
          <b>سرویس شما قطع نشده است.</b>
          <span>
            کانفیگ‌ها و لینک اشتراک شما مستقل از سایت کار می‌کنند؛ این وقفه فقط برای خودِ سایت است.
          </span>
        </div>

        <div className="btn-row" style={{ justifyContent: "center" }}>
          <a className="btn btn-primary" href={`https://t.me/${tg}`} target="_blank" rel="noreferrer">
            پشتیبانی در تلگرام
          </a>
          <Link className="btn" href="/login">
            ورود مدیر
          </Link>
        </div>
      </div>
    </div>
  );
}
