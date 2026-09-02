import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Gateway } from "@prisma/client";
import { db } from "./db";
import { asBool, asNum, getSettings, type Settings } from "./settings";
import {
  DEFAULT_CUSTOM,
  findDriver,
  GatewayError,
  parseCustomConfig,
  type GatewayConfig,
  type StartInput,
  type VerifyInput,
  type VerifyResult,
} from "./gateway";
import { tomanToUsdt, usdtRate } from "./rates";

/**
 * لایهٔ «روش‌های پرداخت»: همهٔ روش‌ها (کارت‌به‌کارت، کیف پول، درگاه‌های آنلاین و
 * ارز دیجیتال) از پنل مدیریت روشن/خاموش و تنظیم می‌شوند و همین‌جا خوانده می‌شوند.
 */

export type PaymentMethodKind = "card" | "wallet" | "online" | "crypto";

export type OnlineOption = {
  id: string;
  driver: string;
  label: string;
  minAmount: number;
  maxAmount: number;
};

export type MethodAvailability = {
  card: boolean;
  wallet: boolean;
  crypto: boolean;
  gateways: OnlineOption[];
};

/* -------------------------------------------------------------------------- */
/*                                درگاه‌ها                                     */
/* -------------------------------------------------------------------------- */

export function gatewayConfigOf(row: Gateway): GatewayConfig {
  let config: Record<string, unknown> = {};
  try {
    config = row.config ? (JSON.parse(row.config) as Record<string, unknown>) : {};
  } catch {
    config = {};
  }

  return {
    driver: row.driver,
    key: row.apiKey,
    secret: row.apiSecret,
    sandbox: row.sandbox,
    feeMode: String(config.feeMode ?? "buyer"),
    custom: config.custom
      ? parseCustomConfig(JSON.stringify(config.custom))
      : { ...DEFAULT_CUSTOM },
  };
}

/** آیا این درگاه واقعاً قابل استفاده است؟ (کلید و تنظیمات لازم را دارد) */
export function gatewayUsable(row: Gateway): boolean {
  if (!row.isActive) return false;
  const cfg = gatewayConfigOf(row);
  if (!findDriver(row.driver)) return false;
  if (row.driver === "custom") return Boolean(cfg.custom.requestUrl && cfg.custom.startUrl);
  if (row.driver === "zibal" && cfg.sandbox) return true;
  return Boolean(cfg.key);
}

/** درگاه‌های فعالِ قابل استفاده برای یک مبلغ مشخص */
export async function activeGateways(amount?: number): Promise<Gateway[]> {
  const rows = await db.gateway.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.filter((row) => {
    if (!gatewayUsable(row)) return false;
    if (amount === undefined) return true;
    if (row.minAmount > 0 && amount < row.minAmount) return false;
    if (row.maxAmount > 0 && amount > row.maxAmount) return false;
    return true;
  });
}

export async function gatewayById(id: string): Promise<Gateway | null> {
  return db.gateway.findUnique({ where: { id } });
}

/** شروع پرداخت با یک درگاه مشخص */
export async function startWithGateway(
  row: Gateway,
  input: StartInput,
): Promise<{ payUrl: string; ref: string }> {
  const driver = findDriver(row.driver);
  if (!driver) throw new GatewayError("درایور این درگاه پشتیبانی نمی‌شود.");
  if (!gatewayUsable(row)) throw new GatewayError("این درگاه هنوز کامل تنظیم نشده است.");
  return driver.start(input, gatewayConfigOf(row));
}

/** تأیید تراکنش با همان درگاهی که پرداخت با آن شروع شده */
export async function verifyWithGateway(row: Gateway, input: VerifyInput): Promise<VerifyResult> {
  const driver = findDriver(row.driver);
  if (!driver) return { ok: false, refId: "", message: "درایور این درگاه شناخته نشد." };
  try {
    return await driver.verify(input, gatewayConfigOf(row));
  } catch (err) {
    return { ok: false, refId: "", message: (err as Error).message };
  }
}

