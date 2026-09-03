"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireReseller } from "@/lib/auth";
import {
  renameCustomer,
  resellerCreateService,
  resellerRenewService,
  ResellerError,
} from "@/lib/reseller";
import { rotateService, serviceLinks, syncService } from "@/lib/provision";
import { WalletError } from "@/lib/wallet";

export type ResellerState = { error?: string; success?: string };

function message(err: unknown): string {
  if (err instanceof ResellerError || err instanceof WalletError) return err.message;
  return (err as Error).message || "خطای نامشخص";
}

/** ساخت سرویس تازه برای مشتری نماینده */
export async function sellServiceAction(
  _prev: ResellerState,
  formData: FormData,
): Promise<ResellerState> {
  const user = await requireReseller();

  const planId = String(formData.get("planId") || "");
  const panelId = String(formData.get("panelId") || "") || null;
  const customerName = String(formData.get("customerName") || "");
  if (!planId) return { error: "یک پلن انتخاب کنید." };

  try {
    const service = await resellerCreateService({
      resellerId: user.id,
      planId,
      panelId,
      customerName,
    });
    revalidatePath("/reseller");
    revalidatePath("/reseller/services");
    redirect(`/reseller/services/${service.id}?new=1`);
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;
    return { error: message(err) };
  }
}

/** تمدید سرویس یکی از مشتری‌ها */
export async function renewServiceAction(
  _prev: ResellerState,
  formData: FormData,
): Promise<ResellerState> {
  const user = await requireReseller();

  const serviceId = String(formData.get("serviceId") || "");
  const planId = String(formData.get("planId") || "") || null;

  try {
    await resellerRenewService({ resellerId: user.id, serviceId, planId });
    revalidatePath("/reseller/services");
    revalidatePath(`/reseller/services/${serviceId}`);
    return { success: "سرویس تمدید شد و مبلغ از موجودی شما کم شد." };
  } catch (err) {
    return { error: message(err) };
  }
}

/** تغییر نام مشتری روی یک سرویس */
export async function renameCustomerAction(
  _prev: ResellerState,
  formData: FormData,
): Promise<ResellerState> {
  const user = await requireReseller();
  const serviceId = String(formData.get("serviceId") || "");
  const name = String(formData.get("customerName") || "");

  try {
    await renameCustomer(user.id, serviceId, name);
    revalidatePath("/reseller/services");
    revalidatePath(`/reseller/services/${serviceId}`);
    return { success: "نام مشتری ذخیره شد." };
  } catch (err) {
    return { error: message(err) };
  }
}

/** به‌روزرسانی مصرف یک سرویس از پنل */
export async function refreshServiceAction(
  _prev: ResellerState,
  formData: FormData,
): Promise<ResellerState> {
  const user = await requireReseller();
  const serviceId = String(formData.get("serviceId") || "");

  const service = await db.service.findFirst({ where: { id: serviceId, resellerId: user.id } });
  if (!service) return { error: "این سرویس در فهرست شما نیست." };

  await syncService(service.id, true);
  revalidatePath(`/reseller/services/${serviceId}`);
  revalidatePath("/reseller/services");
  return { success: "مصرف سرویس به‌روزرسانی شد." };
}

/** بازتولید کانفیگ سرویس یک مشتری */
export async function rotateCustomerConfigAction(
  _prev: ResellerState,
  formData: FormData,
): Promise<ResellerState> {
  const user = await requireReseller();
  const serviceId = String(formData.get("serviceId") || "");

  const service = await db.service.findFirst({ where: { id: serviceId, resellerId: user.id } });
  if (!service) return { error: "این سرویس در فهرست شما نیست." };

  try {
    const { failed } = await rotateService(service.id);
    revalidatePath(`/reseller/services/${serviceId}`);
    return {
      success: failed.length
        ? "کانفیگ تازه ساخته شد، اما یکی از سرورها به‌روزرسانی نشد."
        : "کانفیگ تازه ساخته شد؛ لینک قبلی دیگر کار نمی‌کند.",
    };
  } catch (err) {
    return { error: `بازتولید کانفیگ ناموفق بود: ${message(err)}` };
  }
}

/** لینک‌های اتصال یک سرویس (برای دکمهٔ کپی در فهرست) */
export async function serviceLinksAction(serviceId: string): Promise<{
  subscription?: string;
  error?: string;
}> {
  const user = await requireReseller();
  const service = await db.service.findFirst({ where: { id: serviceId, resellerId: user.id } });
  if (!service) return { error: "این سرویس در فهرست شما نیست." };

  const links = await serviceLinks(service.id);
  return { subscription: links.subscription };
}
