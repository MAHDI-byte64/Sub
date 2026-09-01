"use client";

import { useActionState } from "react";
import { changePasswordAction, type AuthState } from "@/app/actions/auth";
import SubmitButton from "./SubmitButton";

export default function ChangePasswordForm() {
  const [state, formAction] = useActionState<AuthState & { success?: string }, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <form action={formAction} className="form">
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}
      <div className="field">
        <label htmlFor="current">رمز فعلی</label>
        <input id="current" name="current" type="password" required className="ltr" />
      </div>
      <div className="field">
        <label htmlFor="password">رمز جدید</label>
        <input id="password" name="password" type="password" required minLength={8} className="ltr" />
      </div>
      <div className="field">
        <label htmlFor="confirm">تکرار رمز جدید</label>
        <input id="confirm" name="confirm" type="password" required minLength={8} className="ltr" />
      </div>
      <SubmitButton className="btn btn-primary">تغییر رمز عبور</SubmitButton>
    </form>
  );
}
