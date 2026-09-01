import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { faDate, toman } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";

export const dynamic = "force-dynamic";
export const metadata = { title: "سفارش‌ها" };

export default async function OrdersPage() {
  const user = await requireUser("/dashboard/orders");
  const orders = await db.order.findMany({
    where: { userId: user.id },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="card-title">
        <h1 style={{ fontSize: "1.5rem" }}>سفارش‌های من</h1>
      </div>

      {orders.length ? (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>کد سفارش</th>
                  <th>پلن</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const status = ORDER_STATUS[order.status] ?? ORDER_STATUS.awaiting_receipt;
                  return (
                    <tr key={order.id}>
                      <td className="mono">{order.code}</td>
                      <td>
                        {order.plan.title}
                        {order.renewServiceId ? <span className="badge" style={{ marginInlineStart: 6 }}>تمدید</span> : null}
                      </td>
                      <td className="nowrap">{toman(order.payable)}</td>
                      <td>
                        <span className={`badge ${status.badge}`}>{status.label}</span>
                      </td>
                      <td className="nowrap">{faDate(order.createdAt)}</td>
                      <td>
                        <Link className="btn btn-sm" href={`/dashboard/orders/${order.code}`}>
                          جزئیات
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
