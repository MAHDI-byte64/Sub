import "server-only";
import { db } from "./db";

export class WalletError extends Error {}

/** افزودن اعتبار به کیف پول (amount مثبت) */
export async function creditWallet(
  userId: string,
  amount: number,
  kind: string,
  note?: string,
  orderId?: string | null,
): Promise<number> {
  const value = Math.round(amount);
  if (value <= 0) throw new WalletError("مبلغ شارژ باید بیشتر از صفر باشد.");

  const [user] = await db.$transaction([
    db.user.update({ where: { id: userId }, data: { balance: { increment: value } } }),
    db.walletTx.create({
      data: { userId, amount: value, kind, note: note ?? null, orderId: orderId ?? null },
    }),
  ]);
  return user.balance;
}

/** برداشت از کیف پول (amount مثبت وارد کنید) */
export async function debitWallet(
  userId: string,
  amount: number,
  kind: string,
  note?: string,
  orderId?: string | null,
): Promise<number> {
  const value = Math.round(amount);
  if (value <= 0) throw new WalletError("مبلغ برداشت باید بیشتر از صفر باشد.");

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.balance < value) throw new WalletError("موجودی کیف پول کافی نیست.");

  const [updated] = await db.$transaction([
    db.user.update({ where: { id: userId }, data: { balance: { decrement: value } } }),
    db.walletTx.create({
      data: { userId, amount: -value, kind, note: note ?? null, orderId: orderId ?? null },
    }),
  ]);
  return updated.balance;
}

const WALLET_KIND_EN: Record<string, string> = {
  topup: "Wallet top-up",
  purchase: "Service purchase",
  renew: "Service renewal",
  auto_renew: "Automatic renewal",
  referral: "Referral reward",
  reseller_sale: "Reseller sale",
  reseller_renew: "Reseller renewal",
  admin: "Adjusted by admin",
  refund: "Refund",
};

/** برچسب نوع تراکنش به زبان جاری */
export function walletKind(locale: "fa" | "en", kind: string): string {
  const map = locale === "en" ? WALLET_KIND_EN : WALLET_KIND;
  return map[kind] ?? kind;
}

export const WALLET_KIND: Record<string, string> = {
  topup: "شارژ کیف پول",
  purchase: "خرید سرویس",
  renew: "تمدید سرویس",
  auto_renew: "تمدید خودکار",
  referral: "پاداش دعوت",
  reseller_sale: "فروش نمایندگی",
  reseller_renew: "تمدید نمایندگی",
  admin: "تنظیم توسط مدیر",
  refund: "بازگشت وجه",
};
