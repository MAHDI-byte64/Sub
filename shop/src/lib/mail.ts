import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { asBool, asNum, getSettings, type Settings } from "./settings";

/**
 * ارسال ایمیل با SMTP.
 *
 * تنظیماتش از پنل مدیریت خوانده می‌شود، پس صاحب فروشگاه می‌تواند هر سرویسی
 * (میل‌سرور خودش، Zoho، Gmail، Mailgun و…) را بدون دست‌زدن به کد وصل کند.
 * اگر SMTP تنظیم نشده باشد، هیچ‌جای سایت خطا نمی‌دهد؛ فقط قابلیت‌های وابسته
 * به ایمیل (مثل بازیابی رمز) خاموش می‌مانند.
 */

export type MailResult = { ok: boolean; code: "sent" | "not-configured" | "failed"; detail?: string };

export function mailReady(settings: Settings): boolean {
  return Boolean(settings.smtp_host?.trim() && settings.smtp_from?.trim());
}

function transport(settings: Settings): Transporter {
  const port = Math.max(1, asNum(settings.smtp_port, 587));
  const user = settings.smtp_user?.trim();
  const pass = settings.smtp_pass ?? "";

  return nodemailer.createTransport({
    host: settings.smtp_host.trim(),
    port,
    // پورت ۴۶۵ از ابتدا رمزگذاری‌شده است؛ بقیه با STARTTLS بالا می‌آیند
    secure: asBool(settings.smtp_secure) || port === 465,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    tls: {
      // میل‌سرورهای خانگی اغلب گواهی خودامضا دارند؛ با یک کلید در تنظیمات
      // می‌شود سخت‌گیری را کم کرد، ولی پیش‌فرض همان بررسی کامل است.
      rejectUnauthorized: !asBool(settings.smtp_insecure),
    },
  });
}

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<MailResult> {
  const settings = await getSettings();
  if (!mailReady(settings)) return { ok: false, code: "not-configured" };

  try {
    await transport(settings).sendMail({
      from: settings.smtp_from.trim(),
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { ok: true, code: "sent" };
  } catch (err) {
    return { ok: false, code: "failed", detail: (err as Error).message };
  }
}

/** قالب سادهٔ راست‌چین برای ایمیل‌های سایت */
export function mailTemplate(input: {
  siteName: string;
  title: string;
  body: string;
  buttonLabel?: string;
  buttonUrl?: string;
  footer?: string;
}): string {
  const button =
    input.buttonUrl && input.buttonLabel
      ? `<p style="margin:26px 0"><a href="${input.buttonUrl}" style="background:#f4b740;color:#1a1a1a;text-decoration:none;padding:12px 26px;border-radius:10px;font-weight:bold;display:inline-block">${input.buttonLabel}</a></p>
         <p style="font-size:13px;color:#666">اگر دکمه کار نکرد، این نشانی را در مرورگر باز کنید:<br><span style="direction:ltr;display:inline-block;word-break:break-all">${input.buttonUrl}</span></p>`
      : "";

  return `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8">
<body style="margin:0;background:#f5f5f5;padding:24px;font-family:Tahoma,Arial,sans-serif;color:#222">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:14px;padding:28px">
    <h2 style="margin:0 0 6px">${input.siteName}</h2>
    <h3 style="margin:0 0 16px;font-weight:normal;color:#444">${input.title}</h3>
    <div style="line-height:2;font-size:14px">${input.body}</div>
    ${button}
    ${input.footer ? `<p style="font-size:12px;color:#888;border-top:1px solid #eee;padding-top:14px;margin-top:22px">${input.footer}</p>` : ""}
  </div>
</body></html>`;
}
