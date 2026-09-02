"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { rotateServiceAction, type ShopState } from "@/app/actions/shop";
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
}: {
  serviceId: string;
  rotatedAt?: string | null;
  /** از قبل با ارقام فارسی قالب‌بندی شده */
  rotateCount: string;
  cooldownMinutes: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction] = useActionState<ShopState, FormData>(rotateServiceAction, {});
  const [armed, setArmed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      setArmed(false);
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <div className={`sec-panel${armed ? " is-armed" : ""}`}>
      <div className="sec-head">
        <span className="sec-icon" aria-hidden>
          🔐
        </span>
        <div>
          <b>بازتولید کانفیگ</b>
          <small>
            شناسه اتصال (UUID) و آدرس لینک اشتراک از نو ساخته می‌شود؛ هر کسی که کانفیگ قدیمی شما را
            دارد، بلافاصله قطع می‌شود.
          </small>
        </div>
      </div>

      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}

      <div className="sec-facts">
        <span>
          <small>آخرین بازتولید</small>
          <b>{rotatedAt || "تا به حال انجام نشده"}</b>
        </span>
        <span>
          <small>تعداد دفعات</small>
          <b>{rotateCount} بار</b>
        </span>
        <span>
          <small>فاصله مجاز</small>
          <b>هر {cooldownMinutes} دقیقه یک بار</b>
        </span>
      </div>

      {disabled ? (
        <p className="field-hint sec-note">{disabledReason ?? "این سرویس قابل بازتولید نیست."}</p>
      ) : !armed ? (
        <button type="button" className="btn btn-ghost-danger" onClick={() => setArmed(true)}>
          بازتولید کانفیگ و قطع دستگاه‌های قبلی
        </button>
      ) : (
        <form action={formAction} className="sec-confirm">
          <input type="hidden" name="serviceId" value={serviceId} />
          <p className="sec-warn">مطمئنید؟ بعد از این کار:</p>
          <ul className="sec-list">
            <li>لینک اشتراک و همه کانفیگ‌های فعلی شما باطل می‌شوند.</li>
            <li>باید لینک تازه را در برنامه‌تان جایگزین کنید.</li>
            <li>حجم، اعتبار و مصرف سرویس دست‌نخورده باقی می‌ماند.</li>
          </ul>
          <div className="btn-row">
            <SubmitButton className="btn btn-danger" pendingText="در حال ساخت کانفیگ تازه…">
              بله، کانفیگ تازه بساز
            </SubmitButton>
            <button type="button" className="btn btn-sm" onClick={() => setArmed(false)}>
              انصراف
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
