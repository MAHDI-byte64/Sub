import "server-only";
import { db } from "./db";
import { fulfillOrder } from "./provision";
import { creditWallet } from "./wallet";
import { notifyUser } from "./notify";
import { notifyAdmin } from "./telegram";
import { payReferralBonus } from "./referral";
import { toman } from "./format";

export type CompleteResult = {
  ok: boolean;
  /** سفارش شارژ کیف پول بوده یا خرید سرویس */
  kind: "plan" | "topup";
  message: string;
};

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
    return { ok: true, kind: order.kind as "plan" | "topup", message: "این سفارش قبلاً تکمیل شده است." };
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

  // خرید یا تمدید سرویس
  await fulfillOrder(order.id);
  await payReferralBonus(order.userId, order.payable);

  if (order.discountId) {
    await db.discount.update({
      where: { id: order.discountId },
      data: { usedCount: { increment: 1 } },
    });
  }

  await notifyUser({
    userId: order.userId,
    kind: "order_approved",
    title: "سرویس شما فعال شد",
    body: `${order.plan?.title ?? "سرویس"} آماده استفاده است.`,
    href: "/dashboard",
  });
  await notifyAdmin(
    `✅ پرداخت آنلاین موفق\nکاربر: ${order.user.email}\nپلن: ${order.plan?.title ?? "—"}\n` +
      `مبلغ: ${toman(order.payable)}\nسفارش: ${order.code}`,
    "order",
  );

  return { ok: true, kind: "plan", message: "پرداخت انجام و سرویس شما تحویل شد." };
}

/** ثبت شکست پرداخت روی سفارش */
export async function failOrder(orderId: string, reason: string): Promise<void> {
  await db.order.update({
    where: { id: orderId },
    data: { status: "failed", adminNote: reason.slice(0, 300) },
  });
}
