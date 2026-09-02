import Link from "next/link";
import { db } from "@/lib/db";
import { approveOrderAction, rejectOrderAction } from "@/app/actions/admin";
import { faDate, faNum, toman } from "@/lib/format";
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
  searchParams: Promise<{ status?: string; q?: string; msg?: string; type?: string }>;
}) {
  const { status: statusParam, q, msg, type } = await searchParams;
  const status = statusParam || "pending_review";
  const search = (q ?? "").trim();

  const [orders, pendingCount, approvedAgg, todayAgg] = await Promise.all([
    db.order.findMany({
      where: {
        ...(status === "all" ? {} : { status }),
        ...(search
          ? {
              OR: [
                { code: { contains: search } },
                { user: { email: { contains: search } } },
                { receiptRef: { contains: search } },
              ],
            }
          : {}),
      },
      include: { user: true, plan: true, panel: true, service: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.order.count({ where: { status: "pending_review" } }),
    db.order.aggregate({ where: { status: "approved" }, _sum: { payable: true }, _count: { _all: true } }),
    db.order.aggregate({
      where: { status: "approved", reviewedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      _sum: { payable: true },
    }),
  ]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>سفارش‌ها</h1>
          <p>رسیدها را بررسی کنید؛ با تأیید، سرویس خودکار روی پنل ساخته می‌شود.</p>
        </div>
      </div>

      <Flash msg={msg} type={type} />

      <div className="summary-strip">
        <div className="summary-tile">
          <span>⏳ در انتظار بررسی</span>
          <b>{faNum(pendingCount)}</b>
        </div>
        <div className="summary-tile">
          <span>✅ سفارش تأییدشده</span>
          <b>{faNum(approvedAgg._count._all)}</b>
        </div>
        <div className="summary-tile">
          <span>💰 درآمد کل</span>
          <b>{toman(approvedAgg._sum.payable ?? 0, false)}</b>
        </div>
        <div className="summary-tile">
          <span>📅 درآمد امروز</span>
          <b>{toman(todayAgg._sum.payable ?? 0, false)}</b>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="hidden" name="status" value={status} />
          <input
            name="q"
            defaultValue={search}
            placeholder="جستجوی کد سفارش، ایمیل یا کد پیگیری…"
            style={{ flex: 1, minWidth: 200 }}
          />
          <button className="btn btn-sm btn-primary" type="submit">
            جستجو
          </button>
          <a className="btn btn-sm" href="/api/admin/export/orders">
            ⬇ خروجی CSV
          </a>
        </form>
      </div>

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
