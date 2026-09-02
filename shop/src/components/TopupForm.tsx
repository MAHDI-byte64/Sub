"use client";

import { useActionState, useState } from "react";
import { createTopupAction, type ShopState } from "@/app/actions/shop";
import { fmt } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import SubmitButton from "./SubmitButton";

const PRESETS = [100_000, 200_000, 500_000, 1_000_000];

export default function TopupForm({
  min,
  online,
  locale = "fa",
}: {
  min: number;
  online: { enabled: boolean; min: number };
  locale?: Locale;
}) {
  const [state, formAction] = useActionState<ShopState, FormData>(createTopupAction, {});
  const [amount, setAmount] = useState(PRESETS[0]);
  const f = fmt(locale);
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
  const canPayOnline = online.enabled && amount >= online.min;
  const [payMethod, setPayMethod] = useState<"card" | "online">(online.enabled ? "online" : "card");
  const method = canPayOnline ? payMethod : "card";

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

      {online.enabled ? (
        <div className="field">
          <label>{tr("checkout.payMethod")}</label>
          <input type="hidden" name="payMethod" value={method} />
          <div className="pay-options">
            <button
              type="button"
              className={`pay-option${method === "online" ? " is-active" : ""}${canPayOnline ? "" : " is-disabled"}`}
              onClick={() => canPayOnline && setPayMethod("online")}
              disabled={!canPayOnline}
            >
              <b>{tr("checkout.online")}</b>
              <small>{canPayOnline ? tr("checkout.onlineHint") : f.money(online.min)}</small>
            </button>
            <button
              type="button"
              className={`pay-option${method === "card" ? " is-active" : ""}`}
              onClick={() => setPayMethod("card")}
            >
              <b>{tr("checkout.card")}</b>
              <small>{tr("checkout.cardHint")}</small>
            </button>
          </div>
        </div>
      ) : null}

      <SubmitButton className="btn btn-primary">
        {method === "online" ? tr("checkout.submitOnline") : tr("dashPages.topup")}
      </SubmitButton>
      <span className="field-hint">
        {method === "online" ? tr("checkout.afterOnline") : tr("checkout.afterCard")}
      </span>
    </form>
  );
}
