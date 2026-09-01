import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { faDate, toman } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";

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
  const orders = await db.order.findMany({
    where: { userId: user.id },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  const pending = orders.filter((o) => o.status === "awaiting_receipt" || o.status === "pending_review");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>سفارش‌های من</h1>
          <p>وضعیت پرداخت و تحویل همهٔ سفارش‌ها اینجاست.</p>
        </div>
        <Link className="btn btn-sm btn-primary" href="/plans">
          سفارش جدید
        </Link>
      </div>

      {pending.length ? (
        <div className="alert alert-warn">
          ⏳ {pending.length === 1 ? "یک سفارش" : `${pending.length} سفارش`} در انتظار پرداخت یا بررسی دارید.
        </div>
      ) : null}

      {orders.length ? (
        <div className="grid" style={{ gap: 12 }}>
          {orders.map((order) => {
            const status = ORDER_STATUS[order.status] ?? ORDER_STATUS.awaiting_receipt;
            return (
              <Link className="order-row" key={order.id} href={`/dashboard/orders/${order.code}`}>
                <span className="oi">{STATUS_ICON[order.status] ?? "🧾"}</span>
                <span className="om">
                  <b>
                    {order.plan.title}
                    {order.renewServiceId ? " — تمدید" : ""}
                  </b>
                  <small className="mono">{order.code}</small>
                  <small> · {faDate(order.createdAt)}</small>
                </span>
                <span className="oa">
                  <b>{toman(order.payable)}</b>
                  <span className={`badge ${status.badge}`}>{status.label}</span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">🧾</div>
          <p>هنوز سفارشی ثبت نکرده‌اید.</p>
          <Link className="btn btn-primary" href="/plans">
            مشاهده تعرفه‌ها
          </Link>
        </div>
      )}
    </div>
  );
}
