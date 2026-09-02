"use client";

import { useActionState, useState } from "react";
import { createTopupAction, type ShopState } from "@/app/actions/shop";
import { faNum, toman } from "@/lib/format";
import SubmitButton from "./SubmitButton";

const PRESETS = [100_000, 200_000, 500_000, 1_000_000];

export default function TopupForm({ min }: { min: number }) {
  const [state, formAction] = useActionState<ShopState, FormData>(createTopupAction, {});
  const [amount, setAmount] = useState(PRESETS[0]);

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

      <SubmitButton className="btn btn-primary">ثبت درخواست شارژ</SubmitButton>
      <span className="field-hint">
        بعد از ثبت، شماره کارت و مبلغ نمایش داده می‌شود؛ رسید را بفرستید تا شارژ انجام شود.
      </span>
    </form>
  );
}
