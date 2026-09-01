"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction, type AuthState } from "@/app/actions/auth";
import SubmitButton from "./SubmitButton";

export default function AuthForm({ mode, next }: { mode: "login" | "register"; next: string }) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction] = useActionState<AuthState, FormData>(action, {});

  return (
    <div className="auth-wrap container">
      <div className="card">
        <div className="center" style={{ marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fandogh.svg" alt="" width={54} height={54} className="brand-logo" style={{ width: 54, height: 54 }} />
        </div>
        <h1 className="center" style={{ fontSize: "1.4rem" }}>
          <span className="gradient-text">
            {mode === "login" ? "ورود به حساب" : "ساخت حساب کاربری"}
          </span>
        </h1>
        <p className="center">
          {mode === "login"
            ? "برای مشاهده سرویس‌ها و خرید وارد شوید."
            : "با ایمیل ثبت‌نام کنید؛ کمتر از یک دقیقه طول می‌کشد."}
        </p>

        {state.error ? <div className="alert alert-error">{state.error}</div> : null}

        <form action={formAction} className="form">
          <input type="hidden" name="next" value={next} />
          {mode === "register" ? (
            <div className="field">
              <label htmlFor="name">نام (اختیاری)</label>
              <input id="name" name="name" type="text" autoComplete="name" placeholder="مثلاً علی رضایی" />
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="email">ایمیل</label>
            <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="ltr" />
          </div>
          <div className="field">
            <label htmlFor="password">رمز عبور</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="حداقل ۸ کاراکتر"
              className="ltr"
            />
          </div>
          {mode === "register" ? (
            <div className="field">
              <label htmlFor="confirm">تکرار رمز عبور</label>
              <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className="ltr" />
            </div>
          ) : null}
          <SubmitButton className="btn btn-primary btn-block">
            {mode === "login" ? "ورود" : "ثبت‌نام"}
          </SubmitButton>
        </form>

        <div className="center" style={{ marginTop: 16, fontSize: 14 }}>
          {mode === "login" ? (
            <>
              حساب ندارید؟ <Link href={`/register?next=${encodeURIComponent(next)}`}>ثبت‌نام کنید</Link>
            </>
          ) : (
            <>
              قبلاً ثبت‌نام کرده‌اید؟ <Link href={`/login?next=${encodeURIComponent(next)}`}>وارد شوید</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
