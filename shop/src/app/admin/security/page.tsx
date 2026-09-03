import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { requireStaff, roleLabel } from "@/lib/auth";
import { backupCodesLeft, otpauthUrl, prettySecret } from "@/lib/totp";
import { faDate, faNum } from "@/lib/format";
import TotpSetup from "@/components/TotpSetup";

export const dynamic = "force-dynamic";
export const metadata = { title: "امنیت حساب" };

export default async function AdminSecurityPage() {
  const staff = await requireStaff();
  const [account, settings] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: staff.id } }),
    getSettings(),
  ]);

  const enabled = Boolean(account.totpEnabledAt);
  const left = backupCodesLeft(account.totpBackupCodes);
  const secret = account.totpSecret;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>امنیت حساب</h1>
          <p>
            ورود دومرحله‌ای برای حساب <b className="ltr mono">{account.email}</b> (
            {roleLabel(account.role)}).
          </p>
        </div>
        <span className={`badge ${enabled ? "badge-success" : "badge-warn"}`}>
          {enabled ? "دومرحله‌ای روشن" : "دومرحله‌ای خاموش"}
        </span>
      </div>

      {!enabled ? (
        <div className="alert alert-warn">
          پنل مدیریت به همهٔ اطلاعات مشتری‌ها و رمز سرورها دسترسی دارد. با روشن‌کردن ورود دومرحله‌ای،
          حتی اگر رمز عبورتان لو برود، بدون گوشی شما نمی‌شود وارد شد.
        </div>
      ) : null}

      <div className="card">
        <div className="card-title">
          <h3>🔐 ورود دومرحله‌ای (TOTP)</h3>
          {enabled && account.totpEnabledAt ? (
            <span className="badge badge-info">از {faDate(account.totpEnabledAt)}</span>
          ) : null}
        </div>

        <TotpSetup
          enabled={enabled}
          secret={secret}
          prettyKey={secret ? prettySecret(secret) : ""}
          otpauth={secret ? otpauthUrl(secret, account.email, settings.site_name || "Fandogh") : ""}
          backupLeft={left ? faNum(left) : ""}
        />
      </div>

      <div className="card">
        <div className="card-title">
          <h3>📋 نکته‌های امنیتی</h3>
        </div>
        <ul className="check-list">
          <li>رمز عبور پنل را جای دیگری استفاده نکنید و هر چند وقت عوضش کنید.</li>
          <li>کدهای پشتیبان را جایی بیرون از همان گوشی نگه دارید.</li>
          <li>
            برای همکار پشتیبانی، حساب جدا با نقش <b>پشتیبان</b> بسازید؛ اینطور به سرورها، پرداخت‌ها و
            تنظیمات دسترسی ندارد.
          </li>
          <li>فایل پشتیبان را با گذرواژه بسازید تا بیرون از سرور قابل خواندن نباشد.</li>
        </ul>
      </div>
    </div>
  );
}
