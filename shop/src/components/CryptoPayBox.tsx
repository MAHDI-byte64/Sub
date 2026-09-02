"use client";

import { useActionState } from "react";
import { submitTxHashAction, type ShopState } from "@/app/actions/shop";
import { fmt } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import CopyButton from "./CopyButton";
import SubmitButton from "./SubmitButton";

/**
 * پرداخت تتری: آدرس و مبلغ دقیق را نشان می‌دهد و هش تراکنش را می‌گیرد.
 * مبلغ و نرخ در لحظهٔ ثبت سفارش قفل شده‌اند، پس اینجا فقط نمایش داده می‌شوند.
 */
export default function CryptoPayBox({
  code,
  address,
  network,
  amount,
  rate,
  txHash,
  note,
  locale = "fa",
}: {
  code: string;
  address: string;
  network: string;
  amount: number;
  rate: number;
  txHash?: string | null;
  note?: string;
  locale?: Locale;
}) {
  const [state, formAction] = useActionState<ShopState, FormData>(submitTxHashAction, {});
  const f = fmt(locale);
  const tr = (key: string) => t(locale, key);
  const amountText = amount.toFixed(2);

  return (
    <div className="crypto-box">
      <div className="crypto-head">
        <span className="crypto-icon" aria-hidden>
          🪙
        </span>
        <div>
          <b>{tr("order.cryptoTitle")}</b>
          <small>{network}</small>
        </div>
      </div>

      <div className="amount-box">
        <span>{tr("order.cryptoAmount")}</span>
        <div className="btn-row">
          <b className="ltr mono">{amountText} USDT</b>
          <CopyButton value={amountText} locale={locale} />
        </div>
      </div>

      <label className="field-hint" style={{ display: "block", margin: "12px 0 6px" }}>
        {tr("order.cryptoAddress")}
      </label>
      <div className="copy-box">
        <code className="ltr">{address}</code>
        <CopyButton value={address} locale={locale} />
      </div>

      <div className="qr-box" style={{ marginTop: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/qr?d=${encodeURIComponent(address)}`} alt={tr("order.cryptoAddress")} />
      </div>

      <div className="alert alert-warn" style={{ marginTop: 14 }}>
        ⚠️ {tr("order.cryptoWarn")}
      </div>

      <div className="crypto-facts">
        <span>
          <small>{tr("order.cryptoRate")}</small>
          <b>{f.money(rate)}</b>
        </span>
        <span>
          <small>{tr("order.payable")}</small>
          <b className="ltr mono">{amountText} USDT</b>
        </span>
      </div>

      {note ? <p className="field-hint">{note}</p> : null}

      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}

      {txHash ? (
        <div className="amount-box" style={{ marginTop: 14 }}>
          <span>{tr("order.txSubmitted")}</span>
          <b className="ltr mono" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
            {txHash}
          </b>
        </div>
      ) : (
        <form action={formAction} className="form" style={{ marginTop: 14 }}>
          <input type="hidden" name="code" value={code} />
          <div className="field">
            <label htmlFor="txHash">{tr("order.txHash")}</label>
            <input id="txHash" name="txHash" className="ltr mono" autoComplete="off" required />
            <span className="field-hint">{tr("order.cryptoStep")}</span>
          </div>
          <SubmitButton className="btn btn-primary btn-block">{tr("order.submitTx")}</SubmitButton>
        </form>
      )}
    </div>
  );
}
