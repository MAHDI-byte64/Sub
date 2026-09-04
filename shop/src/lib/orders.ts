import "server-only";
import { db } from "./db";
import { fulfillOrder } from "./provision";
import { creditWallet } from "./wallet";
import { notifyUser } from "./notify";
import { notifyAdmin } from "./telegram";
import { payReferralBonus } from "./referral";
import { fmt, toman } from "./format";
import { t, type Locale } from "./i18n";

export type CompleteResult = {
  ok: boolean;
  /** خرید سرویس، شارژ کیف پول یا خرید حجم اضافه */
  kind: "plan" | "topup" | "addon";
  message: string;
};

/** عنوان خواندنی یک سفارش (پلن، شارژ کیف پول یا حجم اضافه) */
export function orderTitle(
  locale: Locale,
  order: { kind: string; addonGb: number; plan?: { title: string } | null },
): string {
  if (order.plan?.title) return order.plan.title;
  if (order.kind === "addon") {
    return t(locale, "order.addonTitle", { gb: fmt(locale).num(order.addonGb) });
  }
  return t(locale, "order.topup");
}

/**
 * کارِ بعد از «پول رسید»: تحویل سرویس یا شارژ کیف پول، مصرف کد تخفیف،
 * پاداش دعوت، اعلان کاربر و اطلاع به مدیر.
 *
 * از هر مسیری که پول واقعاً دریافت شده باشد (درگاه آنلاین، تأیید رسید توسط
 * مدیر) قابل فراخوانی است و اگر سفارش قبلاً تحویل شده باشد، دوباره تحویل نمی‌دهد.
 */
export async function completePaidOrder(
  orderId: string,
  payment?: { gateway?: string; ref?: string; bankRef?: string },
): Promise<CompleteResult> {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { user: true, plan: true },
  });

  if (order.status === "approved") {
    return {
      ok: true,
      kind: order.kind as CompleteResult["kind"],
      message: "این سفارش قبلاً تکمیل شده است.",
    };
  }

  await db.order.update({
    where: { id: order.id },
    data: {
      paidAt: order.paidAt ?? new Date(),
      ...(payment?.gateway ? { gateway: payment.gateway } : {}),
      ...(payment?.ref ? { gatewayRef: payment.ref } : {}),
      ...(payment?.bankRef ? { bankRef: payment.bankRef } : {}),
    },
  });

  // شارژ کیف پول
  if (order.kind === "topup") {
    await creditWallet(order.userId, order.payable, "topup", `شارژ با سفارش ${order.code}`, order.id);
    await db.order.update({
      where: { id: order.id },
      data: { status: "approved", reviewedAt: new Date() },
    });
    await notifyUser({
      userId: order.userId,
      kind: "wallet_credit",
      title: "کیف پول شما شارژ شد",
      body: `${toman(order.payable)} به موجودی شما اضافه شد.`,
      href: "/dashboard/wallet",
    });
    await notifyAdmin(
      `💳 شارژ آنلاین کیف پول\nکاربر: ${order.user.email}\nمبلغ: ${toman(order.payable)}\nسفارش: ${order.code}`,
      "order",
    );
    return { ok: true, kind: "topup", message: `کیف پول شما ${toman(order.payable)} شارژ شد.` };
  }

  // خرید یا تمدید سرویس (و خرید حجم اضافه، که همان مسیر تحویل را دارد)
  await fulfillOrder(order.id);
  await payReferralBonus(order.userId, order.payable);

  if (order.discountId) {
    await db.discount.update({
      where: { id: order.discountId },
      data: { usedCount: { increment: 1 } },
    });
  }

  const isAddon = order.kind === "addon";
  const title = orderTitle("fa", order);

  await notifyUser({
    userId: order.userId,
    kind: "order_approved",
    title: isAddon ? "حجم اضافه روی سرویس شما نشست" : "سرویس شما فعال شد",
    body: isAddon
      ? `${title} به سرویس شما اضافه شد؛ تاریخ انقضا تغییری نکرده است.`
      : `${title} آماده استفاده است.`,
    href: isAddon && order.renewServiceId ? `/dashboard/services/${order.renewServiceId}` : "/dashboard",
    ...(isAddon && order.renewServiceId ? { serviceId: order.renewServiceId } : {}),
  });
  await notifyAdmin(
    `✅ پرداخت آنلاین موفق\nکاربر: ${order.user.email}\n${isAddon ? "حجم اضافه" : "پلن"}: ${title}\n` +
      `مبلغ: ${toman(order.payable)}\nسفارش: ${order.code}`,
    "order",
  );

  return {
    ok: true,
    kind: isAddon ? "addon" : "plan",
    message: isAddon
      ? "پرداخت انجام و حجم اضافه روی سرویس شما اعمال شد."
      : "پرداخت انجام و سرویس شما تحویل شد.",
  };
}

/** ثبت شکست پرداخت روی سفارش */
export async function failOrder(orderId: string, reason: string): Promise<void> {
  await db.order.update({
    where: { id: orderId },
    data: { status: "failed", adminNote: reason.slice(0, 300) },
  });
}
