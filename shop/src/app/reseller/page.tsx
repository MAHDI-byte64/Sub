import Link from "next/link";
import { db } from "@/lib/db";
import { requireReseller } from "@/lib/auth";
import { resellerOptions, resellerPlans, resellerProfile, resellerStats } from "@/lib/reseller";
import { faDate, faNum, formatBytes, relativeTime, remainingDays, toman } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ResellerHomePage() {
  const user = await requireReseller();
  const [profile, stats, allPlans, recent, expiring, options] = await Promise.all([
    resellerProfile(user.id),
    resellerStats(user.id),
    resellerPlans(user.resellerOff),
    db.service.findMany({
      where: { resellerId: user.id },
      include: { plan: true, panel: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.service.findMany({
      where: {
        resellerId: user.id,
        status: "active",
        expiresAt: { lte: new Date(Date.now() + 5 * 86_400_000) },
      },
      include: { plan: true },
      orderBy: { expiresAt: "asc" },
      take: 5,
    }),
    resellerOptions(),
  ]);

  // اگر مدیر پلن‌های آماده را برای نماینده بسته باشد، فقط نرخ دلخواه می‌ماند
  const plans = options.showPlans ? allPlans : [];

  const cheapest = plans.reduce(
    (best, plan) => (best === null || plan.price < best.price ? plan : best),
    null as (typeof plans)[number] | null,
  );
  const lowCredit = cheapest ? profile.balance < cheapest.price : false;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{profile.resellerName || "پنل نمایندگی"}</h1>
          <p>خرید با قیمت عمده، تحویل آنی، و مدیریت مشتری‌های خودتان.</p>
        </div>
        <div className="btn-row">
          <span className="badge badge-info">{faNum(profile.discount)}٪ تخفیف نمایندگی</span>
          <Link className="btn btn-sm btn-primary" href="/reseller/sell">
            فروش سرویس تازه
          </Link>
        </div>
      </div>

      {lowCredit ? (
        <div className="alert alert-warn">
          موجودی شما برای ارزان‌ترین پلن ({toman(cheapest?.price ?? 0)}) کافی نیست.{" "}
          <Link href="/reseller/wallet">شارژ اعتبار</Link>
        </div>
      ) : null}

      <div className="summary-strip">
        <div className="summary-tile">
          <span>💰 اعتبار</span>
          <b>{toman(profile.balance, false)}</b>
          <small className="dim">
            <Link href="/reseller/wallet">شارژ حساب</Link>
          </small>
        </div>
        <div className="summary-tile">
          <span>🌐 سرویس فعال</span>
          <b>{faNum(stats.active)}</b>
        </div>
        <div className="summary-tile">
          <span>👥 کل مشتری‌ها</span>
          <b>{faNum(stats.services)}</b>
        </div>
        <div className="summary-tile">
          <span>⏳ نزدیک انقضا</span>
          <b>{faNum(stats.expiringSoon)}</b>
        </div>
        <div className="summary-tile">
          <span>🧾 مجموع خرید</span>
          <b>{toman(stats.spent, false)}</b>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-title">
            <h3>⏳ سرویس‌های نزدیک انقضا</h3>
            <Link className="btn btn-sm" href="/reseller/services">
              همه مشتری‌ها
            </Link>
          </div>
          {expiring.length ? (
            <div className="svc-meta">
              {expiring.map((service) => {
                const days = remainingDays(service.expiresAt);
                return (
                  <div className="meta-row is-low" key={service.id}>
                    <span>
                      {service.customerName || service.remark}
                      <small className="dim"> · {service.plan?.title ?? "—"}</small>
                    </span>
                    <b>
                      <Link href={`/reseller/services/${service.id}`}>
                        {days !== null && days > 0 ? `${faNum(days)} روز مانده` : "منقضی"}
                      </Link>
                    </b>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="dim">فعلاً سرویسی نزدیک انقضا ندارید.</p>
          )}
        </div>

        <div className="card">
          <div className="card-title">
            <h3>🏷️ قیمت عمدهٔ شما</h3>
            <Link className="btn btn-sm" href="/reseller/prices">
              لیست کامل
            </Link>
          </div>
          <div className="svc-meta">
            {options.showCustom ? (
              <>
                <div className="meta-row">
                  <span>📦 هر گیگابایت</span>
                  <b>{toman(options.rates.perGb)}</b>
                </div>
                <div className="meta-row">
                  <span>📅 هر روز</span>
                  <b>{toman(options.rates.perDay)}</b>
                </div>
              </>
            ) : null}
            {plans.slice(0, 5).map((plan) => (
              <div className="meta-row" key={plan.id}>
                <span>{plan.title}</span>
                <b>
                  {toman(plan.price)}
                  <span className="dim" style={{ fontWeight: 500, textDecoration: "line-through" }}>
                    {" "}
                    {toman(plan.listPrice, false)}
                  </span>
                </b>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>🕒 آخرین فروش‌ها</h3>
          <Link className="btn btn-sm" href="/reseller/services">
            مدیریت مشتری‌ها
          </Link>
        </div>
        {recent.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>مشتری</th>
                  <th>پلن</th>
                  <th>مصرف</th>
                  <th>انقضا</th>
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((service) => (
                  <tr key={service.id}>
                    <td>
                      <Link className="cell-main gold" href={`/reseller/services/${service.id}`}>
                        {service.customerName || "بدون نام"}
                      </Link>
                      <span className="cell-sub mono">{service.clientEmail}</span>
                    </td>
                    <td className="nowrap">{service.plan?.title ?? "—"}</td>
                    <td className="nowrap">
                      <span className="cell-main">{formatBytes(service.usedBytes, "۰")}</span>
                      <span className="cell-sub">
                        {service.totalBytes > 0 ? `از ${formatBytes(service.totalBytes)}` : "نامحدود"}
                      </span>
                    </td>
                    <td className="nowrap">
                      <span className="cell-main">{faDate(service.expiresAt)}</span>
                      <span className="cell-sub">{relativeTime(service.createdAt)}</span>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ padding: 26 }}>
            <div className="empty-icon">🛒</div>
            <p>هنوز سرویسی نفروخته‌اید.</p>
            <Link className="btn btn-primary" href="/reseller/sell">
              فروش اولین سرویس
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
