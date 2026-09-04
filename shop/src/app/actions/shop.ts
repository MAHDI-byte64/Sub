"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { saveReceipt } from "@/lib/uploads";
import { notifyAdmin } from "@/lib/telegram";
import { asBool, asNum, getSettings } from "@/lib/settings";
import { checkCustom, customPrice, customRates, ratesReady } from "@/lib/pricing";
import { createTrialService, fulfillOrder, rotateCooldownLeft, rotateService } from "@/lib/provision";
import { availableMethods, pickWallet, quoteCrypto } from "@/lib/payments";
import { creditWallet, debitWallet } from "@/lib/wallet";
import { notifyUser } from "@/lib/notify";
import { orderTitle } from "@/lib/orders";
import { payReferralBonus } from "@/lib/referral";
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

/**
 * سبد خرید یک سفارش: یا یک پلن آماده است یا حجم اضافه روی یک سرویس فعال.
 * مسیر پرداخت هر دو یکی است، پس فقط همین چند فیلد فرق می‌کند.
 */
type OrderItem = {
  kind: "plan" | "addon";
  title: string;
  amount: number;
  planId: string | null;
  panelId: string | null;
  renewServiceId: string | null;
  addonGb: number;
  addonDays: number;
};

/** خواندن و اعتبارسنجی سفارش «حجم اضافه» از روی فرم */
async function addonItem(
  userId: string,
  serviceId: string,
  gbInput: string,
): Promise<OrderItem | { error: string }> {
  const settings = await getSettings();
  const rates = customRates(settings);
  if (!rates.addonEnabled) return { error: "خرید حجم اضافه در حال حاضر فعال نیست." };
  if (!ratesReady(rates)) {
    return { error: "قیمت حجم اضافه هنوز تنظیم نشده است. با پشتیبانی تماس بگیرید." };
  }

  const service = await db.service.findFirst({
    where: { id: serviceId, userId, resellerId: null },
    include: { plan: true },
  });
  if (!service) return { error: "سرویس مورد نظر پیدا نشد." };
  if (service.totalBytes <= 0) return { error: "این سرویس حجم نامحدود دارد و نیازی به حجم اضافه ندارد." };
  if (service.status === "expired") {
    return { error: "این سرویس منقضی شده است؛ ابتدا آن را تمدید کنید." };
  }

  const checked = checkCustom(rates, { gb: gbInput }, "addon");
  if (!checked.ok) return { error: checked.error };

  return {
    kind: "addon",
    title: `حجم اضافه (${checked.gb} گیگابایت)`,
    amount: customPrice(rates, checked.gb, 0),
    planId: null,
    panelId: null,
    renewServiceId: service.id,
    addonGb: checked.gb,
    addonDays: 0,
  };
}

