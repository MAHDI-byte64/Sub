import Link from "next/link";
import { requireReseller } from "@/lib/auth";
import { resellerServices, resellerStats } from "@/lib/reseller";
import { faDate, faNum, formatBytes, remainingDays } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "مشتری‌های من" };

export default async function ResellerServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const user = await requireReseller();
  const { q, status } = await searchParams;
  const search = (q ?? "").trim();

  const [all, stats] = await Promise.all([resellerServices(user.id, search), resellerStats(user.id)]);
  const services = status && status !== "all" ? all.filter((s) => s.status === status) : all;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>مشتری‌های من</h1>
          <p>سرویس‌هایی که فروخته‌اید، با مصرف و تاریخ انقضا.</p>
        </div>
        <Link className="btn btn-sm btn-primary" href="/reseller/sell">
          فروش سرویس تازه
        </Link>
      </div>

      <div className="summary-strip">
        <div className="summary-tile">
          <span>🌐 فعال</span>
          <b>{faNum(stats.active)}</b>
        </div>
        <div className="summary-tile">
          <span>⌛ منقضی</span>
          <b>{faNum(stats.expired)}</b>
        </div>
        <div className="summary-tile">
          <span>⏳ نزدیک انقضا</span>
          <b>{faNum(stats.expiringSoon)}</b>
        </div>
        <div className="summary-tile">
          <span>📊 مجموع مصرف</span>
          <b>{formatBytes(stats.usedBytes, "۰")}</b>
        </div>
      </div>

      <div className="card">
        <form
          action="/reseller/services"
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}
        >
          <input
            name="q"
            defaultValue={search}
            placeholder="نام مشتری، نام کلاینت یا پلن…"
            style={{ flex: 1, minWidth: 200 }}
          />
          <select name="status" defaultValue={status ?? "all"} style={{ width: "auto" }}>
            <option value="all">همه وضعیت‌ها</option>
            <option value="active">فعال</option>
            <option value="expired">منقضی</option>
            <option value="disabled">غیرفعال</option>
          </select>
          <button className="btn btn-sm" type="submit">
            جستجو
          </button>
        </form>

        {services.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>مشتری</th>
                  <th>پلن و لوکیشن</th>
                  <th>مصرف</th>
                  <th>انقضا</th>
                  <th>وضعیت</th>
                  <th>اقدام</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => {
                  const days = remainingDays(service.expiresAt);
                  const low = days !== null && days <= 3;
                  return (
                    <tr key={service.id}>
                      <td>
                        <Link className="cell-main gold" href={`/reseller/services/${service.id}`}>
                          {service.customerName || "بدون نام"}
                        </Link>
                        <span className="cell-sub mono">{service.clientEmail}</span>
                      </td>
                      <td className="nowrap">
                        <span className="cell-main">{service.plan?.title ?? "—"}</span>
                        <span className="cell-sub">
                          {service.panel.flag} {service.panel.location}
                        </span>
                      </td>
                      <td className="nowrap">
                        <span className="cell-main">{formatBytes(service.usedBytes, "۰")}</span>
                        <span className="cell-sub">
                          {service.totalBytes > 0
                            ? `از ${formatBytes(service.totalBytes)}`
                            : "نامحدود"}
                        </span>
                      </td>
                      <td className="nowrap">
                        <span className="cell-main">{faDate(service.expiresAt)}</span>
                        {days !== null ? (
                          <span className={`cell-sub${low ? " gold" : ""}`}>
                            {days > 0 ? `${faNum(days)} روز مانده` : "منقضی"}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            service.status === "active"
                              ? "badge-success"
                              : service.status === "expired"
                                ? "badge-danger"
                                : "badge-warn"
                          }`}
                        >
                          {service.status === "active"
                            ? "فعال"
                            : service.status === "expired"
                              ? "منقضی"
                              : "غیرفعال"}
                        </span>
                      </td>
                      <td>
                        <Link className="btn btn-sm" href={`/reseller/services/${service.id}`}>
                          کانفیگ و تمدید
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ padding: 26 }}>
            <div className="empty-icon">👥</div>
            <p>{search ? "مشتری‌ای با این مشخصات پیدا نشد." : "هنوز مشتری‌ای ثبت نکرده‌اید."}</p>
            <Link className="btn btn-primary" href="/reseller/sell">
              فروش سرویس
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
