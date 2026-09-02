"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction, type AuthState } from "@/app/actions/auth";
import SubmitButton from "./SubmitButton";

const BENEFITS = [
  { icon: "⚡", text: "تحویل آنی کانفیگ بلافاصله پس از تأیید پرداخت" },
  { icon: "🎁", text: "اکانت تست رایگان برای اطمینان قبل از خرید" },
  { icon: "🔄", text: "تمدید با یک کلیک، بدون تغییر لینک اشتراک" },
  { icon: "🎧", text: "پشتیبانی ۲۴ ساعته با تیکت داخل پنل" },
];

export default function AuthForm({
  mode,
  next,
  referral,
}: {
  mode: "login" | "register";
  next: string;
  referral?: string;
}) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction] = useActionState<AuthState, FormData>(action, {});

  return (
    <div className="container auth-split">
      <div className="auth-intro">
        <span className="eyebrow">
          <span className="eyebrow-dot" />
          {mode === "login" ? "خوش برگشتید" : "کمتر از یک دقیقه"}
        </span>
        <h1 style={{ fontSize: "clamp(1.6rem, 4.4vw, 2.3rem)" }}>
          {mode === "login" ? (
            <>
              ورود به <span className="gradient-text">پنل کاربری</span>
            </>
          ) : (
            <>
              ساخت <span className="gradient-text">حساب کاربری</span>
            </>
          )}
        </h1>
        <p>
          {mode === "login"
            ? "سرویس‌ها، مصرف لحظه‌ای، تمدید و تیکت‌های پشتیبانی؛ همه در یک صفحه."
            : "با ایمیل ثبت‌نام کنید و بلافاصله اکانت تست رایگان بگیرید."}
        </p>
        {referral ? (
          <div className="alert alert-success" style={{ marginTop: 14 }}>
            🎁 با لینک دعوت وارد شده‌اید؛ بعد از اولین خرید، پاداش دعوت‌کننده هم واریز می‌شود.
          </div>
        ) : null}
        <ul className="auth-benefits">
          {BENEFITS.map((b) => (
            <li key={b.text}>
              <span>{b.icon}</span>
              {b.text}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="center" style={{ marginBottom: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fandogh.svg" alt="" width={52} height={52} style={{ width: 52, height: 52 }} />
        </div>

        {state.error ? <div className="alert alert-error">{state.error}</div> : null}

        <form action={formAction} className="form">
          <input type="hidden" name="next" value={next} />
          {referral ? <input type="hidden" name="ref" value={referral} /> : null}
          {mode === "register" ? (
            <div className="field">
              <label htmlFor="name">نام (اختیاری)</label>
              <input id="name" name="name" type="text" autoComplete="name" placeholder="مثلاً علی رضایی" />
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="email">ایمیل</label>
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
          ) : null}
          <SubmitButton className="btn btn-primary btn-block btn-lg">
            {mode === "login" ? "ورود" : "ثبت‌نام و شروع"}
          </SubmitButton>
        </form>

        <div className="center" style={{ marginTop: 16, fontSize: 14 }}>
          {mode === "login" ? (
            <>
              حساب ندارید؟{" "}
              <Link className="gold" href={`/register?next=${encodeURIComponent(next)}`}>
                ثبت‌نام کنید
              </Link>
            </>
          ) : (
            <>
              قبلاً ثبت‌نام کرده‌اید؟{" "}
              <Link className="gold" href={`/login?next=${encodeURIComponent(next)}`}>
                وارد شوید
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
