"use client";

import { useActionState } from "react";
import { uploadReceiptAction, type ShopState } from "@/app/actions/shop";
import SubmitButton from "./SubmitButton";

export default function ReceiptForm({ code }: { code: string }) {
  const [state, formAction] = useActionState<ShopState, FormData>(uploadReceiptAction, {});

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="code" value={code} />
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}

      <div className="field">
        <label htmlFor="receipt">تصویر رسید پرداخت</label>
        <input id="receipt" name="receipt" type="file" accept="image/*,application/pdf" required />
        <span className="field-hint">فرمت‌های مجاز: JPG، PNG، WEBP یا PDF — حداکثر ۶ مگابایت.</span>
      </div>
      <div className="field">
        <label htmlFor="ref">کد پیگیری / ۴ رقم آخر کارت (اختیاری)</label>
        <input id="ref" name="ref" type="text" className="ltr" placeholder="مثلاً 123456" />
      </div>
      <SubmitButton className="btn btn-primary btn-block" pendingText="در حال ارسال…">
        ارسال رسید
      </SubmitButton>
    </form>
  );
}
