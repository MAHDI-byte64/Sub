"use client";

import { useActionState, useState } from "react";
import { rotateServiceAction, type ShopState } from "@/app/actions/shop";
import { t, type Locale } from "@/lib/i18n";
import SubmitButton from "./SubmitButton";

/**
 * بازتولید کانفیگ: UUID و لینک اشتراک عوض می‌شود.
 * چون این کار اتصال همه دستگاه‌های فعلی را قطع می‌کند، قبل از اجرا یک مرحله
 * تأیید با توضیح پیامدها نشان داده می‌شود.
 */
export default function RotateConfigButton({
  serviceId,
  rotatedAt,
  rotateCount,
  cooldownMinutes,
  disabled = false,
  disabledReason,
  locale = "fa",
}: {
  serviceId: string;
  rotatedAt?: string | null;
  /** از قبل با ارقام فارسی قالب‌بندی شده */
  rotateCount: string;
  cooldownMinutes: string;
  disabled?: boolean;
  disabledReason?: string;
  locale?: Locale;
}) {
  const [state, formAction] = useActionState<ShopState, FormData>(rotateServiceAction, {});
  const [confirming, setConfirming] = useState(false);
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);

  // بعد از موفقیت، خود اکشن صفحه را تازه می‌کند (revalidatePath)؛ اینجا فقط
  // حالت «تأیید» را کنار می‌گذاریم و این را از روی نتیجه حساب می‌کنیم تا
  // نیازی به setState داخل useEffect نباشد.
  const armed = confirming && !state.success;
  const setArmed = setConfirming;

  return (
    <div className={`sec-panel${armed ? " is-armed" : ""}`}>
      <div className="sec-head">
        <span className="sec-icon" aria-hidden>
          🔐
        </span>
        <div>
          <b>{tr("rotate.title")}</b>
          <small>{tr("rotate.text")}</small>
        </div>
      </div>

      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}

      <div className="sec-facts">
        <span>
          <small>{tr("rotate.lastRotate")}</small>
          <b>{rotatedAt || tr("rotate.never")}</b>
        </span>
        <span>
          <small>{tr("rotate.count")}</small>
          <b>
            {rotateCount} {tr("rotate.times")}
          </b>
        </span>
        <span>
          <small>{tr("rotate.cooldown")}</small>
          <b>{tr("rotate.everyMinutes", { minutes: cooldownMinutes })}</b>
        </span>
      </div>

      {disabled ? (
        <p className="field-hint sec-note">{disabledReason ?? tr("rotate.disabledOther")}</p>
      ) : !armed ? (
        <button type="button" className="btn btn-ghost-danger" onClick={() => setArmed(true)}>
          {tr("rotate.button")}
        </button>
      ) : (
        <form action={formAction} className="sec-confirm">
          <input type="hidden" name="serviceId" value={serviceId} />
          <p className="sec-warn">{tr("rotate.sure")}</p>
          <ul className="sec-list">
            <li>{tr("rotate.c1")}</li>
            <li>{tr("rotate.c2")}</li>
            <li>{tr("rotate.c3")}</li>
          </ul>
          <div className="btn-row">
            <SubmitButton className="btn btn-danger" pendingText={tr("rotate.pending")}>
              {tr("rotate.confirm")}
            </SubmitButton>
            <button type="button" className="btn btn-sm" onClick={() => setArmed(false)}>
              {tr("common.cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
