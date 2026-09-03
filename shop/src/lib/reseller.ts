import "server-only";
import { randomBytes } from "node:crypto";
import type { Plan, Service } from "@prisma/client";
import { db } from "./db";
import { getSettings } from "./settings";
import { createServiceOnPanel, pickPanel, renewServiceOnPanel } from "./provision";
import { debitWallet, WalletError } from "./wallet";
import { toman } from "./format";
import { notifyAdmin } from "./telegram";

/**
 * نمایندگی: خرید با قیمت عمده از کیف پول.
 *
 * نماینده پنل جدا دارد ولی همان حساب کاربری عادی‌اش را هم نگه می‌دارد؛ سرویس‌هایی
 * که از پنل نمایندگی می‌سازد با `resellerId` علامت می‌خورند تا در پنل شخصی‌اش
 * قاطی سرویس‌های خودش نشوند.
 */

export class ResellerError extends Error {}

/** قیمت یک پلن برای نمایندهٔ مشخص (بعد از تخفیف) */
export function resellerPrice(price: number, discountPercent: number): number {
  const off = Math.min(90, Math.max(0, Math.round(discountPercent)));
  return Math.max(0, Math.round((price * (100 - off)) / 100));
}

export type ResellerProfile = {
  id: string;
  email: string;
  name: string | null;
  resellerName: string | null;
  discount: number;
  balance: number;
};

export async function resellerProfile(userId: string): Promise<ResellerProfile> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    resellerName: user.resellerName,
    discount: user.resellerOff,
    balance: user.balance,
  };
}

/** پلن‌های قابل فروش برای نماینده، با قیمت عمده */
export async function resellerPlans(discount: number) {
  const plans = await db.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: { panels: { select: { id: true, flag: true, location: true } } },
  });
  return plans.map((plan) => ({
    ...plan,
    listPrice: plan.priceToman,
    price: resellerPrice(plan.priceToman, discount),
    saving: plan.priceToman - resellerPrice(plan.priceToman, discount),
  }));
}

