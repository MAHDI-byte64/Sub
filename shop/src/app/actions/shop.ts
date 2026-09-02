"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { saveReceipt } from "@/lib/uploads";
import { notifyAdmin } from "@/lib/telegram";
import { asBool, asNum, getSettings } from "@/lib/settings";
import { createTrialService } from "@/lib/provision";
import { toman } from "@/lib/format";

export type ShopState = { error?: string; success?: string };

async function newOrderCode(): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const code = `FD-${randomBytes(4).toString("hex").toUpperCase()}`;
    const exists = await db.order.findUnique({ where: { code } });
    if (!exists) return code;
  }
  throw new Error("تولید کد سفارش ناموفق بود.");
}

/** بررسی و محاسبه کد تخفیف */
export async function resolveDiscount(
  code: string,
  amount: number,
): Promise<{ id: string; amount: number; label: string } | { error: string } | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;

  const discount = await db.discount.findUnique({ where: { code: clean } });
  if (!discount || !discount.isActive) return { error: "کد تخفیف معتبر نیست." };
  if (discount.expiresAt && discount.expiresAt.getTime() < Date.now()) {
    return { error: "مهلت استفاده از این کد تخفیف تمام شده است." };
  }
  if (discount.maxUses > 0 && discount.usedCount >= discount.maxUses) {
    return { error: "ظرفیت استفاده از این کد تخفیف تکمیل شده است." };
  }
  if (discount.minAmount > 0 && amount < discount.minAmount) {
    return { error: `این کد برای سفارش‌های بالای ${toman(discount.minAmount)} است.` };
  }

  const off =
    discount.type === "percent"
      ? Math.floor((amount * discount.value) / 100)
      : Math.min(discount.value, amount);

  return {
    id: discount.id,
    amount: off,
    label: discount.type === "percent" ? `${discount.value}٪ تخفیف` : `${toman(discount.value)} تخفیف`,
  };
}

/** بررسی کد تخفیف در صفحه خرید (بدون ثبت سفارش) */
export async function checkDiscountAction(_prev: ShopState, formData: FormData): Promise<ShopState> {
  const code = String(formData.get("code") || "");
  const amount = Number(formData.get("amount") || 0);
  const result = await resolveDiscount(code, amount);
  if (!result) return { error: "کد تخفیف را وارد کنید." };
  if ("error" in result) return { error: result.error };
  return { success: `${result.label} اعمال شد: ${toman(result.amount)} کمتر می‌پردازید.` };
}

/** ثبت سفارش خرید یا تمدید */
export async function createOrderAction(_prev: ShopState, formData: FormData): Promise<ShopState> {
  const user = await getCurrentUser();
  const planId = String(formData.get("planId") || "");
  if (!user) redirect(`/login?next=${encodeURIComponent(`/checkout?plan=${planId}`)}`);

  const panelId = String(formData.get("panelId") || "") || null;
  const renewServiceId = String(formData.get("renewServiceId") || "") || null;
  const code = String(formData.get("discountCode") || "");

  const plan = await db.plan.findFirst({
    where: { id: planId, isActive: true },
    include: { panels: true },
  });
  if (!plan) return { error: "پلن انتخابی در دسترس نیست." };
  const allowedPanels = plan.panels.map((p) => p.id);

  if (renewServiceId) {
    const service = await db.service.findFirst({ where: { id: renewServiceId, userId: user.id } });
    if (!service) return { error: "سرویس مورد نظر برای تمدید پیدا نشد." };
  }

  if (panelId) {
    const panel = await db.panel.findFirst({ where: { id: panelId, isActive: true } });
    if (!panel) return { error: "سرور انتخابی در دسترس نیست." };
    if (allowedPanels.length && !allowedPanels.includes(panelId)) {
      return { error: "این پلن روی سرور انتخابی ارائه نمی‌شود." };
    }
  }

  let discountId: string | null = null;
  let discountAmount = 0;
  if (code.trim()) {
    const result = await resolveDiscount(code, plan.priceToman);
    if (result && "error" in result) return { error: result.error };
    if (result) {
      discountId = result.id;
      discountAmount = result.amount;
    }
  }

  const orderCode = await newOrderCode();
  await db.order.create({
    data: {
      code: orderCode,
      userId: user.id,
      planId: plan.id,
      panelId,
      renewServiceId,
      amount: plan.priceToman,
      discountId,
      discountAmount,
      payable: Math.max(0, plan.priceToman - discountAmount),
      status: "awaiting_receipt",
    },
  });

  redirect(`/dashboard/orders/${orderCode}`);
}

