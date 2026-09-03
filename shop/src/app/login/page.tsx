import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";

export const metadata = { title: "ورود" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  const { next } = await searchParams;
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (user) redirect(target);
  return <AuthForm mode="login" next={target} locale={await getLocale()} />;
}