/**
 * امضای وب‌هوک هوش‌پی: HMAC-SHA256 روی JSON با کلیدهای مرتب‌شده.
 * (مطابق مستندات hooshpay.xyz/developers)
 */
export function hooshpaySignature(payload: Record<string, unknown>, secret: string): string {
  const sorted = Object.keys(payload)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = payload[key];
      return acc;
    }, {});
  return createHmac("sha256", secret).update(JSON.stringify(sorted)).digest("hex");
}

export function validHooshpaySignature(
  payload: Record<string, unknown>,
  signature: string,
  secret: string,
): boolean {
  if (!secret || !signature) return false;
  const expected = hooshpaySignature(payload, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* -------------------------------------------------------------------------- */
/*                              ارز دیجیتال                                    */
/* -------------------------------------------------------------------------- */

export async function activeWallets() {
  return db.cryptoWallet.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function cryptoEnabled(settings?: Settings): Promise<boolean> {
  const s = settings ?? (await getSettings());
  if (!asBool(s.crypto_enabled)) return false;
  const rate = await usdtRate();
  if (rate.toman <= 0) return false;
  return (await db.cryptoWallet.count({ where: { isActive: true } })) > 0;
}

/** یک آدرس فعال برای دریافت (چرخشی بین آدرس‌ها بر اساس سفارش) */
export async function pickWallet() {
  const wallets = await activeWallets();
  if (!wallets.length) return null;
  const index = Math.floor(Math.random() * wallets.length);
  return wallets[index];
}

/** مبلغ تتر معادل یک سفارش، به‌همراه نرخ همان لحظه */
export async function quoteCrypto(amountToman: number) {
  const rate = await usdtRate();
  return {
    rate: rate.toman,
    source: rate.source,
    amount: tomanToUsdt(amountToman, rate.toman),
  };
}

/* -------------------------------------------------------------------------- */
/*                        روش‌های در دسترس برای مشتری                          */
/* -------------------------------------------------------------------------- */

export async function availableMethods(amount: number): Promise<MethodAvailability> {
  const settings = await getSettings();
  const [gateways, crypto] = await Promise.all([
    activeGateways(amount),
    cryptoEnabled(settings),
  ]);

  return {
    card: asBool(settings.card_enabled),
    wallet: asBool(settings.wallet_enabled),
    crypto: crypto && amount >= Math.max(0, asNum(settings.crypto_min_amount, 0)),
    gateways: gateways.map((row) => ({
      id: row.id,
      driver: row.driver,
      label: row.label || row.driver,
      minAmount: row.minAmount,
      maxAmount: row.maxAmount,
    })),
  };
}

/**
 * انتقال تنظیمات قدیمی (تک‌درگاهی) به جدول درگاه‌ها.
 * یک بار انجام می‌شود تا سایت‌هایی که قبلاً درگاه تنظیم کرده‌اند چیزی از دست ندهند.
 */
export async function migrateLegacyGateway(): Promise<boolean> {
  if ((await db.gateway.count()) > 0) return false;

  const settings = await getSettings();
  const key = settings.gateway_key?.trim();
  const driver = settings.gateway_driver?.trim();
  if (!key && driver !== "custom") return false;

  const custom = parseCustomConfig(settings.gateway_custom);
  await db.gateway.create({
    data: {
      driver: driver || "zarinpal",
      label: findDriver(driver || "zarinpal")?.label ?? "درگاه پرداخت",
      apiKey: key ?? "",
      apiSecret: settings.gateway_secret ?? "",
      sandbox: asBool(settings.gateway_sandbox),
      isActive: asBool(settings.gateway_enabled),
      minAmount: Math.max(0, asNum(settings.gateway_min_amount, 10_000)),
      config: JSON.stringify({ feeMode: settings.gateway_fee_mode || "buyer", custom }),
    },
  });
  return true;
}
