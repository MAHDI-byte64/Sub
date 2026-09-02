"use client";

import { useActionState } from "react";
import { toggleAutoRenewAction, type ShopState } from "@/app/actions/shop";
import SubmitButton from "./SubmitButton";

export default function AutoRenewToggle({
  serviceId,
  enabled,
  price,
}: {
  serviceId: string;
  enabled: boolean;
  price: string;
}) {
  const [state, formAction] = useActionState<ShopState, FormData>(toggleAutoRenewAction, {});

  return (
    <form action={formAction} className="auto-renew">
      <input type="hidden" name="serviceId" value={serviceId} />
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}
      <div className="auto-renew-row">
        <span>
          <b>{enabled ? "🔄 تمدید خودکار روشن است" : "تمدید خودکار"}</b>
          <small>
            {enabled
              ? `در زمان انقضا ${price} از کیف پول کم و سرویس تمدید می‌شود.`
              : `با روشن‌کردن، در زمان انقضا ${price} از کیف پول کسر و سرویس تمدید می‌شود.`}
          </small>
        </span>
        <SubmitButton
          className={`btn btn-sm${enabled ? "" : " btn-primary"}`}
          pendingText="…"
        >
          {enabled ? "خاموش کن" : "روشن کن"}
        </SubmitButton>
      </div>
    </form>
  );
}
