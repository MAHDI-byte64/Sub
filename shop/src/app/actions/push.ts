"use server";

import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { pushReady, removeSubscription, saveSubscription } from "@/lib/push";

export type PushState = { error?: string; success?: string };

/** ثبت اشتراک اعلان پوش برای دستگاه فعلی */
export async function savePushAction(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<PushState> {
  const user = await getCurrentUser();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };
  if (!(await pushReady())) return { error: "اعلان پوش در حال حاضر فعال نیست." };
  if (!sub.endpoint || !sub.p256dh || !sub.auth) return { error: "اطلاعات اشتراک ناقص است." };

  const ua = (await headers()).get("user-agent");
  await saveSubscription(user.id, { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, ua);
  return { success: "اعلان روی این دستگاه روشن شد." };
}

/** حذف اشتراک این دستگاه */
export async function removePushAction(endpoint: string): Promise<PushState> {
  const user = await getCurrentUser();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };

  await removeSubscription(endpoint);
  return { success: "اعلان روی این دستگاه خاموش شد." };
}
