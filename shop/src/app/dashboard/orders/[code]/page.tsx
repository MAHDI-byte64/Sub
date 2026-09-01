import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { asNum, getSettings } from "@/lib/settings";
import { faDate, toman } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import CopyButton from "@/components/CopyButton";
import ReceiptForm from "@/components/ReceiptForm";
import CancelOrderButton from "@/components/CancelOrderButton";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await requireUser(`/dashboard/orders/${code}`);

  const [order, settings] = await Promise.all([
    db.order.findFirst({
      where: { code, userId: user.id },
      include: { plan: true, panel: true, service: true },
    }),
    getSettings(),
  ]);
  if (!order) notFound();

  const status = ORDER_STATUS[order.status] ?? ORDER_STATUS.awaiting_receipt;
  const canPay = order.status === "awaiting_receipt" || order.status === "rejected";
  const expireMinutes = asNum(settings.order_expire_minutes, 0);
  const deadline =
    order.status === "awaiting_receipt" && expireMinutes > 0
      ? new Date(order.createdAt.getTime() + expireMinutes * 60_000)
      : null;
  const cardNumber = settings.card_number.replace(/\s|-/g, "");

  return (
    <div>
      <div className="card-title">
        <h1 style={{ fontSize: "1.4rem" }}>
          سفارش <span className="mono">{order.code}</span>
        </h1>
        <span className={`badge ${status.badge}`}>{status.label}</span>
      </div>

      <div className={`alert ${order.status === "approved" ? "alert-success" : order.status === "rejected" ? "alert-error" : "alert-info"}`}>
        {status.hint}
        {order.adminNote ? <div style={{ marginTop: 6 }}>یادداشت پشتیبانی: {order.adminNote}</div> : null}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">
            <h3>جزئیات سفارش</h3>
          </div>
          <table>
            <tbody>
              <tr>
                <th>پلن</th>
                <td>{order.plan.title}{order.renewServiceId ? " (تمدید)" : ""}</td>
              </tr>
              <tr>
                <th>لوکیشن</th>
                <td>{order.panel ? `${order.panel.flag} ${order.panel.location}` : "انتخاب خودکار"}</td>
              </tr>
              <tr>
                <th>مبلغ پلن</th>
                <td>{toman(order.amount)}</td>
              </tr>
              {order.discountAmount > 0 ? (
                <tr>
                  <th>تخفیف</th>
                  <td>{toman(order.discountAmount)}</td>
                </tr>
              ) : null}
              <tr>
                <th>قابل پرداخت</th>
                <td>
                  <b>{toman(order.payable)}</b>
                </td>
              </tr>
              <tr>
                <th>تاریخ ثبت</th>
                <td>{faDate(order.createdAt, true)}</td>
              </tr>
            </tbody>
          </table>

          {order.status === "approved" && order.service ? (
            <Link className="btn btn-primary btn-block" style={{ marginTop: 14 }} href={`/dashboard/services/${order.service.id}`}>
              مشاهده کانفیگ سرویس
            </Link>
          ) : null}

          {order.status !== "approved" && order.status !== "canceled" ? (
            <div style={{ marginTop: 14 }}>
              <CancelOrderButton code={order.code} />
            </div>
          ) : null}
        </div>

        <div className="card">
          <div className="card-title">
            <h3>{canPay ? "پرداخت کارت‌به‌کارت" : "وضعیت پرداخت"}</h3>
          </div>

          {canPay ? (
            <>
              {deadline ? (
                <div className="alert alert-warn">
                  مهلت پرداخت این سفارش تا {faDate(deadline, true)} است.
                </div>
              ) : null}
              <div className="field">
                <label>شماره کارت</label>
                <div className="copy-box">
                  <code>{settings.card_number}</code>
                  <CopyButton value={cardNumber} />
                </div>
              </div>
              <div className="field">
                <label>به نام</label>
                <div className="copy-box">
                  <code>{settings.card_holder}</code>
                </div>
              </div>
              <div className="field">
                <label>مبلغ (تومان)</label>
                <div className="copy-box">
                  <code>{order.payable.toLocaleString("en-US")}</code>
                  <CopyButton value={String(order.payable)} />
                </div>
              </div>
              <p className="field-hint">
                {settings.card_bank} — {settings.payment_note}
              </p>
              <hr style={{ borderColor: "var(--border)", margin: "16px 0" }} />
              <ReceiptForm code={order.code} />
            </>
          ) : (
            <>
              <p>رسید ثبت‌شده برای این سفارش:</p>
              {order.receiptFile ? (
                order.receiptFile.endsWith(".pdf") ? (
                  <a className="btn" href={`/api/receipt/${order.receiptFile}`} target="_blank" rel="noreferrer">
                    مشاهده فایل رسید
                  </a>
                ) : (
                  <a href={`/api/receipt/${order.receiptFile}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/receipt/${order.receiptFile}`}
                      alt="رسید پرداخت"
                      style={{ maxWidth: "100%", borderRadius: 12, border: "1px solid var(--border)" }}
                    />
                  </a>
                )
              ) : (
                <p className="dim">رسیدی ثبت نشده است.</p>
              )}
              {order.receiptRef ? <p className="mono">کد پیگیری: {order.receiptRef}</p> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
