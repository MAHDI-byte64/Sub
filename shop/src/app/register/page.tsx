import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";

export const metadata = { title: "ثبت‌نام" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; ref?: string }>;
}) {
  const user = await getCurrentUser();
  const { next, ref } = await searchParams;
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (user) redirect(target);
  return (
    <AuthForm
      mode="register"
      next={target}
      referral={ref?.trim().toUpperCase()}
      locale={await getLocale()}
    />
  );
}
