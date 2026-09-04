"use client";

import { useActionState, useState } from "react";
import { renewCustomAction, type ResellerState } from "@/app/actions/reseller";
import { faNum, toman } from "@/lib/format";
import { customPrice, type CustomRates } from "@/lib/pricing";
import SubmitButton from "./SubmitButton";

/**
 * شارژ سرویس مشتری با حجم و زمان دلخواه در پنل نمایندگی.
 *
 * روز صفر یعنی «فقط حجم اضافه کن»؛ تاریخ انقضا دست‌نخورده می‌ماند. قیمت با
 * همان تابع سرور حساب می‌شود تا عددی که نماینده می‌بیند همان مبلغ کسرشده باشد.
 */
export default function CustomRenewForm({
  serviceId,
  rates,
  discount,
  balance,
}: {
  serviceId: string;
  rates: CustomRates;
  discount: number;
  balance: number;
}) {
  const [state, formAction] = useActionState<ResellerState, FormData>(renewCustomAction, {});
  const [gb, setGb] = useState(rates.minGb);
  const [days, setDays] = useState(0);

  const cleanGb = Math.min(rates.maxGb, Math.max(rates.minGb, Math.round(gb) || 0));
  const rawDays = Math.round(days) || 0;
  const cleanDays = rawDays > 0 ? Math.min(rates.maxDays, Math.max(rates.minDays, rawDays)) : 0;
  const listPrice = customPrice(rates, cleanGb, cleanDays);
  const price = Math.max(0, Math.round((listPrice * (100 - Math.min(90, Math.max(0, discount)))) / 100));
  const enough = balance >= price;

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="serviceId" value={serviceId} />
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}

      <div className="field">
        <label htmlFor="renew-gb">حجم (گیگابایت)</label>
        <input
          id="renew-gb"
          name="gb"
          type="number"
          className="ltr"
          inputMode="numeric"
          min={rates.minGb}
          max={rates.maxGb}
          step={1}
          value={Number.isFinite(gb) ? gb : ""}
          onChange={(event) => setGb(Number(event.target.value))}
          required
        />
        <span className="field-hint">
          بین {faNum(rates.minGb)} تا {faNum(rates.maxGb)} گیگابایت — هر گیگ {toman(rates.perGb)}
        </span>
      </div>

      <div className="field">
        <label htmlFor="renew-days">مدت (روز)</label>
        <input
          id="renew-days"
          name="days"
          type="number"
          className="ltr"
          inputMode="numeric"
          min={0}
          max={rates.maxDays}
          step={1}
          value={Number.isFinite(days) ? days : ""}
          onChange={(event) => setDays(Number(event.target.value))}
        />
        <span className="field-hint">
          صفر یعنی فقط حجم اضافه شود و تاریخ انقضا دست‌نخورده بماند. هر روز {toman(rates.perDay)}
        </span>
      </div>

      <div className="amount-box">
        <span>پرداخت از اعتبار شما</span>
        <div className="btn-row">
          <b data-testid="renew-custom-price">{toman(price)}</b>
          {listPrice !== price ? (
            <span className="dim" style={{ textDecoration: "line-through", fontSize: 12 }}>
              {toman(listPrice)}
            </span>
          ) : null}
        </div>
      </div>

      <SubmitButton className="btn btn-primary btn-block" pendingText="در حال شارژ…" disabled={!enough}>
        {enough ? "شارژ و کسر از اعتبار" : "اعتبار کافی نیست"}
      </SubmitButton>
    </form>
  );
}
