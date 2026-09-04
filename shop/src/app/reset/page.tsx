import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import { checkResetToken } from "@/lib/reset";
import ResetForm from "@/components/ResetForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "ساخت رمز تازه" };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard/profile");

  const { token } = await searchParams;
  const locale = await getLocale();
  const check = await checkResetToken(token ?? "");

  if (!check.ok) {
    return (
      <div className="container section" style={{ maxWidth: 520 }}>
        <div className="card">
          <div className="alert alert-error">{t(locale, "auth.resetBadLink")}</div>
          <Link className="btn btn-primary btn-block" href="/forgot">
            {t(locale, "auth.forgotBtn")}
          </Link>
        </div>
      </div>
    );
  }

  return <ResetForm token={token ?? ""} locale={locale} />;
}
