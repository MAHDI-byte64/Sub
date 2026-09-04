import Link from "next/link";
import { db } from "@/lib/db";
import { orderTitle } from "@/lib/orders";
import { requireUser } from "@/lib/auth";
import { fmt } from "@/lib/format";
import { orderStatus } from "@/lib/status";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "سفارش‌ها" };

const STATUS_ICON: Record<string, string> = {
  awaiting_receipt: "💳",
  pending_review: "⏳",
  approved: "✅",
  rejected: "⚠️",
  canceled: "✖️",
  failed: "⚠️",
};

export default async function OrdersPage() {
  const user = await requireUser("/dashboard/orders");
  const locale = await getLocale();
  const tr = translator(locale);
  const f = fmt(locale);
  const orders = await db.order.findMany({
    where: { userId: user.id },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  const pending = orders.filter((o) => o.status === "awaiting_receipt" || o.status === "pending_review");
  const approved = orders.filter((o) => o.status === "approved");
  const spent = approved.reduce((sum, o) => sum + o.payable, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{tr("dashPages.ordersTitle")}</h1>
          <p>{tr("dashPages.ordersSubtitle")}</p>
        </div>
        <Link className="btn btn-sm btn-primary" href="/plans">
          {tr("dashPages.newOrder")}
        </Link>
      </div>

      {orders.length ? (
        <div className="summary-strip">
          <div className="summary-tile">
            <span>{tr("dashPages.totalOrders")}</span>
            <b>{f.num(orders.length)}</b>
          </div>
          <div className="summary-tile">
            <span>{tr("dashPages.successful")}</span>
            <b>{f.num(approved.length)}</b>
          </div>
          <div className="summary-tile">
            <span>{tr("dashPages.totalPaid")}</span>
            <b>{f.money(spent, false)}</b>
          </div>
          <div className="summary-tile">
            <span>{tr("dashPages.lastOrder")}</span>
            <b>{orders[0] ? f.date(orders[0].createdAt) : "—"}</b>
          </div>
        </div>
      ) : null}

      {pending.length ? (
        <div className="alert alert-warn">
          {tr("dashPages.pendingAlert", { count: f.num(pending.length) })}
        </div>
      ) : null}

      {orders.length ? (
        <div className="grid" style={{ gap: 12 }}>
          {orders.map((order) => {
            const status = orderStatus(locale, order.status);
            return (
              <Link className="order-row" key={order.id} href={`/dashboard/orders/${order.code}`}>
                <span className="oi">{STATUS_ICON[order.status] ?? "🧾"}</span>
                <span className="om">
                  <b>
                    {order.kind === "topup" ? tr("dashPages.topupOrder") : orderTitle(locale, order)}
                    {order.renewServiceId ? tr("dashPages.renewSuffix") : ""}
                  </b>
                  <small className="mono">{order.code}</small>
                  <small> · {f.date(order.createdAt)}</small>
                </span>
                <span className="oa">
                  <b>{f.money(order.payable)}</b>
                  <span className={`badge ${status.badge}`}>{status.label}</span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">🧾</div>
          <p>{tr("dashPages.noOrders")}</p>
          <Link className="btn btn-primary" href="/plans">
            {tr("dashPages.seePlans")}
          </Link>
        </div>
      )}
    </div>
  );
}