/** ثبت سفارش خرید، تمدید یا حجم اضافه */
export async function createOrderAction(_prev: ShopState, formData: FormData): Promise<ShopState> {
  const user = await getCurrentUser();
  const planId = String(formData.get("planId") || "");
  const addonServiceId = String(formData.get("addonServiceId") || "");
  const addonGb = String(formData.get("addonGb") || "");

  if (!user) {
    const next = addonServiceId
      ? `/checkout?service=${addonServiceId}&gb=${addonGb}`
      : `/checkout?plan=${planId}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const panelId = String(formData.get("panelId") || "") || null;
  const renewServiceId = String(formData.get("renewServiceId") || "") || null;
  const code = String(formData.get("discountCode") || "");

  let item: OrderItem;

  if (addonServiceId) {
    const built = await addonItem(user.id, addonServiceId, addonGb);
    if ("error" in built) return { error: built.error };
    item = built;
  } else {
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

    item = {
      kind: "plan",
      title: plan.title,
      amount: plan.priceToman,
      planId: plan.id,
      panelId,
      renewServiceId,
      addonGb: 0,
      addonDays: 0,
    };
  }

  let discountId: string | null = null;
  let discountAmount = 0;
  if (code.trim()) {
    const result = await resolveDiscount(code, item.amount);
    if (result && "error" in result) return { error: result.error };
    if (result) {
      discountId = result.id;
      discountAmount = result.amount;
    }
  }

  const payable = Math.max(0, item.amount - discountAmount);
  const settings = await getSettings();
  const method = String(formData.get("payMethod") || "");
  const methods = await availableMethods(payable);

  const useWallet = method === "wallet";
  const useCrypto = method === "crypto";
  const gatewayChoice = method.startsWith("online:") ? method.slice("online:".length) : null;

  if (useWallet && !methods.wallet) return { error: "پرداخت از کیف پول فعال نیست." };
  if (useCrypto && !methods.crypto) {
    return { error: "پرداخت با ارز دیجیتال در حال حاضر فعال نیست." };
  }
  if (gatewayChoice && !methods.gateways.some((g) => g.id === gatewayChoice)) {
    return { error: "این درگاه پرداخت در دسترس نیست. روش دیگری انتخاب کنید." };
  }
  if (!useWallet && !useCrypto && !gatewayChoice && !methods.card) {
    return { error: "پرداخت کارت‌به‌کارت فعال نیست. یکی از روش‌های دیگر را انتخاب کنید." };
  }

  // پرداخت تتری: مبلغ و نرخ همان لحظه قفل می‌شوند تا نوسان قیمت مشکلی نسازد
  const crypto = useCrypto ? await quoteCrypto(payable) : null;
  const wallet = useCrypto ? await pickWallet() : null;
  if (useCrypto && (!crypto?.amount || !wallet)) {
    return { error: "آدرس کیف پول ارز دیجیتال تنظیم نشده است. با پشتیبانی تماس بگیرید." };
  }

  const orderCode = await newOrderCode();
  const order = await db.order.create({
    data: {
      code: orderCode,
      userId: user.id,
      kind: item.kind,
      payMethod: useWallet ? "wallet" : gatewayChoice ? "online" : useCrypto ? "crypto" : "card",
      gatewayId: gatewayChoice,
      planId: item.planId,
      panelId: item.panelId,
      renewServiceId: item.renewServiceId,
      addonGb: item.addonGb,
      addonDays: item.addonDays,
      amount: item.amount,
      discountId,
      discountAmount,
      payable,
      status: gatewayChoice ? "awaiting_payment" : "awaiting_receipt",
      ...(useCrypto && crypto && wallet
        ? {
            cryptoAmount: crypto.amount,
            cryptoRate: crypto.rate,
            cryptoAddress: wallet.address,
            cryptoNetwork: `${wallet.symbol}-${wallet.network.toUpperCase()}`,
          }
        : {}),
    },
  });

  // پرداخت با درگاه: کاربر مستقیم به صفحهٔ بانک می‌رود
  if (gatewayChoice) redirect(`/pay/${orderCode}`);

  // پرداخت آنی از کیف پول: بدون رسید و بدون انتظار
  if (useWallet && asBool(settings.wallet_enabled)) {
    const wallet = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (wallet.balance < payable) {
      await db.order.update({ where: { id: order.id }, data: { status: "canceled" } });
      return { error: "موجودی کیف پول کافی نیست. ابتدا حساب خود را شارژ کنید." };
    }

    try {
      await debitWallet(
        user.id,
        payable,
        item.kind === "addon" ? "addon" : item.renewServiceId ? "renew" : "purchase",
        item.title,
        order.id,
      );
      await db.order.update({
        where: { id: order.id },
        data: { status: "pending_review", paidAt: new Date() },
      });
      await fulfillOrder(order.id);
      if (discountId) {
        await db.discount.update({ where: { id: discountId }, data: { usedCount: { increment: 1 } } });
      }
      await payReferralBonus(user.id, payable);
      await notifyUser({
        userId: user.id,
        kind: "order_approved",
        title: item.kind === "addon" ? "حجم اضافه روی سرویس شما نشست" : "سرویس شما آماده است",
        body:
          item.kind === "addon"
            ? `${item.title} به سرویس شما اضافه شد؛ تاریخ انقضا تغییری نکرده است.`
            : `${item.title} با پرداخت از کیف پول فعال شد.`,
        href: item.kind === "addon" ? `/dashboard/services/${item.renewServiceId}` : "/dashboard",
      });
      await notifyAdmin(
        `💰 خرید آنی از کیف پول\nکاربر: ${user.email}\n${item.kind === "addon" ? "حجم اضافه" : "پلن"}: ${item.title}\nمبلغ: ${toman(payable)}`,
        "order",
      );
    } catch (err) {
      // در صورت خطا مبلغ برمی‌گردد تا کاربر ضرر نکند
      await creditWallet(user.id, payable, "refund", `بازگشت وجه سفارش ${orderCode}`, order.id).catch(() => null);
      await db.order.update({
        where: { id: order.id },
        data: { status: "failed", adminNote: (err as Error).message.slice(0, 300) },
      });
      return {
        error: `تحویل سرویس ناموفق بود و مبلغ به کیف پول شما برگشت. لطفاً با پشتیبانی تماس بگیرید. (${(err as Error).message})`,
      };
    }

    if (item.kind === "addon") redirect(`/dashboard/services/${item.renewServiceId}?paid=${orderCode}`);
    redirect(`/dashboard?paid=${orderCode}`);
  }

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
      `مورد: ${orderTitle("fa", order)}`,
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

  let service;
  try {
    service = await createTrialService(user.id, panelId);
  } catch (err) {
    return { error: (err as Error).message || "ساخت اکانت تست ناموفق بود." };
  }

  await notifyAdmin(`🎁 اکانت تست رایگان برای ${user.email} ساخته شد.`, "system");
  revalidatePath("/dashboard");
  // بعد از ساخت، کارت تست از پنل برداشته می‌شود؛ پس کاربر را مستقیم به همان
  // سرویس می‌بریم تا کانفیگ و QR را ببیند، نه اینکه بی‌پیام روی داشبورد بماند.
  redirect(`/dashboard/services/${service.id}`);
}

/* ---------------------------- کیف پول و دعوت ---------------------------- */

/** ثبت سفارش شارژ کیف پول (کارت‌به‌کارت) */
export async function createTopupAction(_prev: ShopState, formData: FormData): Promise<ShopState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fdashboard%2Fwallet");

  const settings = await getSettings();
  if (!asBool(settings.wallet_enabled)) return { error: "کیف پول در حال حاضر غیرفعال است." };

  const amount = Number(formData.get("amount") || 0);
  const min = asNum(settings.min_topup, 50_000);
  if (!Number.isFinite(amount) || amount < min) {
    return { error: `حداقل مبلغ شارژ ${toman(min)} است.` };
  }

  const method = String(formData.get("payMethod") || "");
  const methods = await availableMethods(Math.round(amount));
  const useCrypto = method === "crypto";
  const gatewayChoice = method.startsWith("online:") ? method.slice("online:".length) : null;

  if (gatewayChoice && !methods.gateways.some((g) => g.id === gatewayChoice)) {
    return { error: "این درگاه پرداخت در دسترس نیست." };
  }
  if (useCrypto && !methods.crypto) return { error: "پرداخت با ارز دیجیتال فعال نیست." };
  if (!gatewayChoice && !useCrypto && !methods.card) {
    return { error: "برای شارژ، یکی از روش‌های پرداخت فعال را انتخاب کنید." };
  }

  const crypto = useCrypto ? await quoteCrypto(Math.round(amount)) : null;
  const wallet = useCrypto ? await pickWallet() : null;
  if (useCrypto && (!crypto?.amount || !wallet)) {
    return { error: "آدرس کیف پول ارز دیجیتال تنظیم نشده است." };
  }

  const code = await newOrderCode();
  await db.order.create({
    data: {
      code,
      userId: user.id,
      kind: "topup",
      payMethod: gatewayChoice ? "online" : useCrypto ? "crypto" : "card",
      gatewayId: gatewayChoice,
      amount: Math.round(amount),
      payable: Math.round(amount),
      status: gatewayChoice ? "awaiting_payment" : "awaiting_receipt",
      ...(useCrypto && crypto && wallet
        ? {
            cryptoAmount: crypto.amount,
            cryptoRate: crypto.rate,
            cryptoAddress: wallet.address,
            cryptoNetwork: `${wallet.symbol}-${wallet.network.toUpperCase()}`,
          }
        : {}),
    },
  });

  redirect(gatewayChoice ? `/pay/${code}` : `/dashboard/orders/${code}`);
}

/** ثبت هش تراکنش ارز دیجیتال توسط مشتری */
export async function submitTxHashAction(_prev: ShopState, formData: FormData): Promise<ShopState> {
  const user = await getCurrentUser();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };

  const code = String(formData.get("code") || "");
  const hash = String(formData.get("txHash") || "").trim();

  const order = await db.order.findFirst({ where: { code, userId: user.id } });
  if (!order) return { error: "سفارش پیدا نشد." };
  if (order.payMethod !== "crypto") return { error: "این سفارش پرداخت ارز دیجیتال نیست." };
  if (order.status === "approved") return { error: "این سفارش قبلاً تکمیل شده است." };
  if (hash.length < 20 || /\s/.test(hash)) {
    return { error: "هش تراکنش معتبر نیست. کد TXID را کامل و بدون فاصله وارد کنید." };
  }

  const duplicate = await db.order.findFirst({
    where: { cryptoTxHash: hash, NOT: { id: order.id } },
  });
  if (duplicate) return { error: "این هش تراکنش قبلاً برای سفارش دیگری ثبت شده است." };

  await db.order.update({
    where: { id: order.id },
    data: { cryptoTxHash: hash, status: "pending_review", paidAt: new Date() },
  });

  await notifyAdmin(
    `🪙 پرداخت تتری در انتظار بررسی\nسفارش: ${order.code}\nکاربر: ${user.email}\n` +
      `مبلغ: ${toman(order.payable)} (${order.cryptoAmount ?? 0} USDT)\nهش: ${hash}`,
    "order",
  );
  revalidatePath(`/dashboard/orders/${code}`);
  return { success: "هش تراکنش ثبت شد. بعد از بررسی، سرویس شما تحویل داده می‌شود." };
}

/** روشن/خاموش کردن تمدید خودکار یک سرویس */
export async function toggleAutoRenewAction(_prev: ShopState, formData: FormData): Promise<ShopState> {
  const user = await getCurrentUser();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };

  const settings = await getSettings();
  if (!asBool(settings.auto_renew_enabled)) return { error: "تمدید خودکار غیرفعال است." };

  const id = String(formData.get("serviceId") || "");
  const service = await db.service.findFirst({ where: { id, userId: user.id } });
  if (!service) return { error: "سرویس پیدا نشد." };
  if (!service.planId) return { error: "این سرویس پلن مشخصی ندارد و قابل تمدید خودکار نیست." };

  await db.service.update({ where: { id: service.id }, data: { autoRenew: !service.autoRenew } });
  revalidatePath("/dashboard");
  return {
    success: service.autoRenew
      ? "تمدید خودکار خاموش شد."
      : "تمدید خودکار روشن شد؛ در زمان انقضا از کیف پول تمدید می‌شود.",
  };
}

/**
 * بازتولید کانفیگ سرویس: UUID و لینک اشتراک عوض می‌شوند تا هر دستگاهی که
 * کانفیگ قدیمی را دارد قطع شود. حجم، اعتبار و مصرف دست‌نخورده می‌مانند.
 */
export async function rotateServiceAction(_prev: ShopState, formData: FormData): Promise<ShopState> {
  const user = await getCurrentUser();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };

  const settings = await getSettings();
  if (!asBool(settings.rotate_enabled)) {
    return { error: "بازتولید کانفیگ در حال حاضر غیرفعال است. با پشتیبانی تماس بگیرید." };
  }

  const id = String(formData.get("serviceId") || "");
  const service = await db.service.findFirst({ where: { id, userId: user.id } });
  if (!service) return { error: "سرویس پیدا نشد." };
  if (service.status === "expired") {
    return { error: "این سرویس منقضی شده است؛ ابتدا آن را تمدید کنید." };
  }

  const cooldownMs = Math.max(0, asNum(settings.rotate_cooldown_minutes, 30)) * 60_000;
  const waitMs = rotateCooldownLeft(service, cooldownMs);
  if (waitMs > 0) {
    const minutes = Math.max(1, Math.ceil(waitMs / 60_000));
    return {
      error: `به‌تازگی کانفیگ این سرویس بازتولید شده است. ${minutes} دقیقه دیگر دوباره امتحان کنید.`,
    };
  }

  try {
    const { failed } = await rotateService(service.id);
    await notifyUser({
      userId: user.id,
      kind: "rotated",
      title: "کانفیگ سرویس بازتولید شد",
      body: "لینک اشتراک و شناسه اتصال عوض شد. لینک تازه را در برنامه جایگزین کنید؛ دستگاه‌های قبلی دیگر وصل نمی‌شوند.",
      href: `/dashboard/services/${service.id}`,
      serviceId: service.id,
    });
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/services/${service.id}`);

    if (failed.length) {
      return {
        success:
          "کانفیگ بازتولید شد، اما یکی از سرورها به‌روزرسانی نشد. اگر بخشی از کانفیگ‌ها کار نکرد، به پشتیبانی اطلاع دهید.",
      };
    }
    return {
      success: "کانفیگ تازه ساخته شد. لینک اشتراک جدید را در برنامه جایگزین کنید؛ لینک قبلی دیگر کار نمی‌کند.",
    };
  } catch (err) {
    return { error: `بازتولید کانفیگ ناموفق بود: ${(err as Error).message}` };
  }
}

/** خوانده‌شدن همه اعلان‌ها */
export async function markNotificationsReadAction(
  _prev?: ShopState,
  _formData?: FormData,
): Promise<ShopState> {
  const user = await getCurrentUser();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };

  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard/notifications");
  revalidatePath("/", "layout");
  return { success: "همه اعلان‌ها خوانده شد." };
}
