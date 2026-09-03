"use client";

import { useActionState, useState } from "react";
import { sellServiceAction, type ResellerState } from "@/app/actions/reseller";
import { toman } from "@/lib/format";
import SubmitButton from "./SubmitButton";

type PlanOption = {
  id: string;
  title: string;
  price: number;
  listPrice: number;
  summary: string;
  panelIds: string[];
};

/** فرم فروش سرویس در پنل نمایندگی: انتخاب پلن، لوکیشن و نام مشتری */
export default function SellForm({
  plans,
  panels,
  balance,
}: {
  plans: PlanOption[];
  panels: { id: string; flag: string; location: string }[];
  balance: number;
}) {
  const [state, formAction] = useActionState<ResellerState, FormData>(sellServiceAction, {});
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");

  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const allowed = plan?.panelIds.length
    ? panels.filter((p) => plan.panelIds.includes(p.id))
    : panels;
  const enough = plan ? balance >= plan.price : false;

  return (
    <form action={formAction} className="form">
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}

      <div className="field">
        <label htmlFor="planId">پلن</label>
        <select id="planId" name="planId" value={planId} onChange={(e) => setPlanId(e.target.value)}>
          {plans.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title} — {toman(option.price)}
            </option>
          ))}
        </select>
        {plan ? <span className="field-hint">{plan.summary}</span> : null}
      </div>

      {allowed.length > 1 ? (
        <div className="field">
          <label htmlFor="panelId">لوکیشن</label>
          <select id="panelId" name="panelId" defaultValue="">
            <option value="">انتخاب خودکار (کم‌بارترین سرور)</option>
            {allowed.map((panel) => (
              <option key={panel.id} value={panel.id}>
                {panel.flag} {panel.location}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="customerName">نام مشتری (اختیاری)</label>
        <input
          id="customerName"
          name="customerName"
          placeholder="مثلاً علی — ۰۹۱۲…"
          autoComplete="off"
          maxLength={60}
        />
        <span className="field-hint">فقط برای پیدا کردن راحت‌تر در فهرست خودتان است.</span>
      </div>

      {plan ? (
        <div className="amount-box">
          <span>پرداخت از اعتبار شما</span>
          <div className="btn-row">
            <b>{toman(plan.price)}</b>
            <span className="dim" style={{ textDecoration: "line-through", fontSize: 12 }}>
              {toman(plan.listPrice)}
            </span>
          </div>
        </div>
      ) : null}

      <SubmitButton
        className="btn btn-primary btn-block btn-lg"
        pendingText="در حال ساخت سرویس…"
        disabled={!enough}
      >
        {enough ? "ساخت و تحویل سرویس" : "اعتبار کافی نیست"}
      </SubmitButton>
      <span className="field-hint center">
        بعد از ساخت، لینک اشتراک و QR در صفحهٔ همان مشتری نمایش داده می‌شود.
      </span>
    </form>
  );
}
