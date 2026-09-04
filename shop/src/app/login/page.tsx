import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { asBool, getSettings } from "@/lib/settings";
import { mailReady } from "@/lib/mail";

export const metadata = { title: "ورود" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const user = await getCurrentUser();
  const { next, reset } = await searchParams;
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (user) redirect(target);

  const settings = await getSettings();

  return (
    <AuthForm
      mode="login"
      next={target}
      locale={await getLocale()}
      resetDone={reset === "1"}
      canReset={asBool(settings.reset_enabled) && mailReady(settings)}
    />
  );
}
