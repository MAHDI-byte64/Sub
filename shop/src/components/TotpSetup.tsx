"use client";

import { useActionState } from "react";
import {
  confirmTotpAction,
  disableTotpAction,
  newBackupCodesAction,
  startTotpAction,
  type SecurityState,
} from "@/app/actions/security";
import SubmitButton from "./SubmitButton";

/** کدهای پشتیبان فقط یک بار نشان داده می‌شوند */
function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="alert alert-warn" style={{ marginTop: 12 }}>
      <b>کدهای پشتیبان شما (فقط همین یک بار نمایش داده می‌شوند):</b>
      <div className="backup-codes">
        {codes.map((code) => (
          <span className="mono ltr" key={code}>
            {code}
          </span>
        ))}
      </div>
      این‌ها را جایی امن (کاغذ یا مدیر رمز) نگه دارید؛ اگر گوشی‌تان گم شد، تنها راه ورود همین‌هاست.
      هر کد فقط یک بار کار می‌کند.
    </div>
  );
}

export default function TotpSetup({
  enabled,
  secret,
  prettyKey,
  otpauth,
  backupLeft,
}: {
  enabled: boolean;
  secret: string | null;
  prettyKey: string;
  otpauth: string;
  /** تعداد کدهای پشتیبان، از قبل با ارقام فارسی آماده شده */
  backupLeft: string;
}) {
  const [start, startForm] = useActionState<SecurityState, FormData>(
    async () => startTotpAction(),
    {},
  );
  const [confirm, confirmForm] = useActionState<SecurityState, FormData>(confirmTotpAction, {});
  const [disable, disableForm] = useActionState<SecurityState, FormData>(disableTotpAction, {});
  const [codes, codesForm] = useActionState<SecurityState, FormData>(newBackupCodesAction, {});

  if (enabled) {
    return (
      <>
        {/* بعد از تأیید، صفحه دوباره ساخته می‌شود؛ کدهای پشتیبان باید همین‌جا هم دیده شوند */}
        {confirm.success ? <div className="alert alert-success">{confirm.success}</div> : null}
        {confirm.codes ? <BackupCodes codes={confirm.codes} /> : null}

        <div className="alert alert-success">
          ورود دومرحله‌ای روشن است. هنگام ورود، بعد از رمز عبور کد اپ احرازهویت هم پرسیده می‌شود.
          {backupLeft ? ` ${backupLeft} کد پشتیبان استفاده‌نشده دارید.` : " کد پشتیبان استفاده‌نشده‌ای ندارید."}
        </div>

        {codes.error ? <div className="alert alert-error">{codes.error}</div> : null}
        {codes.success ? <div className="alert alert-success">{codes.success}</div> : null}
        {codes.codes ? <BackupCodes codes={codes.codes} /> : null}

        <form action={codesForm} className="form">
          <div className="field">
            <label htmlFor="codes-password">ساخت کدهای پشتیبان تازه (با رمز عبور)</label>
            <input id="codes-password" name="password" type="password" autoComplete="current-password" />
            <span className="field-hint">کدهای قبلی با این کار از کار می‌افتند.</span>
          </div>
          <SubmitButton className="btn btn-sm">کدهای تازه بساز</SubmitButton>
        </form>

        {disable.error ? <div className="alert alert-error">{disable.error}</div> : null}
        {disable.success ? <div className="alert alert-success">{disable.success}</div> : null}

        <form action={disableForm} className="form">
          <div className="field">
            <label htmlFor="off-password">خاموش‌کردن ورود دومرحله‌ای (با رمز عبور)</label>
            <input id="off-password" name="password" type="password" autoComplete="current-password" />
          </div>
          <SubmitButton className="btn btn-sm btn-danger">خاموش کن</SubmitButton>
        </form>
      </>
    );
  }

  if (!secret) {
    return (
      <>
        {start.error ? <div className="alert alert-error">{start.error}</div> : null}
        <p className="field-hint">
          یک اپ احرازهویت مثل Google Authenticator، Authy، ۲FAS یا Aegis روی گوشی نصب کنید، بعد
          دکمهٔ زیر را بزنید تا کلید و QR ساخته شود.
        </p>
        <form action={startForm}>
          <SubmitButton className="btn btn-primary">شروع فعال‌سازی</SubmitButton>
        </form>
      </>
    );
  }

  return (
    <>
      {confirm.error ? <div className="alert alert-error">{confirm.error}</div> : null}
      {confirm.success ? <div className="alert alert-success">{confirm.success}</div> : null}
      {confirm.codes ? <BackupCodes codes={confirm.codes} /> : null}

      <p className="field-hint">
        این QR را در اپ احرازهویت اسکن کنید (یا کلید را دستی وارد کنید)، بعد کدی که اپ نشان می‌دهد را
        اینجا بنویسید تا فعال‌سازی کامل شود.
      </p>

      <div className="qr-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/qr?d=${encodeURIComponent(otpauth)}`} alt="QR ورود دومرحله‌ای" />
      </div>

      <div className="copy-box" style={{ marginTop: 12 }}>
        <code>{prettyKey}</code>
      </div>

      <form action={confirmForm} className="form" style={{ marginTop: 14 }}>
        <div className="field">
          <label htmlFor="totp-code">کد شش‌رقمی اپ</label>
          <input
            id="totp-code"
            name="code"
            className="ltr mono"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            required
          />
        </div>
        <SubmitButton className="btn btn-primary">تأیید و روشن‌کردن</SubmitButton>
      </form>
    </>
  );
}
