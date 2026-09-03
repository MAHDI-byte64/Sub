"use client";

import { useActionState } from "react";
import { cancelOrderAction, type ShopState } from "@/app/actions/shop";
import { t, type Locale } from "@/lib/i18n";
import SubmitButton from "./SubmitButton";

export default function CancelOrderButton({ code, locale = "fa" }: { code: string; locale?: Locale }) {
  const tr = (key: string) => t(locale, key);
  const [state, formAction] = useActionState<ShopState, FormData>(cancelOrderAction, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="code" value={code} />
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}
      <SubmitButton className="btn btn-sm btn-ghost" pendingText="…">
        {tr("order.cancelOrder")}
      </SubmitButton>
    </form>
  );
}
