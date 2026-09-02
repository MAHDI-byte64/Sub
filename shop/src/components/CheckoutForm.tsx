"use client";

import { useActionState, useState } from "react";
import { createOrderAction, type ShopState } from "@/app/actions/shop";
import { fmt } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import SubmitButton from "./SubmitButton";

type PanelOption = { id: string; flag: string; location: string };

export default function CheckoutForm({
  plan,
  panels,
  renew,
  wallet,
  online,
  locale = "fa",
}: {
  plan: { id: string; title: string; priceToman: number; priceLabel: string };
  panels: PanelOption[];
  renew: { id: string; remark: string } | null;
  wallet: { enabled: boolean; balance: number };
  online: { enabled: boolean; min: number };
  locale?: Locale;
}) {
  const [state, formAction] = useActionState<ShopState, FormData>(createOrderAction, {});
  const [code, setCode] = useState("");
  const f = fmt(locale);
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
  const canPayWallet = wallet.enabled && wallet.balance >= plan.priceToman;
  const canPayOnline = online.enabled && plan.priceToman >= online.min;
  const [payMethod, setPayMethod] = useState<"card" | "wallet" | "online">(
    canPayWallet ? "wallet" : canPayOnline ? "online" : "card",
  );
  const [checking, setChecking] = useState(false);
  const [discountMsg, setDiscountMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function checkDiscount() {
    if (!code.trim()) return;
    setChecking(true);
    setDiscountMsg(null);
    try {
      const res = await fetch("/api/discount/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, planId: plan.id }),
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      setDiscountMsg({ ok: data.ok, text: data.message });
    } catch {
      setDiscountMsg({ ok: false, text: tr("checkout.check") });
    } finally {
      setChecking(false);
    }
  }

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="planId" value={plan.id} />
      {renew ? <input type="hidden" name="renewServiceId" value={renew.id} /> : null}

      {state.error ? <div className="alert alert-error">{state.error}</div> : null}

      {renew ? (
        <div className="alert alert-info">
          {tr("checkout.renewNote", { name: renew.remark })}
        </div>
      ) : null}

      {!renew ? (
        <div className="field">
          <label htmlFor="panelId">{tr("checkout.selectLocation")}</label>
          <select id="panelId" name="panelId" defaultValue="">
            <option value="">{tr("checkout.autoLocation")}</option>
            {panels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.flag} {p.location}
              </option>
            ))}
          </select>
          <span className="field-hint">{tr("checkout.locationHint")}</span>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="discountCode">{tr("checkout.discount")}</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="discountCode"
            name="discountCode"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="مثلاً WELCOME10"
            className="ltr"
            autoComplete="off"
          />
          <button type="button" className="btn nowrap" onClick={checkDiscount} disabled={checking}>
            {checking ? "..." : tr("checkout.check")}
          </button>
        </div>
        {discountMsg ? (
          <span className={discountMsg.ok ? "field-hint" : "field-hint"} style={{ color: discountMsg.ok ? "#6ee7b7" : "#fca5a5" }}>
            {discountMsg.text}
          </span>
        ) : null}
      </div>

      {wallet.enabled || canPayOnline ? (
        <div className="field">
          <label>{tr("checkout.payMethod")}</label>
          <input type="hidden" name="payMethod" value={payMethod} />
          <div className="pay-options">
            {canPayOnline ? (
              <button
                type="button"
                className={`pay-option${payMethod === "online" ? " is-active" : ""}`}
                onClick={() => setPayMethod("online")}
              >
                <b>{tr("checkout.online")}</b>
                <small>{tr("checkout.onlineHint")}</small>
              </button>
            ) : null}
            {wallet.enabled ? (
              <button
                type="button"
                className={`pay-option${payMethod === "wallet" ? " is-active" : ""}${canPayWallet ? "" : " is-disabled"}`}
                onClick={() => canPayWallet && setPayMethod("wallet")}
                disabled={!canPayWallet}
              >
                <b>{tr("checkout.walletOption")}</b>
                <small>
                  {tr("checkout.walletBalance", { amount: f.money(wallet.balance) })}
                  {canPayWallet ? tr("checkout.walletInstant") : tr("checkout.walletShort")}
                </small>
              </button>
            ) : null}
            <button
              type="button"
              className={`pay-option${payMethod === "card" ? " is-active" : ""}`}
              onClick={() => setPayMethod("card")}
            >
              <b>{tr("checkout.card")}</b>
              <small>{tr("checkout.cardHint")}</small>
            </button>
          </div>
        </div>
      ) : null}

      <SubmitButton className="btn btn-primary btn-block btn-lg" pendingText="در حال ثبت سفارش…">
        {payMethod === "wallet"
          ? tr("checkout.submitWallet")
          : payMethod === "online"
            ? tr("checkout.submitOnline")
            : tr("checkout.submitCard")}
      </SubmitButton>
      <span className="field-hint center">
        {tr("checkout.terms")}
        {payMethod === "wallet"
          ? tr("checkout.afterWallet")
          : payMethod === "online"
            ? tr("checkout.afterOnline")
            : tr("checkout.afterCard")}
      </span>
    </form>
  );
}
