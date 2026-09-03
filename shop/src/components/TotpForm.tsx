"use client";

import { useActionState } from "react";
import { verifyTotpAction, type AuthState } from "@/app/actions/auth";
import SubmitButton from "./SubmitButton";

/** کادر کد دومرحله‌ای؛ روی موبایل صفحه‌کلید عددی باز می‌شود */
export default function TotpForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(verifyTotpAction, {});

  return (
    <form action={formAction} className="form">
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      <input type="hidden" name="next" value={next} />

      <div className="field">
        <label htmlFor="code">کد تأیید</label>
        <input
          id="code"
          name="code"
          className="ltr mono"
          style={{ letterSpacing: "0.35em", fontSize: "1.15rem", textAlign: "center" }}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="123456"
          required
        />
      </div>

      <SubmitButton className="btn btn-primary btn-block">تأیید و ورود</SubmitButton>
    </form>
  );
}
