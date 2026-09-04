"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, type ResetState } from "@/app/actions/auth";
import { t, type Locale } from "@/lib/i18n";
import SubmitButton from "./SubmitButton";

/** درخواست لینک بازیابی رمز */
export default function ForgotForm({ locale = "fa" }: { locale?: Locale }) {
  const [state, formAction] = useActionState<ResetState, FormData>(forgotPasswordAction, {});
  const tr = (key: string) => t(locale, key);

  return (
    <div className="container section" style={{ maxWidth: 520 }}>
      <div className="card">
        <div className="card-title">
          <h3>🔑 {tr("auth.forgotTitle")}</h3>
        </div>
        <p className="field-hint">{tr("auth.forgotLead")}</p>

        {state.error ? <div className="alert alert-error">{state.error}</div> : null}
        {state.success ? <div className="alert alert-success">{state.success}</div> : null}

        {!state.success ? (
          <form action={formAction} className="form">
            <div className="field">
              <label htmlFor="email">{tr("auth.email")}</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="ltr"
              />
            </div>
            <SubmitButton className="btn btn-primary btn-block">{tr("auth.forgotBtn")}</SubmitButton>
          </form>
        ) : null}

        <div className="center" style={{ marginTop: 16, fontSize: 14 }}>
          <Link className="gold" href="/login">
            {tr("auth.backToLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
}
