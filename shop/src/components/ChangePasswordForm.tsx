"use client";

import { useActionState } from "react";
import { changePasswordAction, type AuthState } from "@/app/actions/auth";
import { t, type Locale } from "@/lib/i18n";
import SubmitButton from "./SubmitButton";

export default function ChangePasswordForm({ locale = "fa" }: { locale?: Locale }) {
  const tr = (key: string) => t(locale, key);
  const [state, formAction] = useActionState<AuthState & { success?: string }, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <form action={formAction} className="form">
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}
      <div className="field">
        <label htmlFor="current">{tr("profile.currentPassword")}</label>
        <input id="current" name="current" type="password" required className="ltr" />
      </div>
      <div className="field">
        <label htmlFor="password">{tr("profile.newPassword")}</label>
        <input id="password" name="password" type="password" required minLength={8} className="ltr" />
      </div>
      <div className="field">
        <label htmlFor="confirm">{tr("profile.confirmPassword")}</label>
        <input id="confirm" name="confirm" type="password" required minLength={8} className="ltr" />
      </div>
      <SubmitButton className="btn btn-primary">{tr("profile.changeBtn")}</SubmitButton>
    </form>
  );
}
