import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { uptimeStats } from "@/lib/monitor";
import { asBool, getSettings } from "@/lib/settings";
import { faNum, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "وضعیت سرورها",
  description: "وضعیت لحظه‌ای سرورها، درصد آپتایم و زمان پاسخ.",
};

function bar(uptime: number): string {
  if (uptime >= 99) return "is-great";
  if (uptime >= 95) return "is-good";
  if (uptime >= 80) return "is-warn";
  return "is-bad";
}

export default async function StatusPage() {
  const settings = await getSettings();
  if (!asBool(settings.status_page_enabled)) notFound();

  const [panels, day, week] = await Promise.all([
    db.panel.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    uptimeStats(24),
    uptimeStats(24 * 7),
  ]);

  const healthy = panels.filter((p) => p.healthOk).length;
  const allGood = panels.length > 0 && healthy === panels.length;
  const someDown = panels.length > 0 && healthy === 0;

  return (
    <div className="container section" style={{ maxWidth: 980 }}>
      <div className="section-head">
        <span className="eyebrow">
          <span className="eyebrow-dot" />
          به‌روزرسانی خودکار هر ۱۵ دقیقه
        </span>
        <h1>وضعیت سرورها</h1>
        <p>هر سرور به‌طور خودکار بررسی می‌شود؛ نتیجهٔ همان بررسی‌ها را اینجا می‌بینید.</p>
      </div>

      <div
        className={`card status-hero ${someDown ? "is-bad" : allGood ? "is-great" : "is-warn"}`}
      >
        <span className="status-hero-dot" aria-hidden />
        <div>
          <b>
            {!panels.length
              ? "هنوز سروری ثبت نشده است"
              : someDown
                ? "اختلال گسترده"
                : allGood
                  ? "همهٔ سرورها سالم‌اند"
                  : "اختلال روی بعضی سرورها"}
          </b>
          <small>
            {panels.length
              ? `${faNum(healthy)} سرور از ${faNum(panels.length)} سرور در دسترس است.`
              : "به‌زودی سرورها اضافه می‌شوند."}
          </small>
        </div>
      </div>

      <div className="grid grid-2">
        {panels.map((panel) => {
          const s24 = day.get(panel.id);
          const s7 = week.get(panel.id);
          const uptime = s24?.uptime ?? (panel.healthOk ? 100 : 0);

          return (
            <div className={`card status-card${panel.healthOk ? "" : " is-down"}`} key={panel.id}>
              <div className="card-title">
                <h3>
                  {panel.flag} {panel.location}
                </h3>
                <span className={`badge ${panel.healthOk ? "badge-success" : "badge-danger"}`}>
                  {panel.healthOk ? "در دسترس" : "موقتاً خارج از دسترس"}
                </span>
              </div>

              <div className="status-bar-wrap">
                <div className={`status-bar ${bar(uptime)}`}>
                  <span style={{ width: `${Math.max(2, Math.min(100, uptime))}%` }} />
                </div>
                <b>{faNum(uptime)}٪</b>
              </div>

              <div className="status-facts">
                <span>
                  <small>زمان پاسخ</small>
                  <b>{panel.latencyMs ? `${faNum(panel.latencyMs)} ms` : "—"}</b>
                </span>
                <span>
                  <small>آپتایم ۷ روز</small>
                  <b>{s7 ? `${faNum(s7.uptime)}٪` : "—"}</b>
                </span>
                <span>
                  <small>آخرین بررسی</small>
                  <b>{panel.lastCheckAt ? relativeTime(panel.lastCheckAt) : "—"}</b>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <p className="field-hint" style={{ margin: 0 }}>
          سرویس شما روی یکی از این سرورهاست. اگر سرور شما اختلال دارد، می‌توانید از{" "}
          <Link href="/dashboard/tickets">بخش تیکت‌ها</Link> درخواست تعویض سرور بدهید؛ حجم و اعتبارتان
          منتقل می‌شود.
        </p>
      </div>
    </div>
  );
}
