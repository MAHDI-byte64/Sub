import "server-only";
import { db } from "./db";
import { asNum, getSettings } from "./settings";
import { creditWallet } from "./wallet";
import { notifyUser } from "./notify";
import { toman } from "./format";

/**
 * پاداش دعوت را بعد از اولین خرید موفقِ کاربر دعوت‌شده به دعوت‌کننده می‌دهد.
 * خطاها نادیده گرفته می‌شوند تا جریان خرید متوقف نشود.
 */
export async function payReferralBonus(userId: string, payable: number): Promise<void> {
  try {
    const settings = await getSettings();
    const percent = asNum(settings.referral_percent, 0);
    if (percent <= 0) return;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user?.referredById) return;

    // فقط برای اولین خرید موفق
    const approved = await db.order.count({ where: { userId, status: "approved", kind: "plan" } });
    if (approved > 1) return;

    const bonus = Math.round((payable * percent) / 100);
    if (bonus <= 0) return;

    await creditWallet(user.referredById, bonus, "referral", `پاداش دعوت ${user.email}`);
    await notifyUser({
      userId: user.referredById,
      kind: "referral",
      title: "پاداش دعوت به کیف پول شما اضافه شد",
      body: `${toman(bonus)} بابت اولین خرید کاربری که دعوت کرده بودید.`,
      href: "/dashboard/wallet",
    });
  } catch {
    /* پاداش نباید جریان خرید را متوقف کند */
  }
}
