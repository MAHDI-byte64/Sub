import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, pendingSession } from "@/lib/auth";
import { backupCodesLeft } from "@/lib/totp";
import { faNum } from "@/lib/format";
import TotpForm from "@/components/TotpForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "تأیید ورود دومرحله‌ای" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  const user = await getCurrentUser();
  if (user) redirect(target);

  const pending = await pendingSession();
  if (!pending) redirect(`/login?next=${encodeURIComponent(target)}`);

  const account = await db.user.findUnique({ where: { id: pending.userId } });
  const left = backupCodesLeft(account?.totpBackupCodes);

  return (
    <div className="container section" style={{ maxWidth: 520 }}>
      <div className="card">
        <div className="card-title">
          <h3>🔐 تأیید ورود</h3>
          <span className="badge badge-info">مرحلهٔ ۲ از ۲</span>
        </div>

        <p className="field-hint">
          برای <b className="ltr mono">{pending.email}</b> ورود دومرحله‌ای روشن است. کد شش‌رقمی را از
          اپ احرازهویت (Google Authenticator، Authy، ۲FAS و…) بخوانید و اینجا بنویسید.
        </p>

        <TotpForm next={target} />

        <p className="field-hint" style={{ marginTop: 14 }}>
          گوشی‌تان در دسترس نیست؟ یکی از <b>کدهای پشتیبان</b> را در همین کادر وارد کنید
          {left ? ` (${faNum(left)} کد استفاده‌نشده دارید)` : ""}. هر کد فقط یک بار کار می‌کند.
        </p>
        <p className="field-hint">
          <Link href="/login">بازگشت به صفحهٔ ورود</Link>
        </p>
      </div>
    </div>
  );
}
