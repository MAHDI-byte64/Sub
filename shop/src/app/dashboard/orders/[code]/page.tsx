import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { asNum, getSettings } from "@/lib/settings";
import { faDate, toman } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import CopyButton from "@/components/CopyButton";
import Countdown from "@/components/Countdown";
import OrderTimeline, { type TimelineStep } from "@/components/OrderTimeline";
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
  const cardNumber = settings.card_number.replace(/\s|-/g, "");
  const expireMinutes = asNum(settings.order_expire_minutes, 0);
  const deadline =
    order.status === "awaiting_receipt" && expireMinutes > 0
      ? new Date(order.createdAt.getTime() + expireMinutes * 60_000)
      : null;

  const paid = order.status === "pending_review" || order.status === "approved";
  const delivered = order.status === "approved";
  const rejected = order.status === "rejected";
  const canceled = order.status === "canceled";

  const timeline: TimelineStep[] = [
    {
      title: "ثبت سفارش",
      hint: `${order.plan?.title ?? "شارژ کیف پول"}${order.renewServiceId ? " (تمدید)" : ""} — ${toman(order.payable)}`,
      at: order.createdAt,
      state: "done",
      icon: "🛒",
    },
    {
      title: paid ? "رسید پرداخت ارسال شد" : "پرداخت و ارسال رسید",
      hint: paid
        ? order.receiptRef
          ? `کد پیگیری: ${order.receiptRef}`
          : "رسید در انتظار بررسی است"
        : "مبلغ را کارت‌به‌کارت کنید و تصویر رسید را بفرستید",
      at: order.paidAt,
      state: canceled ? "failed" : paid ? "done" : "active",
      icon: "💳",
    },
    {
      title: rejected ? "رسید تأیید نشد" : "بررسی پشتیبانی",
      hint: rejected
        ? (order.adminNote ?? "می‌توانید رسید درست را دوباره بفرستید")
        : delivered
          ? "رسید تأیید شد"
          : "معمولاً کمتر از ۳۰ دقیقه",
      at: order.reviewedAt,
      state: rejected ? "failed" : delivered ? "done" : paid ? "active" : "pending",
      icon: "🔍",
    },
    {
      title: "تحویل سرویس",
      hint: delivered ? "کانفیگ در پنل کاربری فعال است" : "بلافاصله پس از تأیید",
      at: delivered ? order.reviewedAt : null,
      state: delivered ? "done" : "pending",
      icon: "🚀",
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>
            سفارش <span className="mono gold">{order.code}</span>
          </h1>
          <p>
            {order.plan?.title ?? "شارژ کیف پول"}
            {order.renewServiceId ? " — تمدید سرویس" : ""}
          </p>
        </div>
        <span className={`badge ${status.badge}`}>{status.label}</span>
      </div>

      {/* تایم‌لاین سفارش */}
      <div
        className={`alert ${
          order.status === "approved"
            ? "alert-success"
            : order.status === "rejected"
              ? "alert-error"
              : "alert-info"
        }`}
      >
        {status.hint}
        {order.adminNote ? <div style={{ marginTop: 6 }}>یادداشت پشتیبانی: {order.adminNote}</div> : null}
      </div>

      <div className="grid grid-2">
        {/* مسیر سفارش */}
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-title">
            <h3>مسیر سفارش</h3>
            {deadline && order.status === "awaiting_receipt" ? (
              <Countdown until={deadline.toISOString()} />
            ) : null}
          </div>
          <OrderTimeline steps={timeline} />
        </div>

        {/* پرداخت */}
        <div className="card">
          <div className="card-title">
            <h3>{canPay ? "پرداخت کارت‌به‌کارت" : "رسید پرداخت"}</h3>
            {deadline ? <Countdown until={deadline.toISOString()} /> : null}
          </div>

          {canPay ? (
            <>
              <div className="bank-card">
                <div className="bank-card-top">
                  <span className="bank-chip" />
                  <span className="badge badge-info">{settings.card_bank}</span>
                </div>
                <div className="bank-number">{settings.card_number}</div>
                <div className="bank-meta">
                  <div>
                    <small>به نام</small>
                    <b>{settings.card_holder}</b>
                  </div>
                  <CopyButton value={cardNumber} label="کپی شماره کارت" className="btn btn-sm" />
                </div>
              </div>

              <div className="amount-box">
                <span>مبلغ قابل پرداخت</span>
                <div className="btn-row">
                  <b>{toman(order.payable)}</b>
                  <CopyButton value={String(order.payable)} label="کپی مبلغ" className="btn btn-sm" />
                </div>
              </div>

              <p className="field-hint">{settings.payment_note}</p>
              <hr />
              <ReceiptForm code={order.code} />
            </>
          ) : (
            <>
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
                      className="receipt-img"
                    />
                  </a>
                )
              ) : (
                <p className="dim">رسیدی ثبت نشده است.</p>
              )}
              {order.receiptRef ? (
                <p className="mono" style={{ marginTop: 10 }}>
                  کد پیگیری: {order.receiptRef}
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* جزئیات */}
        <div className="card">
          <div className="card-title">
            <h3>جزئیات سفارش</h3>
          </div>
          <div className="svc-meta">
            <div className="meta-row">
              <span>🏷️ پلن</span>
              <b>{order.plan?.title ?? "شارژ کیف پول"}</b>
            </div>
            <div className="meta-row">
              <span>🌍 لوکیشن</span>
              <b>{order.panel ? `${order.panel.flag} ${order.panel.location}` : "انتخاب خودکار"}</b>
            </div>
            <div className="meta-row">
              <span>💰 مبلغ پلن</span>
              <b>{toman(order.amount)}</b>
            </div>
            {order.discountAmount > 0 ? (
              <div className="meta-row">
                <span>🎟️ تخفیف</span>
                <b className="gold">{toman(order.discountAmount)}</b>
              </div>
            ) : null}
            <div className="meta-row">
              <span>🧾 قابل پرداخت</span>
              <b className="gold">{toman(order.payable)}</b>
            </div>
            <div className="meta-row">
              <span>📅 تاریخ ثبت</span>
              <b>{faDate(order.createdAt, true)}</b>
            </div>
          </div>

          {order.status === "approved" && order.service ? (
            <Link
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              href={`/dashboard/services/${order.service.id}`}
            >
              مشاهده کانفیگ سرویس
            </Link>
          ) : null}

          {order.status !== "approved" && order.status !== "canceled" ? (
            <div style={{ marginTop: 16 }}>
              <CancelOrderButton code={order.code} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
