"use client";

import { useActionState, useState } from "react";
import { sellCustomAction, sellServiceAction, type ResellerState } from "@/app/actions/reseller";
import { faNum, toman } from "@/lib/format";
import { customPrice, type CustomRates } from "@/lib/pricing";
import SubmitButton from "./SubmitButton";

type PlanOption = {
  id: string;
  title: string;
  price: number;
  listPrice: number;
  summary: string;
  panelIds: string[];
};

/**
 * فرم فروش سرویس در پنل نمایندگی.
 *
 * دو حالت دارد: پلن آماده، یا حجم و زمان دلخواه که خود نماینده می‌چیند. مدیر
 * می‌تواند هرکدام را در تنظیمات خاموش کند؛ اگر فقط یکی روشن باشد، دکمه‌های
 * جابه‌جایی نمایش داده نمی‌شوند.
 */
export default function SellForm({
  plans,
  panels,
  balance,
  rates = null,
  discount = 0,
  showPlans = true,
}: {
  plans: PlanOption[];
  panels: { id: string; flag: string; location: string }[];
  balance: number;
  /** نرخ‌های حجم دلخواه؛ null یعنی این حالت خاموش است */
  rates?: CustomRates | null;
  /** درصد تخفیف نمایندگی، برای پیش‌نمایش قیمت دلخواه */
  discount?: number;
  showPlans?: boolean;
}) {
  const [state, formAction] = useActionState<ResellerState, FormData>(sellServiceAction, {});
  const [customState, customAction] = useActionState<ResellerState, FormData>(sellCustomAction, {});
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [mode, setMode] = useState<"plan" | "custom">(
    showPlans && plans.length ? "plan" : "custom",
  );
  const [gb, setGb] = useState(rates?.minGb ?? 10);
  const [days, setDays] = useState(rates?.minDays ?? 30);

  const bothModes = showPlans && plans.length > 0 && Boolean(rates);
  const customGb = rates ? Math.min(rates.maxGb, Math.max(rates.minGb, Math.round(gb) || 0)) : 0;
  const customDays = rates ? Math.min(rates.maxDays, Math.max(rates.minDays, Math.round(days) || 0)) : 0;
  const customList = rates ? customPrice(rates, customGb, customDays) : 0;
  const customPay = Math.max(0, Math.round((customList * (100 - Math.min(90, Math.max(0, discount)))) / 100));
  const customEnough = balance >= customPay;

  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const allowed = plan?.panelIds.length
    ? panels.filter((p) => plan.panelIds.includes(p.id))
    : panels;
  const enough = plan ? balance >= plan.price : false;

  const switcher = bothModes ? (
    <div className="subject-chips" style={{ marginBottom: 14 }}>
      <button
        type="button"
        className={`chip${mode === "plan" ? " is-active" : ""}`}
        onClick={() => setMode("plan")}
      >
        پلن آماده
      </button>
      <button
        type="button"
        className={`chip${mode === "custom" ? " is-active" : ""}`}
        onClick={() => setMode("custom")}
      >
        حجم و زمان دلخواه
      </button>
    </div>
  ) : null;

  if (mode === "custom" && rates) {
    return (
      <>
        {switcher}
        <form action={customAction} className="form">
          {customState.error ? <div className="alert alert-error">{customState.error}</div> : null}

          <div className="field">
            <label htmlFor="custom-gb">حجم (گیگابایت)</label>
            <input
              id="custom-gb"
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
            <label htmlFor="custom-days">مدت (روز)</label>
            <input
              id="custom-days"
              name="days"
              type="number"
              className="ltr"
              inputMode="numeric"
              min={rates.minDays}
              max={rates.maxDays}
              step={1}
              value={Number.isFinite(days) ? days : ""}
              onChange={(event) => setDays(Number(event.target.value))}
              required
            />
            <span className="field-hint">
              بین {faNum(rates.minDays)} تا {faNum(rates.maxDays)} روز — هر روز {toman(rates.perDay)}
            </span>
          </div>

          {panels.length > 1 ? (
            <div className="field">
              <label htmlFor="custom-panel">لوکیشن</label>
              <select id="custom-panel" name="panelId" defaultValue="">
                <option value="">انتخاب خودکار (کم‌بارترین سرور)</option>
                {panels.map((panel) => (
                  <option key={panel.id} value={panel.id}>
                    {panel.flag} {panel.location}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="custom-customer">نام مشتری (اختیاری)</label>
            <input
              id="custom-customer"
              name="customerName"
              placeholder="مثلاً علی — ۰۹۱۲…"
              autoComplete="off"
              maxLength={60}
            />
          </div>

          <div className="amount-box">
            <span>پرداخت از اعتبار شما</span>
            <div className="btn-row">
              <b data-testid="custom-price">{toman(customPay)}</b>
              {customList !== customPay ? (
                <span className="dim" style={{ textDecoration: "line-through", fontSize: 12 }}>
                  {toman(customList)}
                </span>
              ) : null}
            </div>
          </div>

          <SubmitButton
            className="btn btn-primary btn-block btn-lg"
            pendingText="در حال ساخت سرویس…"
            disabled={!customEnough}
          >
            {customEnough ? "ساخت و تحویل سرویس" : "اعتبار کافی نیست"}
          </SubmitButton>
          <span className="field-hint center">
            قیمت = (گیگابایت × نرخ گیگ) + (روز × نرخ روز)، با تخفیف نمایندگی شما.
          </span>
        </form>
      </>
    );
  }

  return (
    <>
      {switcher}
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
    </>
  );
}
