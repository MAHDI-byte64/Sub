"use client";

import { useActionState, useState } from "react";
import { createOrderAction, type ShopState } from "@/app/actions/shop";
import SubmitButton from "./SubmitButton";

type PanelOption = { id: string; flag: string; location: string };

export default function CheckoutForm({
  plan,
  panels,
  renew,
}: {
  plan: { id: string; title: string; priceToman: number; priceLabel: string };
  panels: PanelOption[];
  renew: { id: string; remark: string } | null;
}) {
  const [state, formAction] = useActionState<ShopState, FormData>(createOrderAction, {});
  const [code, setCode] = useState("");
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
      setDiscountMsg({ ok: false, text: "بررسی کد تخفیف ناموفق بود." });
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
          این سفارش برای <b>تمدید</b> سرویس «{renew.remark}» ثبت می‌شود؛ حجم و زمان به همان کانفیگ اضافه
          می‌شود و لینک اشتراک تغییر نمی‌کند.
        </div>
      ) : null}

      {!renew ? (
        <div className="field">
          <label htmlFor="panelId">انتخاب لوکیشن</label>
          <select id="panelId" name="panelId" defaultValue="">
            <option value="">انتخاب خودکار (کم‌بارترین سرور)</option>
            {panels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.flag} {p.location}
              </option>
            ))}
          </select>
          <span className="field-hint">در صورت نیاز می‌توانید بعداً از پشتیبانی درخواست تعویض سرور بدهید.</span>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="discountCode">کد تخفیف (اختیاری)</label>
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
            {checking ? "..." : "بررسی"}
          </button>
        </div>
        {discountMsg ? (
          <span className={discountMsg.ok ? "field-hint" : "field-hint"} style={{ color: discountMsg.ok ? "#6ee7b7" : "#fca5a5" }}>
            {discountMsg.text}
          </span>
        ) : null}
      </div>

      <SubmitButton className="btn btn-primary btn-block" pendingText="در حال ثبت سفارش…">
        ثبت سفارش و رفتن به پرداخت
      </SubmitButton>
      <span className="field-hint center">
        با ثبت سفارش، قوانین سایت را می‌پذیرید. پرداخت به‌صورت کارت‌به‌کارت انجام می‌شود.
      </span>
    </form>
  );
}
