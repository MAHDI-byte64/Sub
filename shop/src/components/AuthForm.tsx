"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction, type AuthState } from "@/app/actions/auth";
import { t, type Locale } from "@/lib/i18n";
import SubmitButton from "./SubmitButton";

const BENEFIT_ICONS = ["⚡", "🎁", "🔄", "🎧"];

export default function AuthForm({
  mode,
  next,
  referral,
  locale = "fa",
  resetDone = false,
  canReset = false,
}: {
  mode: "login" | "register";
  next: string;
  referral?: string;
  locale?: Locale;
  /** بعد از ساخت رمز تازه به صفحهٔ ورود برگشته است */
  resetDone?: boolean;
  /** ایمیل سایت تنظیم شده و بازیابی رمز روشن است */
  canReset?: boolean;
}) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction] = useActionState<AuthState, FormData>(action, {});
  const tr = (key: string) => t(locale, key);

  return (
    <div className="container auth-split">
      <div className="auth-intro">
        <span className="eyebrow">
          <span className="eyebrow-dot" />
          {mode === "login" ? tr("auth.welcomeBack") : tr("auth.quick")}
        </span>
        <h1 style={{ fontSize: "clamp(1.6rem, 4.4vw, 2.3rem)" }}>
          {mode === "login" ? (
            <>
              {tr("auth.loginH1a")} <span className="gradient-text">{tr("auth.loginH1b")}</span>
            </>
          ) : (
            <>
              {tr("auth.registerH1a")} <span className="gradient-text">{tr("auth.registerH1b")}</span>
            </>
          )}
        </h1>
        <p>{mode === "login" ? tr("auth.loginLead") : tr("auth.registerLead")}</p>
        {referral ? (
          <div className="alert alert-success" style={{ marginTop: 14 }}>
            {tr("auth.referral")}
          </div>
        ) : null}
        <ul className="auth-benefits">
          {BENEFIT_ICONS.map((icon, i) => (
            <li key={icon}>
              <span>{icon}</span>
              {tr(`auth.b${i + 1}`)}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="center" style={{ marginBottom: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fandogh.svg" alt="" width={52} height={52} style={{ width: 52, height: 52 }} />
        </div>

        {resetDone ? <div className="alert alert-success">{tr("auth.resetDone")}</div> : null}
        {state.error ? <div className="alert alert-error">{state.error}</div> : null}

        <form action={formAction} className="form">
          <input type="hidden" name="next" value={next} />
          {referral ? <input type="hidden" name="ref" value={referral} /> : null}
          {mode === "register" ? (
            <div className="field">
              <label htmlFor="name">{tr("auth.name")}</label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder={tr("auth.namePlaceholder")}
              />
            </div>
          ) : null}
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
          <div className="field">
            <label htmlFor="password">{tr("auth.password")}</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={tr("auth.passwordHint")}
              className="ltr"
            />
          </div>
          {mode === "register" ? (
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
          ) : null}
          <SubmitButton className="btn btn-primary btn-block btn-lg">
            {mode === "login" ? tr("auth.loginBtn") : tr("auth.registerBtn")}
          </SubmitButton>
        </form>

        {mode === "login" && canReset ? (
          <div className="center" style={{ marginTop: 14, fontSize: 14 }}>
            <Link className="dim" href="/forgot">
              {tr("auth.forgotLink")}
            </Link>
          </div>
        ) : null}

        <div className="center" style={{ marginTop: 16, fontSize: 14 }}>
          {mode === "login" ? (
            <>
              {tr("auth.noAccount")}{" "}
              <Link className="gold" href={`/register?next=${encodeURIComponent(next)}`}>
                {tr("auth.goRegister")}
              </Link>
            </>
          ) : (
            <>
              {tr("auth.hasAccount")}{" "}
              <Link className="gold" href={`/login?next=${encodeURIComponent(next)}`}>
                {tr("auth.goLogin")}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
