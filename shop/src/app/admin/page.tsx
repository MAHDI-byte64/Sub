import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { faDate, faNum, relativeTime, toman } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import AreaChart, { type ChartPoint } from "@/components/AreaChart";
import Donut from "@/components/Donut";

export const dynamic = "force-dynamic";

const WEEKDAY = ["ی", "د", "س", "چ", "پ", "ج", "ش"];

export default async function AdminHome() {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 29);

  const [
    revenue,
    approvedCount,
    pending,
    users,
    activeServices,
    panels,
    plans,
    settings,
    recent,
    openTickets,
    monthOrders,
    statusGroups,
    topPlans,
  ] = await Promise.all([
    db.order.aggregate({ where: { status: "approved" }, _sum: { payable: true } }),
    db.order.count({ where: { status: "approved" } }),
    db.order.count({ where: { status: "pending_review" } }),
    db.user.count(),
    db.service.count({ where: { status: "active" } }),
    db.panel.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.plan.count({ where: { isActive: true } }),
    getSettings(),
    db.order.findMany({ take: 8, orderBy: { createdAt: "desc" }, include: { user: true, plan: true } }),
    db.ticket.count({ where: { status: "open" } }),
    db.order.findMany({
      where: { status: "approved", reviewedAt: { gte: since } },
      select: { payable: true, reviewedAt: true },
    }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.order.groupBy({
      by: ["planId"],
      where: { status: "approved" },
      _count: { _all: true },
      _sum: { payable: true },
    }),
  ]);

  // درآمد ۳۰ روز گذشته
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    return d;
  });
  const chartPoints: ChartPoint[] = days.map((day) => {
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const value = monthOrders
      .filter((o) => o.reviewedAt && o.reviewedAt >= day && o.reviewedAt < next)
      .reduce((sum, o) => sum + o.payable, 0);
    return {
      label: WEEKDAY[day.getDay()],
      value,
      title: `${faDate(day)} — ${toman(value)}`,
    };
  });
  const monthTotal = chartPoints.reduce((sum, p) => sum + p.value, 0);
  const weekTotal = chartPoints.slice(-7).reduce((sum, p) => sum + p.value, 0);

  // توزیع وضعیت سفارش‌ها
  const statusColors: Record<string, string> = {
    approved: "#45d18b",
    pending_review: "#f4b740",
    awaiting_receipt: "#60a5fa",
    rejected: "#f87171",
    canceled: "#6e675f",
    failed: "#f87171",
  };
  const segments = statusGroups
    .map((g) => ({
      label: (ORDER_STATUS[g.status] ?? ORDER_STATUS.awaiting_receipt).label,
      value: g._count._all,
      color: statusColors[g.status] ?? "#6e675f",
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  const totalOrders = segments.reduce((sum, s) => sum + s.value, 0);

  // پرفروش‌ترین پلن‌ها
  const planIds = topPlans.map((p) => p.planId).filter((id): id is string => Boolean(id));
  const planRows = planIds.length
    ? await db.plan.findMany({ where: { id: { in: planIds } } })
    : [];
  const bestSellers = topPlans
    .map((p) => ({
      title: planRows.find((row) => row.id === p.planId)?.title ?? "—",
      count: p._count._all,
      revenue: p._sum.payable ?? 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const todo = [
    panels.length === 0 ? { text: "هنوز هیچ سرور 3x-ui اضافه نکرده‌اید.", href: "/admin/panels" } : null,
    plans === 0 ? { text: "هیچ پلن فعالی وجود ندارد.", href: "/admin/plans" } : null,
    settings.card_number.includes("0000")
      ? { text: "شماره کارت پیش‌فرض را با شماره واقعی جایگزین کنید.", href: "/admin/settings" }
      : null,
    !settings.telegram_bot_token
      ? { text: "برای اطلاع‌رسانی سفارش‌ها، توکن ربات تلگرام را وارد کنید.", href: "/admin/settings" }
      : null,
  ].filter(Boolean) as { text: string; href: string }[];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>داشبورد مدیریت</h1>
          <p>خلاصهٔ فروش، سلامت سرورها و کارهایی که منتظر شما هستند.</p>
        </div>
        <Link className="btn btn-sm" href="/">
          مشاهده سایت
        </Link>
      </div>

      <div className="admin-links" style={{ marginBottom: 18 }}>
        <Link className="admin-link" href="/admin/orders?status=pending_review">
          <i>🧾</i>
          <span>بررسی سفارش‌ها{pending > 0 ? ` (${faNum(pending)})` : ""}</span>
        </Link>
        <Link className="admin-link" href="/admin/tickets">
          <i>🎫</i>
          <span>تیکت‌ها{openTickets > 0 ? ` (${faNum(openTickets)})` : ""}</span>
        </Link>
        <Link className="admin-link" href="/admin/panels">
          <i>🖥️</i>
          <span>سرورهای 3x-ui</span>
        </Link>
        <Link className="admin-link" href="/admin/backup">
          <i>🗄️</i>
          <span>پشتیبان‌گیری</span>
        </Link>
        <Link className="admin-link" href="/admin/settings">
          <i>⚙️</i>
          <span>تنظیمات سایت</span>
        </Link>
      </div>

      <div className="summary-strip">
        <div className="summary-tile">
          <span>💰 درآمد کل</span>
          <b>{toman(revenue._sum.payable ?? 0, false)}</b>
        </div>
        <div className="summary-tile">
          <span>📅 درآمد ۳۰ روز</span>
          <b>{toman(monthTotal, false)}</b>
        </div>
        <div className="summary-tile">
          <span>🛒 سفارش موفق</span>
          <b>{faNum(approvedCount)}</b>
        </div>
        <div className="summary-tile">
          <span>🌐 سرویس فعال</span>
          <b>{faNum(activeServices)}</b>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-title">
            <h3>📈 درآمد ۳۰ روز گذشته</h3>
            <span className="badge badge-info">هفتهٔ اخیر: {toman(weekTotal)}</span>
          </div>
          <AreaChart id="revenue" points={chartPoints} formatValue={(v) => toman(v)} />
        </div>

        <div className="card">
          <div className="card-title">
            <h3>🧭 وضعیت سفارش‌ها</h3>
          </div>
          {totalOrders ? (
            <Donut segments={segments} centerValue={faNum(totalOrders)} centerLabel="کل سفارش‌ها" />
          ) : (
            <p className="dim">هنوز سفارشی ثبت نشده است.</p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>🖥️ سلامت سرورها</h3>
          <Link className="btn btn-sm" href="/admin/monitor">
            پایش زنده
          </Link>
        </div>
        {panels.length ? (
          <div className="health-grid">
            {panels.map((panel) => {
              const state = !panel.lastCheckAt ? "is-unknown" : panel.healthOk ? "" : "is-down";
              return (
                <div className={`health-tile ${state}`} key={panel.id}>
                  <span className="health-dot" />
                  <span className="ht-body">
                    <b>
                      {panel.flag} {panel.name}
                    </b>
                    <small>
                      {!panel.lastCheckAt
                        ? "هنوز تست نشده"
                        : !panel.healthOk
                          ? (panel.lastError ?? "پاسخ نداد").slice(0, 60)
                          : `${faNum(panel.latencyMs)} ms · آخرین بررسی ${relativeTime(panel.lastCheckAt)}`}
                    </small>
                  </span>
                  {panel.autoDisabled ? <span className="badge badge-warn">فروش متوقف</span> : null}
                  {!panel.isActive ? <span className="badge badge-warn">غیرفعال</span> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="dim">هنوز سروری اضافه نشده است.</p>
        )}
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-title">
            <h3>🏆 پرفروش‌ترین پلن‌ها</h3>
          </div>
          {bestSellers.length ? (
            <div className="svc-meta">
              {bestSellers.map((plan) => (
                <div className="meta-row" key={plan.title}>
                  <span>{plan.title}</span>
                  <b>
                    {faNum(plan.count)} فروش
                    <span className="dim" style={{ fontWeight: 500 }}>
                      {" "}
                      · {toman(plan.revenue)}
                    </span>
                  </b>
                </div>
              ))}
            </div>
          ) : (
            <p className="dim">هنوز فروشی ثبت نشده است.</p>
          )}
        </div>

        <div className="card">
          <div className="card-title">
            <h3>📋 کارهای باقی‌مانده</h3>
          </div>
          {todo.length ? (
            <div className="svc-meta">
              {todo.map((item) => (
                <Link className="meta-row" key={item.text} href={item.href}>
                  <span>⚠️ {item.text}</span>
                  <b className="gold nowrap">انجام ←</b>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty" style={{ padding: 20 }}>
              <div className="empty-icon">✅</div>
              همه‌چیز تنظیم شده است.
            </div>
          )}
          <div className="summary-strip" style={{ marginTop: 16, marginBottom: 0 }}>
            <div className="summary-tile">
              <span>👥 کاربر</span>
              <b>{faNum(users)}</b>
            </div>
            <div className="summary-tile">
              <span>🏷️ پلن فعال</span>
              <b>{faNum(plans)}</b>
            </div>
          </div>
        </div>
      </div>

      <div className="card data-card">
        <div className="data-head">
          <h3>آخرین سفارش‌ها</h3>
          <Link className="btn btn-sm" href="/admin/orders?status=all">
            همه سفارش‌ها
          </Link>
        </div>
        {recent.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>کد</th>
                  <th>کاربر</th>
                  <th>پلن</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>زمان</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((order) => {
                  const status = ORDER_STATUS[order.status] ?? ORDER_STATUS.awaiting_receipt;
                  return (
                    <tr key={order.id}>
                      <td className="mono">{order.code}</td>
                      <td className="ltr">{order.user.email}</td>
                      <td>{order.plan?.title ?? "شارژ کیف پول"}</td>
                      <td className="nowrap">{toman(order.payable)}</td>
                      <td>
                        <span className={`badge ${status.badge}`}>{status.label}</span>
                      </td>
                      <td className="nowrap">{relativeTime(order.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dim" style={{ padding: 20 }}>
            هنوز سفارشی ثبت نشده است.
          </p>
        )}
      </div>
    </div>
  );
}
