"use client";

import { useState } from "react";
import { fmt } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import { customPrice, type CustomRates } from "@/lib/pricing";

/**
 * کادر «خرید حجم اضافه» در صفحهٔ سرویس.
 *
 * فرم با متد GET به صفحهٔ پرداخت می‌رود تا بدون جاوااسکریپت هم کار کند؛ قیمت
 * لحظه‌ای با همان تابعی حساب می‌شود که سرور استفاده می‌کند، پس عددی که مشتری
 * می‌بیند دقیقاً همان مبلغ سفارش است.
 */
export default function AddonBox({
  serviceId,
  rates,
  locale = "fa",
}: {
  serviceId: string;
  rates: CustomRates;
  locale?: Locale;
}) {
  const f = fmt(locale);
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
  const [gb, setGb] = useState(rates.minGb);

  const clean = Number.isFinite(gb) ? Math.min(rates.maxGb, Math.max(rates.minGb, Math.round(gb))) : rates.minGb;
  const price = customPrice(rates, clean, 0);

  return (
    <form action="/checkout" method="get" className="form">
      <input type="hidden" name="service" value={serviceId} />

      <div className="field">
        <label htmlFor="addon-gb">{tr("service.addonAmount")}</label>
        <input
          id="addon-gb"
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
          {tr("service.addonRange", { min: f.num(rates.minGb), max: f.num(rates.maxGb) })}
        </span>
      </div>

      <div className="amount-box">
        <span>{tr("service.addonPrice")}</span>
        <b data-testid="addon-price">{f.money(price)}</b>
      </div>

      <button className="btn btn-primary btn-block" type="submit">
        {tr("service.addonBuy")}
      </button>
      <span className="field-hint center">{tr("service.addonKeepsExpiry")}</span>
    </form>
  );
}
