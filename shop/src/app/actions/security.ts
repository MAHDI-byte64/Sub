"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, verifyPassword } from "@/lib/auth";
import { logAdmin } from "@/lib/adminlog";
import { newBackupCodes, newTotpSecret, verifyTotp } from "@/lib/totp";

export type SecurityState = {
  error?: string;
  success?: string;
  /** کدهای پشتیبان فقط همین یک بار برگردانده می‌شوند */
  codes?: string[];
};

async function me() {
  const user = await getCurrentUser();
  if (!user) return null;
  return db.user.findUnique({ where: { id: user.id } });
}

/** مرحلهٔ ۱: ساخت کلید تازه تا کاربر آن را در اپ احرازهویت اسکن کند */
export async function startTotpAction(): Promise<SecurityState> {
  const user = await me();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };
  if (user.totpEnabledAt) return { error: "ورود دومرحله‌ای همین حالا روشن است." };

  await db.user.update({ where: { id: user.id }, data: { totpSecret: newTotpSecret() } });
  revalidatePath("/admin/security");
  return { success: "کلید ساخته شد؛ آن را در اپ احرازهویت اسکن کنید." };
}

/** مرحلهٔ ۲: تأیید اولین کد و روشن‌کردن دومرحله‌ای + کدهای پشتیبان */
export async function confirmTotpAction(
  _prev: SecurityState,
  formData: FormData,
): Promise<SecurityState> {
  const user = await me();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };
  if (!user.totpSecret) return { error: "اول کلید را بسازید." };
  if (user.totpEnabledAt) return { error: "ورود دومرحله‌ای همین حالا روشن است." };

  const code = String(formData.get("code") || "");
  if (!verifyTotp(user.totpSecret, code)) {
    return { error: "کد درست نیست. ساعت گوشی را با اینترنت تنظیم کنید و کد تازه را بزنید." };
  }

  const backup = newBackupCodes();
  await db.user.update({
    where: { id: user.id },
    data: { totpEnabledAt: new Date(), totpBackupCodes: backup.hashed },
  });
  await logAdmin("totp_enabled", user.email);
  revalidatePath("/admin/security");

  return {
    success: "ورود دومرحله‌ای روشن شد. از این به بعد بعد از رمز، کد اپ هم پرسیده می‌شود.",
    codes: backup.codes,
  };
}

/** خاموش‌کردن دومرحله‌ای: با رمز عبور همین حساب */
export async function disableTotpAction(
  _prev: SecurityState,
  formData: FormData,
): Promise<SecurityState> {
  const user = await me();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };
  if (!user.totpEnabledAt && !user.totpSecret) return { error: "ورود دومرحله‌ای روشن نیست." };

  const password = String(formData.get("password") || "");
  if (!verifyPassword(password, user.passwordHash)) return { error: "رمز عبور درست نیست." };

  await db.user.update({
    where: { id: user.id },
    data: { totpSecret: null, totpEnabledAt: null, totpBackupCodes: null },
  });
  await logAdmin("totp_disabled", user.email);
  revalidatePath("/admin/security");
  return { success: "ورود دومرحله‌ای خاموش شد." };
}

/** کدهای پشتیبان تازه (کدهای قبلی از کار می‌افتند) */
export async function newBackupCodesAction(
  _prev: SecurityState,
  formData: FormData,
): Promise<SecurityState> {
  const user = await me();
  if (!user) return { error: "ابتدا وارد حساب خود شوید." };
  if (!user.totpEnabledAt) return { error: "اول ورود دومرحله‌ای را روشن کنید." };

  const password = String(formData.get("password") || "");
  if (!verifyPassword(password, user.passwordHash)) return { error: "رمز عبور درست نیست." };

  const backup = newBackupCodes();
  await db.user.update({ where: { id: user.id }, data: { totpBackupCodes: backup.hashed } });
  await logAdmin("totp_backup_codes", user.email);
  revalidatePath("/admin/security");

  return { success: "کدهای پشتیبان تازه ساخته شد؛ کدهای قبلی دیگر کار نمی‌کنند.", codes: backup.codes };
}
