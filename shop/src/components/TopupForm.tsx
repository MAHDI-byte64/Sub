"use client";

import { useActionState, useState } from "react";
import { createTopupAction, type ShopState } from "@/app/actions/shop";
import { fmt } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import SubmitButton from "./SubmitButton";

const PRESETS = [100_000, 200_000, 500_000, 1_000_000];

export default function TopupForm({
  min,
  methods,
  locale = "fa",
}: {
  min: number;
  methods: { card: boolean; crypto: boolean; gateways: { id: string; label: string }[] };
  locale?: Locale;
}) {
  const [state, formAction] = useActionState<ShopState, FormData>(createTopupAction, {});
  const [amount, setAmount] = useState(PRESETS[0]);
  const f = fmt(locale);
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
  const firstGateway = methods.gateways[0];
  const [payMethod, setPayMethod] = useState<string>(
    firstGateway ? `online:${firstGateway.id}` : methods.crypto ? "crypto" : "card",
  );
  const method = payMethod;
  const isOnline = method.startsWith("online:");

  return (
    <form action={formAction} className="form">
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}

      <div className="field">
        <label>{tr("dashPages.topupAmount")}</label>
        <div className="subject-chips">
          {PRESETS.map((value) => (
            <button
              type="button"
              key={value}
              className={`chip${amount === value ? " is-active" : ""}`}
              onClick={() => setAmount(value)}
            >
              {f.money(value)}
            </button>
          ))}
        </div>
        <input
          name="amount"
          type="number"
          min={min}
          step={10_000}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="ltr"
        />
        <span className="field-hint">{f.money(min)}</span>
      </div>

      <div className="field">
        <label>{tr("checkout.payMethod")}</label>
        <input type="hidden" name="payMethod" value={method} />
        <div className="pay-options">
          {methods.gateways.map((gw) => (
            <button
              type="button"
              key={gw.id}
              className={`pay-option${method === `online:${gw.id}` ? " is-active" : ""}`}
              onClick={() => setPayMethod(`online:${gw.id}`)}
            >
              <b>🏦 {gw.label}</b>
              <small>{tr("checkout.onlineHint")}</small>
            </button>
          ))}
          {methods.crypto ? (
            <button
              type="button"
              className={`pay-option${method === "crypto" ? " is-active" : ""}`}
              onClick={() => setPayMethod("crypto")}
            >
              <b>{tr("checkout.crypto")}</b>
              <small>{tr("checkout.cryptoHint")}</small>
            </button>
          ) : null}
          {methods.card ? (
            <button
              type="button"
              className={`pay-option${method === "card" ? " is-active" : ""}`}
              onClick={() => setPayMethod("card")}
            >
              <b>{tr("checkout.card")}</b>
              <small>{tr("checkout.cardHint")}</small>
            </button>
          ) : null}
        </div>
      </div>

      <SubmitButton className="btn btn-primary">
        {isOnline
          ? tr("checkout.submitOnline")
          : method === "crypto"
            ? tr("checkout.submitCrypto")
            : tr("dashPages.topup")}
      </SubmitButton>
      <span className="field-hint">
        {isOnline
          ? tr("checkout.afterOnline")
          : method === "crypto"
            ? tr("checkout.afterCrypto")
            : tr("checkout.afterCard")}
      </span>
    </form>
  );
}
