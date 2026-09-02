"use client";

import { useActionState } from "react";
import { requestTrialAction, type ShopState } from "@/app/actions/shop";
import { fmt } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import SubmitButton from "./SubmitButton";

export default function TrialCard({
  panels,
  volume,
  days,
  locale = "fa",
}: {
  panels: { id: string; flag: string; location: string }[];
  volume: string;
  days: string;
  locale?: Locale;
}) {
  const [state, formAction] = useActionState<ShopState, FormData>(requestTrialAction, {});
  const f = fmt(locale);
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);

  return (
    <div className="card">
      <div className="card-title">
        <h3>{tr("card.trialTitle")}</h3>
        <span className="badge badge-info">{tr("card.trialOnce")}</span>
      </div>
      <p>{tr("card.trialText", { gb: f.num(volume), days: f.num(days) })}</p>
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}
      <form action={formAction} className="form">
        {panels.length > 1 ? (
          <div className="field">
            <label htmlFor="trialPanel">{tr("common.location")}</label>
            <select id="trialPanel" name="panelId" defaultValue="">
              <option value="">{tr("card.trialAuto")}</option>
              {panels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.flag} {p.location}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <SubmitButton className="btn btn-success" pendingText={tr("card.trialPending")}>
          {tr("card.trialBtn")}
        </SubmitButton>
      </form>
    </div>
  );
}
