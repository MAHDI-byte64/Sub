import Link from "next/link";
import { db } from "@/lib/db";
import {
  checkAllPanelsAction,
  checkPanelAction,
  migratePanelServicesAction,
  resumePanelSalesAction,
} from "@/app/actions/admin";
import { latencyHistory, uptimeStats } from "@/lib/monitor";
import { asBool, getSettings } from "@/lib/settings";
import { faDate, faNum } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import AreaChart, { type ChartPoint } from "@/components/AreaChart";
import Flash from "@/components/Flash";

export const dynamic = "force-dynamic";
export const metadata = { title: "پایش سرورها" };

function pingLabel(ms: number): { text: string; cls: string } {
  if (ms <= 0) return { text: "—", cls: "" };
  if (ms < 400) return { text: "عالی", cls: "badge-success" };
  if (ms < 1200) return { text: "قابل قبول", cls: "badge-info" };
  return { text: "کند", cls: "badge-warn" };
}

export default async function AdminMonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; type?: string }>;
}) {
  const { msg, type } = await searchParams;

  const [panels, settings, day, week, serviceCounts] = await Promise.all([
    db.panel.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    getSettings(),
    uptimeStats(24),
    uptimeStats(24 * 7),
    db.service.groupBy({
      by: ["panelId"],
      where: { status: { in: ["active", "disabled"] } },
      _count: { _all: true },
    }),
  ]);

  const liveServices = new Map(serviceCounts.map((row) => [row.panelId, row._count._all]));

  // مقصدهای پیشنهادی برای انتقال: سرورهای سالم و فعال
  const healthyTargets = panels.filter((row) => row.healthOk && row.isActive && !row.autoDisabled);

  const histories = new Map<string, ChartPoint[]>();
  for (const panel of panels) {
    const rows = await latencyHistory(panel.id, 40);
    histories.set(
      panel.id,
      rows.map((row) => ({
        label: new Date(row.label).toLocaleTimeString("fa-IR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        value: row.value,
      })),
    );
  }

  const monitorOn = asBool(settings.monitor_enabled);
  const upCount = panels.filter((p) => p.healthOk).length;
  const downCount = panels.filter((p) => !p.healthOk).length;
  const suspended = panels.filter((p) => p.autoDisabled).length;
  const avgPing = (() => {
    const values = panels.map((p) => day.get(p.id)?.avgLatency ?? 0).filter((v) => v > 0);
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  })();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>پایش سرورها</h1>
          <p>وضعیت لحظه‌ای، زمان پاسخ و درصد آپتایم هر سرور 3x-ui.</p>
        </div>
        <div className="btn-row">
          <ActionForm
            action={checkAllPanelsAction}
            submitLabel="📡 بررسی همه همین حالا"
            buttonClass="btn btn-sm btn-primary"
            inline
          />
          <Link className="btn btn-sm" href="/admin/panels">
            مدیریت سرورها
          </Link>
        </div>
      </div>

      <Flash msg={msg} type={type} />

      {!monitorOn ? (
        <div className="alert alert-warn">
          بررسی خودکار خاموش است؛ داده‌ها فقط با دکمهٔ «بررسی همه» به‌روز می‌شوند. برای روشن‌کردن به{" "}
          <Link href="/admin/settings">تنظیمات</Link> بروید.
        </div>
      ) : null}

      <div className="summary-strip">
        <div className="summary-tile">
          <span>🟢 سرور سالم</span>
          <b>{faNum(upCount)}</b>
        </div>
        <div className="summary-tile">
          <span>🔴 سرور خراب</span>
          <b>{faNum(downCount)}</b>
        </div>
        <div className="summary-tile">
          <span>⏸️ خارج از چرخه فروش</span>
          <b>{faNum(suspended)}</b>
        </div>
        <div className="summary-tile">
          <span>⚡ میانگین پینگ ۲۴ ساعت</span>
          <b>{avgPing ? `${faNum(avgPing)} ms` : "—"}</b>
        </div>
      </div>

      {panels.map((panel) => {
        const stat24 = day.get(panel.id);
        const stat7 = week.get(panel.id);
        const points = histories.get(panel.id) ?? [];
        const ping = pingLabel(panel.latencyMs);

        return (
          <div className={`card mon-card${panel.healthOk ? "" : " is-down"}`} key={panel.id}>
            <div className="card-title">
              <h3>
                <span className={`mon-dot${panel.healthOk ? " is-up" : ""}`} aria-hidden />
                {panel.flag} {panel.name}
                <span className="dim" style={{ fontWeight: 500, fontSize: 13 }}>
                  {" "}
                  · {panel.location}
                </span>
              </h3>
              <div className="btn-row">
                {panel.autoDisabled ? <span className="badge badge-warn">فروش متوقف</span> : null}
                <span className={`badge ${panel.healthOk ? "badge-success" : "badge-danger"}`}>
                  {panel.healthOk ? "در دسترس" : "پاسخ نمی‌دهد"}
                </span>
              </div>
            </div>

            <div className="mon-facts">
              <span>
                <small>زمان پاسخ</small>
                <b>
                  {panel.latencyMs ? `${faNum(panel.latencyMs)} ms` : "—"}{" "}
                  {ping.text !== "—" ? <i className={`badge ${ping.cls}`}>{ping.text}</i> : null}
                </b>
              </span>
              <span>
                <small>آپتایم ۲۴ ساعت</small>
                <b>{stat24 ? `${faNum(stat24.uptime)}٪` : "بدون داده"}</b>
              </span>
              <span>
                <small>آپتایم ۷ روز</small>
                <b>{stat7 ? `${faNum(stat7.uptime)}٪` : "بدون داده"}</b>
              </span>
              <span>
                <small>آخرین بررسی</small>
                <b>{panel.lastCheckAt ? faDate(panel.lastCheckAt, true) : "انجام نشده"}</b>
              </span>
            </div>

            {points.length > 1 ? (
              <>
                <label className="field-hint" style={{ display: "block", margin: "6px 0 4px" }}>
                  نمودار زمان پاسخ ({faNum(points.length)} بررسی اخیر)
                </label>
                <AreaChart
                  id={`ping-${panel.id}`}
                  points={points}
                  height={120}
                  formatValue={(v) => `${faNum(Math.round(v))} ms`}
                />
              </>
            ) : (
              <p className="dim" style={{ fontSize: 12.5 }}>
                هنوز تاریخچه‌ای ثبت نشده است؛ بعد از چند بررسی، نمودار زمان پاسخ اینجا می‌آید.
              </p>
            )}

            {!panel.healthOk && panel.lastError ? (
              <div className="alert alert-error" style={{ marginTop: 12 }}>
                {panel.lastError}
              </div>
            ) : null}

            {!panel.healthOk && (liveServices.get(panel.id) ?? 0) > 0 ? (
              <div className="alert alert-warn" style={{ marginTop: 12 }}>
                <b>{faNum(liveServices.get(panel.id) ?? 0)} سرویس</b> روی این سرور است و تا برگشتنش
                قطع می‌مانند. می‌توانید همه را با حفظ حجم باقی‌مانده و انقضا به سرور دیگری منتقل
                کنید؛ لینک اشتراک کاربرها عوض می‌شود و خودشان هم اعلان می‌گیرند.
                {healthyTargets.length ? (
                  <ActionForm
                    action={migratePanelServicesAction}
                    submitLabel="🚚 انتقال همه"
                    buttonClass="btn btn-sm btn-primary"
                    className="row-form"
                    confirm="همهٔ سرویس‌های این سرور به سرور انتخاب‌شده منتقل شوند؟"
                  >
                    <input type="hidden" name="fromId" value={panel.id} />
                    <select name="panelId" defaultValue="" className="select-sm" aria-label="سرور مقصد">
                      <option value="">سرور مقصد…</option>
                      {healthyTargets
                        .filter((row) => row.id !== panel.id)
                        .map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.flag} {row.name}
                          </option>
                        ))}
                    </select>
                  </ActionForm>
                ) : (
                  <p className="dim" style={{ marginBottom: 0 }}>
                    سرور سالم دیگری برای انتقال ندارید.
                  </p>
                )}
              </div>
            ) : null}

            <div className="btn-row" style={{ marginTop: 12 }}>
              <ActionForm action={checkPanelAction} submitLabel="بررسی این سرور" buttonClass="btn btn-sm" inline>
                <input type="hidden" name="id" value={panel.id} />
              </ActionForm>
              {panel.autoDisabled ? (
                <ActionForm
                  action={resumePanelSalesAction}
                  submitLabel="بازگرداندن به فروش"
                  buttonClass="btn btn-sm btn-primary"
                  inline
                >
                  <input type="hidden" name="id" value={panel.id} />
                </ActionForm>
              ) : null}
              <Link className="btn btn-sm" href={`/admin/panels?edit=${panel.id}`}>
                تنظیمات سرور
              </Link>
            </div>
          </div>
        );
      })}

      {!panels.length ? (
        <div className="card center dim">
          هنوز سروری ثبت نشده است. <Link href="/admin/panels">اولین سرور را اضافه کنید</Link>.
        </div>
      ) : null}
    </div>
  );
}
