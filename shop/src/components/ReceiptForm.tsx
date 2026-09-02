"use client";

import { useActionState } from "react";
import { uploadReceiptAction, type ShopState } from "@/app/actions/shop";
import { t, type Locale } from "@/lib/i18n";
import SubmitButton from "./SubmitButton";

export default function ReceiptForm({ code, locale = "fa" }: { code: string; locale?: Locale }) {
  const tr = (key: string) => t(locale, key);
  const [state, formAction] = useActionState<ShopState, FormData>(uploadReceiptAction, {});

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="code" value={code} />
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}

      <div className="field">
        <label htmlFor="receipt">{tr("order.receiptLabel")}</label>
        <input id="receipt" name="receipt" type="file" accept="image/*,application/pdf" required />
        <span className="field-hint">{tr("order.receiptHint")}</span>
      </div>
      <div className="field">
        <label htmlFor="ref">{tr("order.receiptRefLabel")}</label>
        <input id="ref" name="ref" type="text" className="ltr" placeholder="123456" />
      </div>
      <SubmitButton className="btn btn-primary btn-block" pendingText={tr("order.sending")}>
        {tr("order.sendReceipt")}
      </SubmitButton>
    </form>
  );
}
