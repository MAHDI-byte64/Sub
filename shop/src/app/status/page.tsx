import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { uptimeStats } from "@/lib/monitor";
import { asBool, getSettings } from "@/lib/settings";
import { fmt } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";

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

  const locale = await getLocale();
  const tr = translator(locale);
  const f = fmt(locale);

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
          {tr("status.autoUpdate")}
        </span>
        <h1>{tr("status.title")}</h1>
        <p>{tr("status.subtitle")}</p>
      </div>

      <div className={`card status-hero ${someDown ? "is-bad" : allGood ? "is-great" : "is-warn"}`}>
        <span className="status-hero-dot" aria-hidden />
        <div>
          <b>
            {!panels.length
              ? tr("status.none")
              : someDown
                ? tr("status.allDown")
                : allGood
                  ? tr("status.allGood")
                  : tr("status.someDown")}
          </b>
          <small>
            {panels.length
              ? tr("status.ofServers", { ok: f.num(healthy), total: f.num(panels.length) })
              : ""}
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
                  {panel.healthOk ? tr("status.available") : tr("status.unavailable")}
                </span>
              </div>

              <div className="status-bar-wrap">
                <div className={`status-bar ${bar(uptime)}`}>
                  <span style={{ width: `${Math.max(2, Math.min(100, uptime))}%` }} />
                </div>
                <b>{f.num(uptime)}٪</b>
              </div>

              <div className="status-facts">
                <span>
                  <small>{tr("status.latency")}</small>
                  <b>{panel.latencyMs ? `${f.num(panel.latencyMs)} ms` : "—"}</b>
                </span>
                <span>
                  <small>{tr("status.uptime7")}</small>
                  <b>{s7 ? `${f.num(s7.uptime)}٪` : "—"}</b>
                </span>
                <span>
                  <small>{tr("status.lastCheck")}</small>
                  <b>{panel.lastCheckAt ? f.relative(panel.lastCheckAt) : "—"}</b>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <p className="field-hint" style={{ margin: 0 }}>
          {tr("status.switchHint")}
        </p>
      </div>

      <div className="center" style={{ marginTop: 16 }}>
        <Link className="btn btn-sm" href="/dashboard/tickets">
          {tr("footer.ticket")}
        </Link>
      </div>
    </div>
  );
}
