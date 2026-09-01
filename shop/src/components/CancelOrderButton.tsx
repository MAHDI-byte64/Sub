"use client";

import { useActionState } from "react";
import { cancelOrderAction, type ShopState } from "@/app/actions/shop";
import SubmitButton from "./SubmitButton";

export default function CancelOrderButton({ code }: { code: string }) {
  const [state, formAction] = useActionState<ShopState, FormData>(cancelOrderAction, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="code" value={code} />
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}
      <SubmitButton className="btn btn-sm btn-ghost" pendingText="…">
        لغو سفارش
      </SubmitButton>
    </form>
  );
}
