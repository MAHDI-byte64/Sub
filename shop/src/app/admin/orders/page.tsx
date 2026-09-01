import Link from "next/link";
import { db } from "@/lib/db";
import { approveOrderAction, rejectOrderAction } from "@/app/actions/admin";
import { faDate, toman } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import ActionForm from "@/components/ActionForm";
import Flash from "@/components/Flash";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "pending_review", label: "در انتظار بررسی" },
  { key: "awaiting_receipt", label: "در انتظار پرداخت" },
  { key: "approved", label: "تأیید شده" },
  { key: "rejected", label: "رد شده" },
  { key: "all", label: "همه" },
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; msg?: string; type?: string }>;
}) {
  const { status: statusParam, msg, type } = await searchParams;
  const status = statusParam || "pending_review";

  const orders = await db.order.findMany({
    where: status === "all" ? {} : { status },
    include: { user: true, plan: true, panel: true, service: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>سفارش‌ها</h1>
          <p>رسیدها را بررسی کنید؛ با تأیید، سرویس خودکار روی پنل ساخته می‌شود.</p>
        </div>
      </div>

      <Flash msg={msg} type={type} />

      <div className="tabs">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/admin/orders?status=${f.key}`} className={status === f.key ? "active" : ""}>
            {f.label}
          </Link>
        ))}
      </div>

      {orders.length ? (
        <div className="grid">
          {orders.map((order) => {
            const badge = ORDER_STATUS[order.status] ?? ORDER_STATUS.awaiting_receipt;
            return (
              <div className="card" key={order.id}>
                <div className="card-title">
                  <h3>
                    <span className="mono">{order.code}</span> — {order.plan.title}
                    {order.renewServiceId ? <span className="badge" style={{ marginInlineStart: 6 }}>تمدید</span> : null}
                  </h3>
                  <span className={`badge ${badge.badge}`}>{badge.label}</span>
                </div>

                <div className="grid grid-2">
                  <div>
                    <table>
                      <tbody>
                        <tr>
                          <th>کاربر</th>
                          <td className="ltr">{order.user.email}</td>
                        </tr>
                        <tr>
                          <th>مبلغ قابل پرداخت</th>
                          <td>
                            <b>{toman(order.payable)}</b>
                            {order.discountAmount > 0 ? (
                              <span className="badge badge-info" style={{ marginInlineStart: 6 }}>
                                {toman(order.discountAmount)} تخفیف
                              </span>
                            ) : null}
                          </td>
                        </tr>
                        <tr>
                          <th>لوکیشن</th>
                          <td>{order.panel ? `${order.panel.flag} ${order.panel.location}` : "انتخاب خودکار"}</td>
                        </tr>
                        <tr>
                          <th>کد پیگیری</th>
                          <td className="mono">{order.receiptRef || "—"}</td>
                        </tr>
                        <tr>
                          <th>تاریخ ثبت</th>
                          <td>{faDate(order.createdAt, true)}</td>
                        </tr>
                        {order.adminNote ? (
                          <tr>
                            <th>یادداشت</th>
                            <td>{order.adminNote}</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    {order.receiptFile ? (
                      <a href={`/api/receipt/${order.receiptFile}`} target="_blank" rel="noreferrer">
                        {order.receiptFile.endsWith(".pdf") ? (
                          <span className="btn">مشاهده فایل رسید</span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/receipt/${order.receiptFile}`}
                            alt="رسید"
                            className="receipt-img"
                            style={{ maxHeight: 280 }}
                          />
                        )}
                      </a>
                    ) : (
                      <p className="dim">رسیدی بارگذاری نشده است.</p>
                    )}
                  </div>
                </div>

                {order.status === "approved" ? (
                  order.service ? (
                    <div className="alert alert-success" style={{ marginTop: 12 }}>
                      سرویس تحویل شد: <span className="mono">{order.service.clientEmail}</span>
                    </div>
                  ) : (
                    <div className="alert alert-success" style={{ marginTop: 12 }}>
                      سفارش تمدید با موفقیت اعمال شد.
                    </div>
                  )
                ) : (
                  <div className="grid grid-2" style={{ marginTop: 12 }}>
                    <ActionForm
                      action={approveOrderAction}
                      submitLabel="✅ تأیید و تحویل سرویس"
                      buttonClass="btn btn-success btn-block"
                      confirm={`سفارش ${order.code} تأیید و سرویس روی پنل ساخته شود؟`}
                    >
                      <input type="hidden" name="orderId" value={order.id} />
                    </ActionForm>

                    <ActionForm
                      action={rejectOrderAction}
                      submitLabel="✕ رد سفارش"
                      buttonClass="btn btn-danger btn-block"
                      confirm={`سفارش ${order.code} رد شود؟`}
                    >
                      <input type="hidden" name="orderId" value={order.id} />
                      <input name="note" placeholder="دلیل رد (اختیاری)" />
                    </ActionForm>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">🧾</div>
          سفارشی در این وضعیت وجود ندارد.
        </div>
      )}
    </div>
  );
}