/** بارگذاری رسید پرداخت */
export async function uploadReceiptAction(_prev: ShopState, formData: FormData): Promise<ShopState> {
  const user = await getCurrentUser();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };

  const code = String(formData.get("code") || "");
  const ref = String(formData.get("ref") || "").trim();
  const file = formData.get("receipt");

  const order = await db.order.findFirst({
    where: { code, userId: user.id },
    include: { plan: true },
  });
  if (!order) return { error: "سفارش پیدا نشد." };
  if (order.status !== "awaiting_receipt" && order.status !== "rejected") {
    return { error: "برای این سفارش امکان ارسال رسید وجود ندارد." };
  }

  // مهلت پرداخت (۰ = بدون محدودیت)
  const settings = await getSettings();
  const expireMinutes = asNum(settings.order_expire_minutes, 0);
  if (
    order.status === "awaiting_receipt" &&
    expireMinutes > 0 &&
    Date.now() - order.createdAt.getTime() > expireMinutes * 60_000
  ) {
    await db.order.update({ where: { id: order.id }, data: { status: "canceled" } });
    return { error: "مهلت پرداخت این سفارش تمام شد. لطفاً سفارش جدیدی ثبت کنید." };
  }
  if (!(file instanceof File)) return { error: "تصویر رسید را انتخاب کنید." };

  const saved = await saveReceipt(file);
  if (!saved.ok) return { error: saved.error };

  await db.order.update({
    where: { id: order.id },
    data: {
      receiptFile: saved.fileName,
      receiptRef: ref || null,
      status: "pending_review",
      paidAt: new Date(),
      adminNote: null,
    },
  });

  await notifyAdmin(
    [
      "🧾 <b>رسید پرداخت جدید</b>",
      `کد سفارش: <code>${order.code}</code>`,
      `کاربر: ${user.email}`,
      `پلن: ${order.plan.title}`,
      `مبلغ: ${toman(order.payable)}`,
      ref ? `کد پیگیری: ${ref}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    "order",
  );

  revalidatePath(`/dashboard/orders/${code}`);
  return { success: "رسید شما ثبت شد. سفارش در صف بررسی قرار گرفت." };
}

export async function cancelOrderAction(_prev: ShopState, formData: FormData): Promise<ShopState> {
  const user = await getCurrentUser();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };
  const code = String(formData.get("code") || "");

  const order = await db.order.findFirst({ where: { code, userId: user.id } });
  if (!order) return { error: "سفارش پیدا نشد." };
  if (order.status === "approved") return { error: "سفارش تأییدشده قابل لغو نیست." };

  await db.order.update({ where: { id: order.id }, data: { status: "canceled" } });
  revalidatePath("/dashboard/orders");
  return { success: "سفارش لغو شد." };
}

/** درخواست اکانت تست رایگان */
export async function requestTrialAction(_prev: ShopState, formData: FormData): Promise<ShopState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fdashboard");

  const settings = await getSettings();
  if (!asBool(settings.trial_enabled)) return { error: "دریافت اکانت تست در حال حاضر غیرفعال است." };
  if (user.trialUsedAt) return { error: "شما قبلاً اکانت تست دریافت کرده‌اید." };

  const panelId = String(formData.get("panelId") || "") || null;
  try {
    await createTrialService(user.id, panelId);
  } catch (err) {
    return { error: (err as Error).message || "ساخت اکانت تست ناموفق بود." };
  }

  await notifyAdmin(`🎁 اکانت تست رایگان برای ${user.email} ساخته شد.`, "system");
  revalidatePath("/dashboard");
  return { success: "اکانت تست شما ساخته شد. در بخش سرویس‌ها آن را ببینید." };
}
