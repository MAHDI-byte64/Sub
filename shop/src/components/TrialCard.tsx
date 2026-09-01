"use client";

import { useActionState } from "react";
import { requestTrialAction, type ShopState } from "@/app/actions/shop";
import { faNum } from "@/lib/format";
import SubmitButton from "./SubmitButton";

export default function TrialCard({
  panels,
  volume,
  days,
}: {
  panels: { id: string; flag: string; location: string }[];
  volume: string;
  days: string;
}) {
  const [state, formAction] = useActionState<ShopState, FormData>(requestTrialAction, {});

  return (
    <div className="card">
      <div className="card-title">
        <h3>🎁 اکانت تست رایگان</h3>
        <span className="badge badge-info">یک بار برای هر حساب</span>
      </div>
      <p>
        می‌توانید یک اکانت {faNum(volume)} گیگابایتی {faNum(days)} روزه رایگان بسازید و کیفیت سرویس را قبل از
        خرید امتحان کنید.
      </p>
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}
      <form action={formAction} className="form">
        {panels.length > 1 ? (
          <div className="field">
            <label htmlFor="trialPanel">لوکیشن</label>
            <select id="trialPanel" name="panelId" defaultValue="">
              <option value="">انتخاب خودکار</option>
              {panels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.flag} {p.location}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <SubmitButton className="btn btn-success" pendingText="در حال ساخت…">
          ساخت اکانت تست
        </SubmitButton>
      </form>
    </div>
  );
}
