"use client";

import { useActionState, useState } from "react";
import { createTopupAction, type ShopState } from "@/app/actions/shop";
import { faNum, toman } from "@/lib/format";
import SubmitButton from "./SubmitButton";

const PRESETS = [100_000, 200_000, 500_000, 1_000_000];

export default function TopupForm({
  min,
  online,
}: {
  min: number;
  online: { enabled: boolean; min: number };
}) {
  const [state, formAction] = useActionState<ShopState, FormData>(createTopupAction, {});
  const [amount, setAmount] = useState(PRESETS[0]);
  const canPayOnline = online.enabled && amount >= online.min;
  const [payMethod, setPayMethod] = useState<"card" | "online">(online.enabled ? "online" : "card");
  const method = canPayOnline ? payMethod : "card";

  return (
    <form action={formAction} className="form">
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}

      <div className="field">
        <label>مبلغ شارژ</label>
        <div className="subject-chips">
          {PRESETS.map((value) => (
            <button
              type="button"
              key={value}
              className={`chip${amount === value ? " is-active" : ""}`}
              onClick={() => setAmount(value)}
            >
              {toman(value)}
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
        <span className="field-hint">حداقل مبلغ شارژ {toman(min)} است ({faNum(min)} تومان).</span>
      </div>

      {online.enabled ? (
        <div className="field">
          <label>روش پرداخت</label>
          <input type="hidden" name="payMethod" value={method} />
          <div className="pay-options">
            <button
              type="button"
              className={`pay-option${method === "online" ? " is-active" : ""}${canPayOnline ? "" : " is-disabled"}`}
              onClick={() => canPayOnline && setPayMethod("online")}
              disabled={!canPayOnline}
            >
              <b>🏦 پرداخت آنلاین</b>
              <small>
                {canPayOnline
                  ? "درگاه بانکی — شارژ در همان لحظه"
                  : `برای پرداخت آنلاین حداقل ${toman(online.min)} لازم است`}
              </small>
            </button>
            <button
              type="button"
              className={`pay-option${method === "card" ? " is-active" : ""}`}
              onClick={() => setPayMethod("card")}
            >
              <b>💳 کارت‌به‌کارت</b>
              <small>ارسال رسید و تأیید پشتیبانی</small>
            </button>
          </div>
        </div>
      ) : null}

      <SubmitButton className="btn btn-primary">
        {method === "online" ? "پرداخت آنلاین و شارژ آنی" : "ثبت درخواست شارژ"}
      </SubmitButton>
      <span className="field-hint">
        {method === "online"
          ? "به درگاه بانکی می‌روید و بلافاصله بعد از پرداخت، موجودی شما اضافه می‌شود."
          : "بعد از ثبت، شماره کارت و مبلغ نمایش داده می‌شود؛ رسید را بفرستید تا شارژ انجام شود."}
      </span>
    </form>
  );
}