/** سرویس‌هایی که این نماینده ساخته است */
export async function resellerServices(resellerId: string, search = "") {
  const clean = search.trim();
  return db.service.findMany({
    where: {
      resellerId,
      ...(clean
        ? {
            OR: [
              { customerName: { contains: clean } },
              { clientEmail: { contains: clean } },
              { remark: { contains: clean } },
            ],
          }
        : {}),
    },
    include: { panel: true, plan: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

export type ResellerStats = {
  services: number;
  active: number;
  expired: number;
  expiringSoon: number;
  spent: number;
  usedBytes: number;
};

export async function resellerStats(resellerId: string): Promise<ResellerStats> {
  const [services, spent] = await Promise.all([
    db.service.findMany({
      where: { resellerId },
      select: { status: true, expiresAt: true, usedBytes: true },
    }),
    db.walletTx.aggregate({
      where: { userId: resellerId, kind: { in: ["reseller_sale", "reseller_renew"] } },
      _sum: { amount: true },
    }),
  ]);

  const soon = Date.now() + 3 * 86_400_000;
  return {
    services: services.length,
    active: services.filter((s) => s.status === "active").length,
    expired: services.filter((s) => s.status === "expired").length,
    expiringSoon: services.filter(
      (s) => s.status === "active" && s.expiresAt && s.expiresAt.getTime() < soon,
    ).length,
    spent: Math.abs(spent._sum.amount ?? 0),
    usedBytes: services.reduce((sum, s) => sum + s.usedBytes, 0),
  };
}

/** ساخت سرویس تازه توسط نماینده؛ مبلغ فوری از کیف پول کم می‌شود */
export async function resellerCreateService(input: {
  resellerId: string;
  planId: string;
  panelId?: string | null;
  customerName: string;
}): Promise<Service> {
  const reseller = await db.user.findUniqueOrThrow({ where: { id: input.resellerId } });
  if (!reseller.isReseller) throw new ResellerError("این حساب نمایندگی فعال ندارد.");

  const plan = await db.plan.findFirst({
    where: { id: input.planId, isActive: true },
    include: { panels: true },
  });
  if (!plan) throw new ResellerError("پلن انتخابی در دسترس نیست.");

  const price = resellerPrice(plan.priceToman, reseller.resellerOff);
  if (reseller.balance < price) {
    throw new ResellerError(
      `موجودی کافی نیست. قیمت این پلن برای شما ${toman(price)} است و موجودی شما ${toman(reseller.balance)}.`,
    );
  }

  const panel = await pickPanel(
    input.panelId ?? null,
    plan.panels.map((p) => p.id),
  );
  const settings = await getSettings();
  const customer = input.customerName.trim().slice(0, 60);

  // اول پول کم می‌شود تا دو درخواست هم‌زمان نتوانند از یک موجودی دو سرویس بسازند
  await debitWallet(
    reseller.id,
    price,
    "reseller_sale",
    `${plan.title}${customer ? ` — ${customer}` : ""}`,
  );

  try {
    const service = await createServiceOnPanel({
      userId: reseller.id,
      userEmail: reseller.email,
      plan,
      planId: plan.id,
      panel,
      code: `rs-${randomBytes(3).toString("hex")}`,
      remark: `${settings.site_name} | ${plan.title}${customer ? ` | ${customer}` : ""}`,
    });

    const tagged = await db.service.update({
      where: { id: service.id },
      data: { resellerId: reseller.id, customerName: customer || null },
    });

    await notifyAdmin(
      `🤝 فروش نمایندگی\nنماینده: ${reseller.resellerName || reseller.email}\n` +
        `پلن: ${plan.title}\nمشتری: ${customer || "—"}\nمبلغ: ${toman(price)}`,
      "order",
    );
    return tagged;
  } catch (err) {
    // ساخت روی پنل شکست خورد؛ پول برمی‌گردد
    await db.user
      .update({ where: { id: reseller.id }, data: { balance: { increment: price } } })
      .catch(() => null);
    await db.walletTx
      .create({
        data: {
          userId: reseller.id,
          amount: price,
          kind: "refund",
          note: `بازگشت وجه: ساخت سرویس ناموفق بود (${plan.title})`,
        },
      })
      .catch(() => null);
    throw err;
  }
}

/** تمدید سرویس یک مشتریِ نماینده با قیمت عمده */
export async function resellerRenewService(input: {
  resellerId: string;
  serviceId: string;
  planId?: string | null;
}): Promise<Service> {
  const reseller = await db.user.findUniqueOrThrow({ where: { id: input.resellerId } });
  const service = await db.service.findFirst({
    where: { id: input.serviceId, resellerId: reseller.id },
  });
  if (!service) throw new ResellerError("این سرویس در فهرست شما نیست.");

  const plan: Plan | null = await db.plan.findFirst({
    where: { id: input.planId || service.planId || "", isActive: true },
  });
  if (!plan) throw new ResellerError("پلن تمدید مشخص نیست؛ یک پلن انتخاب کنید.");

  const price = resellerPrice(plan.priceToman, reseller.resellerOff);
  if (reseller.balance < price) {
    throw new ResellerError(`موجودی کافی نیست؛ برای تمدید ${toman(price)} لازم است.`);
  }

  await debitWallet(
    reseller.id,
    price,
    "reseller_renew",
    `تمدید ${plan.title}${service.customerName ? ` — ${service.customerName}` : ""}`,
  );

  try {
    return await renewServiceOnPanel(service, plan);
  } catch (err) {
    await db.user
      .update({ where: { id: reseller.id }, data: { balance: { increment: price } } })
      .catch(() => null);
    await db.walletTx
      .create({
        data: {
          userId: reseller.id,
          amount: price,
          kind: "refund",
          note: `بازگشت وجه: تمدید ناموفق بود (${plan.title})`,
        },
      })
      .catch(() => null);
    throw err;
  }
}

/** تغییر نام مشتری روی یک سرویس */
export async function renameCustomer(
  resellerId: string,
  serviceId: string,
  name: string,
): Promise<void> {
  const service = await db.service.findFirst({ where: { id: serviceId, resellerId } });
  if (!service) throw new ResellerError("این سرویس در فهرست شما نیست.");
  await db.service.update({
    where: { id: service.id },
    data: { customerName: name.trim().slice(0, 60) || null },
  });
}

export { WalletError };
