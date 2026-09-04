import "server-only";
import { randomBytes } from "node:crypto";
import type { Plan, Service } from "@prisma/client";
import { db } from "./db";
import { getSettings } from "./settings";
import { checkCustom, customPrice, customRates, ratesReady, type CustomRates } from "./pricing";
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

/**
 * چه چیزی به نماینده نشان داده شود.
 *
 * مدیر می‌تواند پلن‌های آماده را برای نماینده‌ها خاموش کند (تا فقط دلخواه
 * بفروشند) یا برعکس، فروش دلخواه را ببندد.
 */
export type ResellerOptions = {
  rates: CustomRates;
  showPlans: boolean;
  showCustom: boolean;
};

export async function resellerOptions(): Promise<ResellerOptions> {
  const rates = customRates(await getSettings());
  return {
    rates,
    showPlans: rates.resellerPlans,
    showCustom: rates.resellerCustom && ratesReady(rates),
  };
}

/** قیمت یک ترکیب حجم/زمان دلخواه برای نمایندهٔ مشخص */
export function customQuote(
  rates: CustomRates,
  gb: number,
  days: number,
  discountPercent: number,
): { listPrice: number; price: number; saving: number } {
  const listPrice = customPrice(rates, gb, days);
  const price = resellerPrice(listPrice, discountPercent);
  return { listPrice, price, saving: listPrice - price };
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

/**
 * کسر مبلغ از اعتبار نماینده، اجرای کار روی پنل و برگرداندن پول اگر کار
 * شکست بخورد. اول پول کم می‌شود تا دو درخواست هم‌زمان نتوانند از یک موجودی
 * دو سرویس بسازند.
 */
async function spendCredit<T>(
  resellerId: string,
  price: number,
  kind: "reseller_sale" | "reseller_renew",
  note: string,
  refundNote: string,
  run: () => Promise<T>,
): Promise<T> {
  await debitWallet(resellerId, price, kind, note);
  try {
    return await run();
  } catch (err) {
    await db.user
      .update({ where: { id: resellerId }, data: { balance: { increment: price } } })
      .catch(() => null);
    await db.walletTx
      .create({ data: { userId: resellerId, amount: price, kind: "refund", note: refundNote } })
      .catch(() => null);
    throw err;
  }
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

  const options = await resellerOptions();
  if (!options.showPlans) {
    throw new ResellerError("فروش با پلن آماده غیرفعال است؛ از فروش با حجم دلخواه استفاده کنید.");
  }

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

  return spendCredit(
    reseller.id,
    price,
    "reseller_sale",
    `${plan.title}${customer ? ` — ${customer}` : ""}`,
    `بازگشت وجه: ساخت سرویس ناموفق بود (${plan.title})`,
    async () => {
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
    },
  );
}

/**
 * فروش با حجم و زمان دلخواه.
 *
 * نماینده خودش گیگابایت و تعداد روز را می‌گذارد و قیمت از نرخ‌های تنظیمات
 * (قیمت هر گیگ + قیمت هر روز) با تخفیف نمایندگی حساب می‌شود. سرویس ساخته‌شده
 * پلن ندارد، پس تمدیدش هم دلخواه انجام می‌شود.
 */
export async function resellerCreateCustomService(input: {
  resellerId: string;
  gb: number;
  days: number;
  panelId?: string | null;
  customerName: string;
}): Promise<Service> {
  const reseller = await db.user.findUniqueOrThrow({ where: { id: input.resellerId } });
  if (!reseller.isReseller) throw new ResellerError("این حساب نمایندگی فعال ندارد.");

  const options = await resellerOptions();
  if (!options.showCustom) throw new ResellerError("فروش با حجم دلخواه در حال حاضر فعال نیست.");

  const checked = checkCustom(options.rates, { gb: input.gb, days: input.days });
  if (!checked.ok) throw new ResellerError(checked.error);

  const { price } = customQuote(options.rates, checked.gb, checked.days, reseller.resellerOff);
  if (price <= 0) throw new ResellerError("قیمت این سفارش صفر شد؛ نرخ‌ها را با پشتیبانی بررسی کنید.");
  if (reseller.balance < price) {
    throw new ResellerError(
      `موجودی کافی نیست. قیمت این سفارش ${toman(price)} است و موجودی شما ${toman(reseller.balance)}.`,
    );
  }

  const panel = await pickPanel(input.panelId ?? null, null);
  const settings = await getSettings();
  const customer = input.customerName.trim().slice(0, 60);
  const label = `${checked.gb} گیگ / ${checked.days} روز`;

  return spendCredit(
    reseller.id,
    price,
    "reseller_sale",
    `سفارش دلخواه ${label}${customer ? ` — ${customer}` : ""}`,
    `بازگشت وجه: ساخت سرویس ناموفق بود (${label})`,
    async () => {
      const service = await createServiceOnPanel({
        userId: reseller.id,
        userEmail: reseller.email,
        plan: {
          volumeGb: checked.gb,
          days: checked.days,
          deviceLimit: options.rates.deviceLimit,
        },
        planId: null,
        panel,
        code: `rs-${randomBytes(3).toString("hex")}`,
        remark: `${settings.site_name} | ${label}${customer ? ` | ${customer}` : ""}`,
      });

      const tagged = await db.service.update({
        where: { id: service.id },
        data: { resellerId: reseller.id, customerName: customer || null },
      });

      await notifyAdmin(
        `🤝 فروش نمایندگی (دلخواه)\nنماینده: ${reseller.resellerName || reseller.email}\n` +
          `سفارش: ${label}\nمشتری: ${customer || "—"}\nمبلغ: ${toman(price)}`,
        "order",
      );
      return tagged;
    },
  );
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

  const options = await resellerOptions();
  if (!options.showPlans) {
    throw new ResellerError("تمدید با پلن آماده غیرفعال است؛ از تمدید با حجم دلخواه استفاده کنید.");
  }

  const plan: Plan | null = await db.plan.findFirst({
    where: { id: input.planId || service.planId || "", isActive: true },
  });
  if (!plan) throw new ResellerError("پلن تمدید مشخص نیست؛ یک پلن انتخاب کنید.");

  const price = resellerPrice(plan.priceToman, reseller.resellerOff);
  if (reseller.balance < price) {
    throw new ResellerError(`موجودی کافی نیست؛ برای تمدید ${toman(price)} لازم است.`);
  }

  return spendCredit(
    reseller.id,
    price,
    "reseller_renew",
    `تمدید ${plan.title}${service.customerName ? ` — ${service.customerName}` : ""}`,
    `بازگشت وجه: تمدید ناموفق بود (${plan.title})`,
    () => renewServiceOnPanel(service, plan),
  );
}

/**
 * تمدید/شارژ سرویس مشتری با حجم و زمان دلخواه.
 *
 * حجم به حجم فعلی اضافه می‌شود و روزها به تاریخ انقضای فعلی؛ لینک و کانفیگ
 * مشتری عوض نمی‌شود. با روز صفر فقط حجم اضافه می‌شود.
 */
export async function resellerRenewCustom(input: {
  resellerId: string;
  serviceId: string;
  gb: number;
  days: number;
}): Promise<Service> {
  const reseller = await db.user.findUniqueOrThrow({ where: { id: input.resellerId } });
  const service = await db.service.findFirst({
    where: { id: input.serviceId, resellerId: reseller.id },
  });
  if (!service) throw new ResellerError("این سرویس در فهرست شما نیست.");

  const options = await resellerOptions();
  if (!options.showCustom) throw new ResellerError("تمدید با حجم دلخواه در حال حاضر فعال نیست.");

  const days = Math.round(Number(input.days));
  // روز صفر یعنی «فقط حجم اضافه کن»؛ در این حالت محدودهٔ روز بررسی نمی‌شود
  const checked = checkCustom(options.rates, { gb: input.gb, days }, days > 0 ? "custom" : "addon");
  if (!checked.ok) throw new ResellerError(checked.error);
  const addDays = days > 0 ? checked.days : 0;

  const { price } = customQuote(options.rates, checked.gb, addDays, reseller.resellerOff);
  if (price <= 0) throw new ResellerError("قیمت این سفارش صفر شد؛ نرخ‌ها را با پشتیبانی بررسی کنید.");
  if (reseller.balance < price) {
    throw new ResellerError(`موجودی کافی نیست؛ برای این شارژ ${toman(price)} لازم است.`);
  }

  const label = addDays > 0 ? `${checked.gb} گیگ / ${addDays} روز` : `${checked.gb} گیگ`;

  return spendCredit(
    reseller.id,
    price,
    "reseller_renew",
    `شارژ دلخواه ${label}${service.customerName ? ` — ${service.customerName}` : ""}`,
    `بازگشت وجه: شارژ ناموفق بود (${label})`,
    () =>
      renewServiceOnPanel(service, {
        volumeGb: checked.gb,
        days: addDays,
        deviceLimit: 0,
        keepExpiry: addDays === 0,
      }),
  );
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
