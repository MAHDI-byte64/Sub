"use client";

import { useActionState } from "react";
import { toggleAutoRenewAction, type ShopState } from "@/app/actions/shop";
import { t, type Locale } from "@/lib/i18n";
import SubmitButton from "./SubmitButton";

export default function AutoRenewToggle({
  serviceId,
  enabled,
  price,
  locale = "fa",
}: {
  serviceId: string;
  enabled: boolean;
  price: string;
  locale?: Locale;
}) {
  const [state, formAction] = useActionState<ShopState, FormData>(toggleAutoRenewAction, {});
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);

  return (
    <form action={formAction} className="auto-renew">
      <input type="hidden" name="serviceId" value={serviceId} />
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}
      <div className="auto-renew-row">
        <span>
          <b>{enabled ? tr("card.autoRenewOn") : tr("card.autoRenew")}</b>
          <small>
            {enabled
              ? tr("card.autoRenewOnText", { price })
              : tr("card.autoRenewOffText", { price })}
          </small>
        </span>
        <SubmitButton
          className={`btn btn-sm${enabled ? "" : " btn-primary"}`}
          pendingText="…"
        >
          {enabled ? tr("card.turnOff") : tr("card.turnOn")}
        </SubmitButton>
      </div>
    </form>
  );
}
