import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "در حال به‌روزرسانی",
  robots: { index: false, follow: false },
};

export default async function MaintenancePage() {
  const [s, locale] = await Promise.all([getSettings(), getLocale()]);
  const tr = translator(locale);
  const tg = s.support_telegram.replace("@", "");

  // متن دلخواه مدیر فقط برای فارسی است؛ در حالت انگلیسی متن پیش‌فرض نمایش داده می‌شود
  const title = locale === "fa" ? s.maintenance_title || tr("maintenance.title") : tr("maintenance.title");
  const message = locale === "fa" ? s.maintenance_message : tr("maintenance.safeText");

  return (
    <div className="container section maint-wrap">
      <div className="card maint-card">
        <div className="maint-icon" aria-hidden>
          🛠️
        </div>
        <h1>{title}</h1>
        <p>{message}</p>

        {s.maintenance_until && locale === "fa" ? (
          <div className="maint-eta">
            <span>⏰ {tr("maintenance.eta")}</span>
            <b>{s.maintenance_until}</b>
          </div>
        ) : null}

        <div className="maint-note">
          <b>{tr("maintenance.safe")}</b>
          <span>{tr("maintenance.safeText")}</span>
        </div>

        <div className="btn-row" style={{ justifyContent: "center" }}>
          <a className="btn btn-primary" href={`https://t.me/${tg}`} target="_blank" rel="noreferrer">
            {tr("maintenance.telegram")}
          </a>
          <Link className="btn" href="/login">
            {tr("maintenance.adminLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
}
