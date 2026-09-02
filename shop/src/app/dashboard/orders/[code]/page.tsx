import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { asNum, getSettings } from "@/lib/settings";
import { activeGateways } from "@/lib/payments";
import { fmt } from "@/lib/format";
import { orderStatus } from "@/lib/status";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";
import CopyButton from "@/components/CopyButton";
import Countdown from "@/components/Countdown";
import OrderTimeline, { type TimelineStep } from "@/components/OrderTimeline";
import ReceiptForm from "@/components/ReceiptForm";
import CryptoPayBox from "@/components/CryptoPayBox";
import CancelOrderButton from "@/components/CancelOrderButton";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ paid?: string; payerror?: string }>;
}) {
  const { code } = await params;
  const { paid: paidFlag, payerror } = await searchParams;
  const locale = await getLocale();
  const tr = translator(locale);
  const f = fmt(locale);
  const user = await requireUser(`/dashboard/orders/${code}`);

  const [order, settings] = await Promise.all([
    db.order.findFirst({
      where: { code, userId: user.id },
      include: { plan: true, panel: true, service: true },
    }),
    getSettings(),
  ]);
  if (!order) notFound();

  const status = orderStatus(locale, order.status);
  const isOnline = order.payMethod === "online";
  const isCrypto = order.payMethod === "crypto";
  const onlineReady = (await activeGateways(order.payable)).length > 0;
  const awaitingOnline =
    order.status === "awaiting_payment" || (order.status === "failed" && order.payMethod === "online");
  const canPay =
    !awaitingOnline &&
    !isCrypto &&
    (order.status === "awaiting_receipt" || order.status === "rejected");
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
      title: tr("order.placed"),
      hint: `${order.plan?.title ?? tr("order.topup")}${
        order.renewServiceId ? tr("order.renewParen") : ""
      } — ${f.money(order.payable)}`,
      at: order.createdAt,
      state: "done",
      icon: "🛒",
    },
    isCrypto
      ? {
          title: paid ? tr("order.cryptoPaidStep") : tr("order.cryptoTitle"),
          hint: paid
            ? order.cryptoTxHash
              ? tr("order.trackRef", { ref: order.cryptoTxHash.slice(0, 18) + "…" })
              : tr("order.receiptQueued")
            : tr("order.cryptoPending"),
          at: order.paidAt,
          state: canceled ? "failed" : paid ? "done" : "active",
          icon: "🪙",
        }
      : isOnline
      ? {
          title: paid ? tr("order.paidOnline") : tr("order.payOnline"),
          hint: paid
            ? order.bankRef
              ? tr("order.bankRef", { ref: order.bankRef })
              : tr("order.verified")
            : tr("order.goPay"),
          at: order.paidAt,
          state: canceled || order.status === "failed" ? "failed" : paid ? "done" : "active",
          icon: "🏦",
        }
      : {
          title: paid ? tr("order.receiptSent") : tr("order.payAndReceipt"),
          hint: paid
            ? order.receiptRef
              ? tr("order.trackRef", { ref: order.receiptRef })
              : tr("order.receiptQueued")
            : tr("order.doTransfer"),
          at: order.paidAt,
          state: canceled ? "failed" : paid ? "done" : "active",
          icon: "💳",
        },
    isOnline
      ? {
          title: tr("order.verifyStep"),
          hint: delivered ? tr("order.verifiedDone") : tr("order.autoInstant"),
          at: order.reviewedAt,
          state: order.status === "failed" ? "failed" : delivered ? "done" : paid ? "active" : "pending",
          icon: "✅",
        }
      : {
          title: rejected ? tr("order.rejectedTitle") : tr("order.reviewTitle"),
          hint: rejected
            ? (order.adminNote ?? tr("order.reuploadHint"))
            : delivered
              ? tr("order.receiptOk")
              : tr("order.under30"),
          at: order.reviewedAt,
          state: rejected ? "failed" : delivered ? "done" : paid ? "active" : "pending",
          icon: "🔍",
        },
    {
      title: tr("order.deliveryStep"),
      hint: delivered
        ? order.kind === "topup"
          ? tr("order.walletTopped")
          : tr("order.configReady")
        : tr("order.afterApprove"),
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
            {tr("order.title")} <span className="mono gold">{order.code}</span>
          </h1>
          <p>
            {order.plan?.title ?? tr("order.topup")}
            {order.renewServiceId ? tr("order.renewSuffix") : ""}
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
        {order.adminNote ? (
          <div style={{ marginTop: 6 }}>{tr("order.adminNote", { note: order.adminNote })}</div>
        ) : null}
      </div>

      {payerror ? <div className="alert alert-error">{payerror}</div> : null}
      {paidFlag && order.status === "approved" ? (
        <div className="alert alert-success">{tr("order.paidOk")}</div>
      ) : null}

      <div className="grid grid-2">
        {/* مسیر سفارش */}
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-title">
            <h3>{tr("order.path")}</h3>
            {deadline && order.status === "awaiting_receipt" ? (
              <Countdown until={deadline.toISOString()} locale={locale} />
            ) : null}
          </div>
          <OrderTimeline steps={timeline} locale={locale} />
        </div>

        {/* پرداخت */}
        <div className="card">
          <div className="card-title">
            <h3>
              {isCrypto
                ? tr("order.cryptoTitle")
                : awaitingOnline
                  ? tr("order.onlineTitle")
                  : canPay
                    ? tr("order.cardTitle")
                    : tr("order.receiptTitle")}
            </h3>
            {deadline ? <Countdown until={deadline.toISOString()} locale={locale} /> : null}
          </div>

          {isCrypto ? (
            <CryptoPayBox
              code={order.code}
              locale={locale}
              address={order.cryptoAddress ?? ""}
              network={order.cryptoNetwork ?? "USDT-TRC20"}
              amount={order.cryptoAmount ?? 0}
              rate={order.cryptoRate ?? 0}
              txHash={order.cryptoTxHash}
              note={settings.crypto_note}
            />
          ) : awaitingOnline ? (
            <>
              <div className="amount-box">
                <span>{tr("order.payable")}</span>
                <div className="btn-row">
                  <b>{f.money(order.payable)}</b>
                </div>
              </div>
              {onlineReady ? (
                <>
                  <Link className="btn btn-primary btn-block btn-lg" href={`/pay/${order.code}`}>
                    {tr("order.goGateway")}
                  </Link>
                  <p className="field-hint center" style={{ marginTop: 10 }}>
                    {tr("order.afterGateway")}
                  </p>
                </>
              ) : (
                <div className="alert alert-warn">
                  {tr("order.onlineOff")}
                </div>
              )}
              {order.gatewayRef ? (
                <p className="field-hint mono">{tr("order.gatewayRef", { ref: order.gatewayRef })}</p>
              ) : null}
            </>
          ) : canPay ? (
            <>
              <div className="bank-card">
                <div className="bank-card-top">
                  <span className="bank-chip" />
                  <span className="badge badge-info">{settings.card_bank}</span>
                </div>
                <div className="bank-number">{settings.card_number}</div>
                <div className="bank-meta">
                  <div>
                    <small>{tr("order.cardHolder")}</small>
                    <b>{settings.card_holder}</b>
                  </div>
                  <CopyButton locale={locale} value={cardNumber} label={tr("order.copyCard")} className="btn btn-sm" />
                </div>
              </div>

              <div className="amount-box">
                <span>{tr("order.payable")}</span>
                <div className="btn-row">
                  <b>{f.money(order.payable)}</b>
                  <CopyButton
                    value={String(order.payable)}
                    label={tr("order.copyAmount")}
                    className="btn btn-sm"
                  />
                </div>
              </div>

              <p className="field-hint">{settings.payment_note}</p>
              <hr />
              <ReceiptForm code={order.code} locale={locale} />
            </>
          ) : (
            <>
              {order.receiptFile ? (
                order.receiptFile.endsWith(".pdf") ? (
                  <a className="btn" href={`/api/receipt/${order.receiptFile}`} target="_blank" rel="noreferrer">
                    {tr("order.viewReceiptFile")}
                  </a>
                ) : (
                  <a href={`/api/receipt/${order.receiptFile}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/receipt/${order.receiptFile}`}
                      alt={tr("order.receiptAlt")}
                      className="receipt-img"
                    />
                  </a>
                )
              ) : (
                <p className="dim">{tr("order.noReceipt")}</p>
              )}
              {order.receiptRef ? (
                <p className="mono" style={{ marginTop: 10 }}>
                  {tr("order.trackRef", { ref: order.receiptRef })}
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* جزئیات */}
        <div className="card">
          <div className="card-title">
            <h3>{tr("order.details")}</h3>
          </div>
          <div className="svc-meta">
            <div className="meta-row">
              <span>{tr("order.plan")}</span>
              <b>{order.plan?.title ?? tr("order.topup")}</b>
            </div>
            <div className="meta-row">
              <span>{tr("order.location")}</span>
              <b>
                {order.panel
                  ? `${order.panel.flag} ${order.panel.location}`
                  : tr("order.autoLocation")}
              </b>
            </div>
            <div className="meta-row">
              <span>{tr("order.planPrice")}</span>
              <b>{f.money(order.amount)}</b>
            </div>
            {order.discountAmount > 0 ? (
              <div className="meta-row">
                <span>{tr("order.discount")}</span>
                <b className="gold">{f.money(order.discountAmount)}</b>
              </div>
            ) : null}
            <div className="meta-row">
              <span>{tr("order.finalPrice")}</span>
              <b className="gold">{f.money(order.payable)}</b>
            </div>
            <div className="meta-row">
              <span>{tr("order.createdAt")}</span>
              <b>{f.date(order.createdAt, true)}</b>
            </div>
          </div>

          {order.status === "approved" && order.service ? (
            <Link
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              href={`/dashboard/services/${order.service.id}`}
            >
              {tr("order.viewService")}
            </Link>
          ) : null}

          {order.status !== "approved" && order.status !== "canceled" ? (
            <div style={{ marginTop: 16 }}>
              <CancelOrderButton code={order.code} locale={locale} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
