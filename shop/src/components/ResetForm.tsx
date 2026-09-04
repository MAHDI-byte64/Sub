"use client";

import { useActionState } from "react";
import { resetPasswordAction, type ResetState } from "@/app/actions/auth";
import { t, type Locale } from "@/lib/i18n";
import SubmitButton from "./SubmitButton";

/** ساخت رمز تازه با توکنی که در ایمیل آمده */
export default function ResetForm({ token, locale = "fa" }: { token: string; locale?: Locale }) {
  const [state, formAction] = useActionState<ResetState, FormData>(resetPasswordAction, {});
  const tr = (key: string) => t(locale, key);

  return (
    <div className="container section" style={{ maxWidth: 520 }}>
      <div className="card">
        <div className="card-title">
          <h3>🔑 {tr("auth.resetTitle")}</h3>
        </div>
        <p className="field-hint">{tr("auth.resetLead")}</p>

        {state.error ? <div className="alert alert-error">{state.error}</div> : null}

        <form action={formAction} className="form">
          <input type="hidden" name="token" value={token} />
          <div className="field">
            <label htmlFor="password">{tr("auth.password")}</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={tr("auth.passwordHint")}
              className="ltr"
            />
          </div>
          <div className="field">
            <label htmlFor="confirm">{tr("auth.confirm")}</label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="ltr"
            />
          </div>
          <SubmitButton className="btn btn-primary btn-block">{tr("auth.resetBtn")}</SubmitButton>
        </form>
      </div>
    </div>
  );
}
