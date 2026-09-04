import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { asBool, getSettings } from "@/lib/settings";
import { mailReady } from "@/lib/mail";
import ForgotForm from "@/components/ForgotForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "بازیابی رمز عبور" };

export default async function ForgotPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard/profile");

  const settings = await getSettings();
  if (!asBool(settings.reset_enabled) || !mailReady(settings)) redirect("/login");

  return <ForgotForm locale={await getLocale()} />;
}
