"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { orderTitle } from "@/lib/orders";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { asNum, getSettings, saveSettings } from "@/lib/settings";
import { notifyAdmin } from "@/lib/telegram";
import {
  createServiceOnPanel,
  fulfillOrder,
  panelClient,
  pickPanel,
  removeService,
  migrateService,
  renewServiceOnPanel,
  resetServiceTraffic,
  rotateService,
  setServiceEnabled,
  syncService,
} from "@/lib/provision";
import { logAdmin } from "@/lib/adminlog";
import { checkPanel, runPanelChecks } from "@/lib/monitor";
import { ensureVapidKeys, sendPushToUser } from "@/lib/push";
import { findDriver } from "@/lib/gateway";
import { gatewayUsable, migrateLegacyGateway } from "@/lib/payments";
import { usdtRate } from "@/lib/rates";
import {
  createBackup,
  deleteBackup,
  listBackups,
  pruneBackups,
  readBackup,
  restoreBackup,
  sendBackupToTelegram,
  type RestoreCode,
  type SendCode,
} from "@/lib/backup";
import { creditWallet, debitWallet } from "@/lib/wallet";
import { payReferralBonus } from "@/lib/referral";
import { notifyAdmin as notifyTelegram, telegramApi } from "@/lib/telegram";
import { faNum, formatBytes, toman } from "@/lib/format";
import { mailReady, mailTemplate, sendMail } from "@/lib/mail";
import { announceToUsers, AUDIENCE_LABEL, notifyUser, type Audience } from "@/lib/notify";

export type AdminState = { error?: string; success?: string };

async function guard(): Promise<AdminState | null> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fadmin");
  if (user.role !== "admin") return { error: "این کار فقط از حساب مدیر انجام می‌شود." };
  return null;
}

/** کارهایی که پشتیبان هم اجازه دارد (تیکت و نگه‌داری سرویس‌ها) */
async function guardStaff(): Promise<AdminState | null> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fadmin");
  if (!isStaff(user.role)) return { error: "دسترسی مدیریتی ندارید." };
  return null;
}

function num(formData: FormData, key: string, fallback = 0): number {
  const n = Number(formData.get(key));
  return Number.isFinite(n) ? n : fallback;
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

function checked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "1";
}

/**
 * پیام را روی آدرس صفحه می‌گذارد و برمی‌گردد.
 * برای اکشن‌هایی لازم است که ردیف/کارت مربوطه بعد از اجرا از صفحه حذف می‌شود
 * و در نتیجه پیام داخل خود فرم دیده نمی‌شود.
 */
function flash(path: string, message: string, type: "success" | "error" = "success"): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}msg=${encodeURIComponent(message)}&type=${type}`);
}

/* ---------------------------------- سفارش‌ها --------------------------------- */

export async function approveOrderAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const orderId = str(formData, "orderId");
  const order = await db.order.findUnique({ where: { id: orderId }, include: { user: true, plan: true } });
  if (!order) return { error: "سفارش پیدا نشد." };
  if (order.status === "approved") return { error: "این سفارش قبلاً تأیید شده است." };

  // سفارش شارژ کیف پول: فقط اعتبار اضافه می‌شود
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
    await logAdmin("order_approved", order.code, `شارژ کیف پول ${toman(order.payable)} — ${order.user.email}`);
    revalidatePath("/admin/orders");
    flash("/admin/orders?status=pending_review", `کیف پول ${order.user.email} شارژ شد.`);
  }

  try {
    await fulfillOrder(order.id);
  } catch (err) {
    const message = (err as Error).message || "خطای نامشخص";
    await db.order.update({ where: { id: order.id }, data: { adminNote: `خطای تحویل: ${message}` } });
    return { error: `تحویل سرویس ناموفق بود: ${message}` };
  }

  await payReferralBonus(order.userId, order.payable);

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
  });

  if (order.discountId) {
    await db.discount.update({
      where: { id: order.discountId },
      data: { usedCount: { increment: 1 } },
    });
  }

  await notifyAdmin(
    `✅ سفارش ${order.code} تأیید و «${title}» برای ${order.user.email} ${isAddon ? "اعمال" : "ساخته"} شد.`,
    "system",
  );
  await logAdmin("order_approved", order.code, `${title} — ${order.user.email}`);

  revalidatePath("/admin/orders");
  revalidatePath("/dashboard");
  flash(
    "/admin/orders?status=pending_review",
    isAddon ? `حجم اضافهٔ سفارش ${order.code} اعمال شد.` : `سفارش ${order.code} تأیید و سرویس تحویل شد.`,
  );
}

export async function rejectOrderAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const orderId = str(formData, "orderId");
  const note = str(formData, "note") || "رسید پرداخت تأیید نشد.";
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { error: "سفارش پیدا نشد." };

  await db.order.update({
    where: { id: order.id },
    data: { status: "rejected", adminNote: note, reviewedAt: new Date() },
  });
  await logAdmin("order_rejected", order.code, note);
  await notifyUser({
    userId: order.userId,
    kind: "order_rejected",
    title: `سفارش ${order.code} تأیید نشد`,
    body: note,
    href: `/dashboard/orders/${order.code}`,
  });
  revalidatePath("/admin/orders");
  flash("/admin/orders?status=pending_review", `سفارش ${order.code} رد شد.`);
}

/* ------------------------------------ پلن‌ها ---------------------------------- */

export async function savePlanAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const panelIds = formData.getAll("panelIds").map(String).filter(Boolean);
  const data = {
    title: str(formData, "title"),
    subtitle: str(formData, "subtitle") || null,
    volumeGb: num(formData, "volumeGb"),
    days: num(formData, "days", 30),
    deviceLimit: num(formData, "deviceLimit"),
    priceToman: num(formData, "priceToman"),
    sortOrder: num(formData, "sortOrder"),
    isActive: checked(formData, "isActive"),
    isPopular: checked(formData, "isPopular"),
  };
  if (!data.title) return { error: "عنوان پلن الزامی است." };
  if (data.priceToman < 0) return { error: "قیمت نمی‌تواند منفی باشد." };

  if (id) {
    await db.plan.update({
      where: { id },
      data: { ...data, panels: { set: panelIds.map((panelId) => ({ id: panelId })) } },
    });
  } else {
    await db.plan.create({
      data: { ...data, panels: { connect: panelIds.map((panelId) => ({ id: panelId })) } },
    });
  }

  await logAdmin("plan_saved", data.title, panelIds.length ? `${panelIds.length} سرور` : "همه سرورها");
  revalidatePath("/admin/plans");
  revalidatePath("/plans");
  revalidatePath("/");
  return { success: "پلن ذخیره شد." };
}

export async function deletePlanAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;
  const id = str(formData, "id");
  const used = await db.order.count({ where: { planId: id } });
  if (used > 0) {
    await db.plan.update({ where: { id }, data: { isActive: false } });
    revalidatePath("/admin/plans");
    flash("/admin/plans", "این پلن سفارش ثبت‌شده دارد، بنابراین فقط غیرفعال شد.");
  }
  await db.plan.delete({ where: { id } });
  revalidatePath("/admin/plans");
  revalidatePath("/plans");
  flash("/admin/plans", "پلن حذف شد.");
}

/* ----------------------------------- پنل‌ها ---------------------------------- */

export async function savePanelAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const password = str(formData, "password");
  const apiToken = str(formData, "apiToken");
  const clearToken = checked(formData, "clearApiToken");
  const data: Record<string, unknown> = {
    name: str(formData, "name"),
    location: str(formData, "location"),
    flag: str(formData, "flag") || "🌍",
    url: str(formData, "url").replace(/\/+$/, ""),
    username: str(formData, "username"),
    inboundId: num(formData, "inboundId", 1),
    templateEmail: str(formData, "templateEmail") || null,
    namePattern: str(formData, "namePattern") || "{template}-{code}",
    multiInbound: checked(formData, "multiInbound"),
    subBase: str(formData, "subBase") || null,
    flow: str(formData, "flow"),
    hostOverride: str(formData, "hostOverride") || null,
    capacity: num(formData, "capacity"),
    sortOrder: num(formData, "sortOrder"),
    note: str(formData, "note") || null,
    isActive: checked(formData, "isActive"),
  };
  if (!data.name || !data.url) {
    return { error: "نام و آدرس پنل الزامی است." };
  }
  if (!/^https?:\/\//i.test(String(data.url))) {
    return { error: "آدرس پنل باید با http:// یا https:// شروع شود." };
  }

  if (id) {
    const existing = await db.panel.findUnique({ where: { id } });
    if (!existing) return { error: "سرور پیدا نشد." };

    if (password) data.password = password;
    if (clearToken) data.apiToken = null;
    else if (apiToken) data.apiToken = apiToken;

    const willHaveToken = clearToken ? false : Boolean(apiToken || existing.apiToken);
    if (!willHaveToken && !data.username) {
      return { error: "یا توکن API را وارد کنید یا نام کاربری و رمز پنل را." };
    }
    await db.panel.update({ where: { id }, data });
  } else {
    if (!apiToken && (!data.username || !password)) {
      return { error: "یا توکن API پنل را وارد کنید، یا نام کاربری و رمز عبور پنل را." };
    }
    data.password = password;
    data.apiToken = apiToken || null;
    await db.panel.create({ data: data as never });
  }

  await logAdmin("panel_saved", String(data.name));
  revalidatePath("/admin/panels");
  revalidatePath("/plans");
  return { success: "سرور ذخیره شد." };
}

export async function testPanelAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const panel = await db.panel.findUnique({ where: { id } });
  if (!panel) return { error: "سرور پیدا نشد." };

  const result = await panelClient(panel).testConnection();
  await db.panel.update({
    where: { id },
    data: { lastError: result.ok ? null : result.message, lastCheckAt: new Date() },
  });
  revalidatePath("/admin/panels");

  if (!result.ok) return { error: `اتصال ناموفق: ${result.message}` };

  const { parseInboundClients } = await import("@/lib/xui");
  const list = result.inbounds
    .map((i) => `#${i.id} ${i.remark || i.protocol} (${i.protocol}:${i.port})`)
    .join(" — ");

  const template = panel.templateEmail?.trim();
  let templateNote = "کلاینت الگو تعیین نشده است؛ کانفیگ‌ها با تنظیمات پیش‌فرض ساخته می‌شوند.";

  if (template) {
    const { loadTemplate, panelClient: makeClient } = await import("@/lib/provision");
    try {
      const found = await loadTemplate(makeClient(panel), panel);
      const ids = found.inboundIds;
      const labels = ids
        .map((id) => {
          const inbound = result.inbounds.find((i) => i.id === id);
          return `#${id}${inbound?.remark ? ` ${inbound.remark}` : ""}`;
        })
        .join("، ");

      if (!ids.includes(panel.inboundId)) {
        await db.panel.update({ where: { id: panel.id }, data: { inboundId: ids[0] } });
        revalidatePath("/admin/panels");
      }

      templateNote =
        `کلاینت الگو «${template}» پیدا شد ✅ | ` +
        (panel.multiInbound
          ? `سرویس‌های جدید روی ${faNum(ids.length)} اینباند ساخته می‌شوند: ${labels}`
          : `فقط روی اینباند ${labels} ساخته می‌شوند (حالت چند-اینباندی خاموش است)`);
    } catch (err) {
      const all = result.inbounds
        .flatMap((i) => parseInboundClients(i).map((c) => String(c.email ?? "")))
        .filter(Boolean);
      return {
        error: `${(err as Error).message} کلاینت‌های موجود: ${all.join("، ") || "—"}`,
      };
    }
  } else if (!result.inbounds.some((i) => i.id === panel.inboundId)) {
    return { error: `اتصال برقرار شد اما اینباند #${panel.inboundId} در این پنل نیست. اینباندها: ${list}` };
  }

  const tokenNote =
    result.generation === "v3" && result.authMode !== "token"
      ? " | پیشنهاد: این پنل نسخه ۳ است؛ بهتر است به‌جای نام کاربری از «توکن API» استفاده کنید."
      : "";

  return {
    success: `${result.message} | اینباندها: ${list} | ${templateNote}${tokenNote}`,
  };
}

export async function deletePanelAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;
  const id = str(formData, "id");
  const services = await db.service.count({ where: { panelId: id } });
  if (services > 0) {
    await db.panel.update({ where: { id }, data: { isActive: false } });
    revalidatePath("/admin/panels");
    flash("/admin/panels", "این سرور سرویس فعال دارد؛ فقط غیرفعال شد.");
  }
  await db.panel.delete({ where: { id } });
  revalidatePath("/admin/panels");
  flash("/admin/panels", "سرور حذف شد.");
}

/* ---------------------------------- تخفیف‌ها --------------------------------- */

export async function saveDiscountAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const code = str(formData, "code").toUpperCase();
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
    return { error: "کد تخفیف باید ۳ تا ۲۴ کاراکتر انگلیسی/عدد باشد." };
  }
  const expires = str(formData, "expiresAt");
  const data = {
    code,
    type: str(formData, "type") === "amount" ? "amount" : "percent",
    value: num(formData, "value"),
    maxUses: num(formData, "maxUses"),
    minAmount: num(formData, "minAmount"),
    expiresAt: expires ? new Date(expires) : null,
    isActive: checked(formData, "isActive"),
  };
  if (data.type === "percent" && (data.value < 1 || data.value > 100)) {
    return { error: "درصد تخفیف باید بین ۱ تا ۱۰۰ باشد." };
  }

  const duplicate = await db.discount.findUnique({ where: { code } });
  if (duplicate && duplicate.id !== id) return { error: "این کد قبلاً ثبت شده است." };

  if (id) await db.discount.update({ where: { id }, data });
  else await db.discount.create({ data });

  revalidatePath("/admin/discounts");
  return { success: "کد تخفیف ذخیره شد." };
}

export async function deleteDiscountAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;
  const id = str(formData, "id");
  const used = await db.order.count({ where: { discountId: id } });
  if (used > 0) {
    await db.discount.update({ where: { id }, data: { isActive: false } });
    revalidatePath("/admin/discounts");
    flash("/admin/discounts", "این کد در سفارش‌ها استفاده شده؛ فقط غیرفعال شد.");
  }
  await db.discount.delete({ where: { id } });
  revalidatePath("/admin/discounts");
  flash("/admin/discounts", "کد تخفیف حذف شد.");
}

/* ---------------------------------- تنظیمات ---------------------------------- */

export async function saveSettingsAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const { SETTING_DEFS } = await import("@/lib/settings");
  const values: Record<string, string> = {};
  for (const def of SETTING_DEFS) {
    if (def.type === "bool") values[def.key] = formData.get(def.key) ? "1" : "0";
    else values[def.key] = String(formData.get(def.key) ?? "");
  }
  await saveSettings(values);
  await logAdmin("settings_saved");
  revalidatePath("/", "layout");
  return { success: "تنظیمات ذخیره شد." };
}

/* ---------------------------------- کاربران ---------------------------------- */

export async function toggleUserBlockAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const user = await db.user.findUnique({ where: { id } });
  if (!user) return { error: "کاربر پیدا نشد." };
  if (user.role === "admin") return { error: "حساب مدیر قابل مسدود کردن نیست." };

  await db.user.update({ where: { id }, data: { isBlocked: !user.isBlocked } });
  await logAdmin(user.isBlocked ? "user_unblocked" : "user_blocked", user.email);
  revalidatePath("/admin/users");
  flash("/admin/users", user.isBlocked ? "کاربر آزاد شد." : "کاربر مسدود شد.");
}

export async function resetTrialFlagAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;
  const id = str(formData, "id");
  await db.user.update({ where: { id }, data: { trialUsedAt: null } });
  await logAdmin("user_trial_reset", id);
  revalidatePath("/admin/users");
  flash("/admin/users", "امکان دریافت تست رایگان برای این کاربر آزاد شد.");
}

/* --------------------------------- سرویس‌ها ---------------------------------- */

export async function syncServiceAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guardStaff();
  if (denied) return denied;
  const id = str(formData, "id");
  await syncService(id, true);
  revalidatePath("/admin/services");
  flash("/admin/services", "وضعیت سرویس به‌روزرسانی شد.");
}

export async function toggleServiceAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guardStaff();
  if (denied) return denied;
  const id = str(formData, "id");
  const service = await db.service.findUnique({ where: { id } });
  if (!service) return { error: "سرویس پیدا نشد." };
  try {
    await setServiceEnabled(id, service.status !== "active");
  } catch (err) {
    flash("/admin/services", `تغییر وضعیت روی پنل ناموفق بود: ${(err as Error).message}`, "error");
  }
  revalidatePath("/admin/services");
  flash("/admin/services", "وضعیت سرویس تغییر کرد.");
}

export async function deleteServiceAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;
  const id = str(formData, "id");
  try {
    await removeService(id);
  } catch (err) {
    flash("/admin/services", `حذف سرویس ناموفق بود: ${(err as Error).message}`, "error");
  }
  revalidatePath("/admin/services");
  flash("/admin/services", "سرویس حذف شد.");
}

/* ------------------------- سرویس‌دهی دستی توسط مدیر ------------------------- */

/** ساخت سرویس برای یک کاربر بدون سفارش (هدیه، جبران خسارت، فروش آفلاین) */
export async function createServiceForUserAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const userId = str(formData, "userId");
  const planId = str(formData, "planId");
  const panelId = str(formData, "panelId") || null;
  const note = str(formData, "note");

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "کاربر پیدا نشد." };

  const plan = await db.plan.findFirst({ where: { id: planId }, include: { panels: true } });
  if (!plan) return { error: "پلن انتخابی پیدا نشد." };

  try {
    const panel = await pickPanel(
      panelId,
      plan.panels.map((p) => p.id),
    );
    const { getSettings } = await import("@/lib/settings");
    const settings = await getSettings();
    const service = await createServiceOnPanel({
      userId: user.id,
      userEmail: user.email,
      plan,
      planId: plan.id,
      panel,
      code: `admin-${Date.now().toString(36)}`,
      remark: `${settings.site_name} | ${plan.title}`,
    });
    await logAdmin("service_created", user.email, `${plan.title} روی ${panel.location}${note ? ` — ${note}` : ""}`);
    revalidatePath(`/admin/users/${user.id}`);
    revalidatePath("/admin/services");
    return { success: `سرویس «${plan.title}» برای ${user.email} ساخته شد (${service.clientEmail}).` };
  } catch (err) {
    return { error: `ساخت سرویس ناموفق بود: ${(err as Error).message}` };
  }
}

/** افزودن دستی حجم و زمان به یک سرویس */
export async function extendServiceAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const days = num(formData, "days");
  const gb = num(formData, "gb");
  if (days <= 0 && gb <= 0) return { error: "حداقل یکی از حجم یا روز را وارد کنید." };

  const service = await db.service.findUnique({ where: { id }, include: { user: true } });
  if (!service) return { error: "سرویس پیدا نشد." };

  try {
    await renewServiceOnPanel(service, { volumeGb: gb, days, deviceLimit: 0, id: null });
    await logAdmin(
      "service_extended",
      service.user.email,
      `${gb > 0 ? `${gb} گیگ` : ""}${gb > 0 && days > 0 ? " و " : ""}${days > 0 ? `${days} روز` : ""}`,
    );
    revalidatePath("/admin/services");
    revalidatePath(`/admin/users/${service.userId}`);
    return { success: "سرویس با موفقیت تمدید شد." };
  } catch (err) {
    return { error: `تمدید ناموفق بود: ${(err as Error).message}` };
  }
}

/** صفر کردن مصرف یک سرویس */
export async function resetServiceTrafficAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const service = await db.service.findUnique({ where: { id }, include: { user: true } });
  if (!service) return { error: "سرویس پیدا نشد." };

  try {
    await resetServiceTraffic(id);
    await logAdmin("service_traffic_reset", service.user.email, service.clientEmail);
    revalidatePath("/admin/services");
    revalidatePath(`/admin/users/${service.userId}`);
    return { success: "مصرف سرویس صفر شد." };
  } catch (err) {
    return { error: `صفر کردن مصرف ناموفق بود: ${(err as Error).message}` };
  }
}

/** بازتولید کانفیگ سرویس توسط مدیر (بدون محدودیت زمانی) */
export async function rotateServiceAdminAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guardStaff();
  if (denied) return denied;

  const id = str(formData, "id");
  const service = await db.service.findUnique({ where: { id }, include: { user: true } });
  if (!service) return { error: "سرویس پیدا نشد." };

  try {
    const { failed } = await rotateService(id);
    await logAdmin("service_rotated", service.user.email, service.clientEmail);
    await notifyUser({
      userId: service.userId,
      kind: "rotated",
      title: "کانفیگ سرویس شما بازتولید شد",
      body: "شناسه اتصال و لینک اشتراک عوض شد. لینک تازه را از پنل کاربری بردارید؛ کانفیگ قبلی دیگر کار نمی‌کند.",
      href: `/dashboard/services/${service.id}`,
      serviceId: service.id,
    });
    revalidatePath("/admin/services");
    revalidatePath(`/admin/users/${service.userId}`);

    return {
      success: failed.length
        ? `کانفیگ بازتولید شد، اما اینباند ${failed.map((f) => f.inboundId).join("، ")} به‌روزرسانی نشد.`
        : "کانفیگ بازتولید شد؛ UUID و لینک اشتراک تازه است و اتصال‌های قبلی قطع شدند.",
    };
  } catch (err) {
    return { error: `بازتولید کانفیگ ناموفق بود: ${(err as Error).message}` };
  }
}

/* ------------------------------ اعلان پوش ------------------------------ */

/** ساخت کلیدهای VAPID و روشن‌کردن اعلان پوش */
export async function enablePushAction(_prev: AdminState, _formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const keys = await ensureVapidKeys();
  await saveSettings({ push_enabled: "1" });
  await logAdmin("push_enabled");
  revalidatePath("/admin/settings");
  return {
    success: `اعلان پوش فعال شد. کلید عمومی: ${keys.publicKey.slice(0, 12)}… (کاربران از صفحهٔ اعلان‌ها روشنش می‌کنند)`,
  };
}

/** ارسال یک پوش آزمایشی به خود مدیر */
export async function testPushAction(_prev: AdminState, _formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const admin = await getCurrentUser();
  if (!admin) return { error: "دسترسی مدیریتی ندارید." };

  const sent = await sendPushToUser(admin.id, {
    title: "🔔 پیام آزمایشی فندق",
    body: "اگر این پیام را می‌بینید، اعلان پوش درست کار می‌کند.",
    url: "/admin",
  });
  return sent
    ? { success: `پیام آزمایشی به ${faNum(sent)} دستگاه شما فرستاده شد.` }
    : {
        error:
          "هیچ دستگاهی برای حساب شما ثبت نشده است. اول از صفحهٔ «اعلان‌ها» در پنل کاربری، اعلان را روی همین مرورگر روشن کنید.",
      };
}


/* ------------------------------ پشتیبان‌گیری ------------------------------ */

function sizeLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${faNum(mb.toFixed(1))} مگابایت` : `${faNum(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
}

const SEND_MESSAGE: Record<SendCode, string> = {
  sent: "پشتیبان در تلگرام فرستاده شد.",
  "no-bot": "توکن ربات یا شناسهٔ چت مدیر در تنظیمات پر نشده است.",
  missing: "این فایل پشتیبان پیدا نشد.",
  "too-big": "فایل برای ارسال با ربات تلگرام بزرگ است (بیشتر از ۴۵ مگابایت).",
  failed: "ارسال به تلگرام انجام نشد.",
};

const RESTORE_MESSAGE: Record<RestoreCode, string> = {
  restored: "بازیابی انجام شد.",
  corrupt: "فایل خراب است یا فرمتش پشتیبان این سایت نیست.",
  "not-a-backup": "داخل این فایل دیتابیس سالمی پیدا نشد.",
  "needs-password": "این پشتیبان رمزگذاری شده است؛ گذرواژهٔ همان زمان را وارد کنید.",
  "bad-password": "گذرواژه درست نیست (یا فایل دست‌خورده است).",
  failed: "نوشتن فایل‌ها انجام نشد",
};

/** ساخت پشتیبان تازه (دیتابیس + رسیدها) */
export async function createBackupAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  try {
    const { file, size } = await createBackup("دستی");
    const settings = await getSettings();
    await pruneBackups(Math.max(1, asNum(settings.backup_keep, 7)));
    await logAdmin("backup_created", file, sizeLabel(size));

    let extra = "";
    if (checked(formData, "toTelegram")) {
      const sent = await sendBackupToTelegram(file);
      extra = sent.ok
        ? " و در تلگرام فرستاده شد"
        : ` (ارسال تلگرام انجام نشد: ${SEND_MESSAGE[sent.code]})`;
    }

    revalidatePath("/admin/backup");
    const lock = file.endsWith(".enc") ? " (رمزگذاری‌شده 🔒)" : "";
    return { success: `پشتیبان ساخته شد: ${file} — ${sizeLabel(size)}${lock}${extra}` };
  } catch (err) {
    return { error: `ساخت پشتیبان ناموفق بود: ${(err as Error).message}` };
  }
}

/** فرستادن یک پشتیبان موجود به تلگرام */
export async function sendBackupAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const name = str(formData, "name");
  const result = await sendBackupToTelegram(name);
  if (result.ok) await logAdmin("backup_sent", name);

  const message = SEND_MESSAGE[result.code];
  return result.ok
    ? { success: message }
    : { error: result.detail ? `${message} (${result.detail})` : message };
}

export async function deleteBackupAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const name = str(formData, "name");
  const done = await deleteBackup(name);
  if (!done) return { error: "نام فایل پشتیبان معتبر نیست." };

  await logAdmin("backup_deleted", name);
  revalidatePath("/admin/backup");
  flash("/admin/backup", `پشتیبان ${name} حذف شد.`);
}

/** بازگرداندن سایت از روی یک پشتیبان (از فهرست یا فایل آپلودی) */
export async function restoreBackupAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  if (str(formData, "confirm") !== "بازیابی") {
    return { error: "برای تأیید، کلمهٔ «بازیابی» را دقیقاً در کادر بنویسید." };
  }

  let archive: Buffer | null = null;
  const name = str(formData, "name");
  const upload = formData.get("file");

  if (upload instanceof File && upload.size > 0) {
    if (upload.size > 200 * 1024 * 1024) return { error: "فایل پشتیبان بیش از حد بزرگ است." };
    archive = Buffer.from(await upload.arrayBuffer());
  } else if (name) {
    archive = await readBackup(name);
  }
  if (!archive) return { error: "فایل پشتیبان را انتخاب یا آپلود کنید." };

  const result = await restoreBackup(archive, str(formData, "password"));
  if (!result.ok) {
    const message = RESTORE_MESSAGE[result.code];
    return { error: result.detail ? `${message}: ${result.detail}` : message };
  }

  await logAdmin("backup_restored", name || "فایل آپلودی", result.manifest?.createdAt ?? "");
  revalidatePath("/", "layout");
  return {
    success:
      `${RESTORE_MESSAGE.restored} از وضعیت قبلی هم یک پشتیبان ایمنی ساخته شد` +
      (result.safetyCopy ? ` (${result.safetyCopy}).` : ".") +
      " اگر چیزی درست نمایش داده نشد، یک بار صفحه را تازه کنید.",
  };
}

/** فهرست پشتیبان‌ها برای نمایش در پنل */
export async function backupList() {
  return listBackups();
}

/** ارسال ایمیل آزمایشی برای بررسی تنظیمات SMTP */
export async function testMailAction(_prev: AdminState, _formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const user = await getCurrentUser();
  const settings = await getSettings();
  if (!mailReady(settings)) {
    return { error: "اول آدرس سرور SMTP و فرستنده را در بخش «ایمیل» پر کنید." };
  }

  const result = await sendMail({
    to: user!.email,
    subject: `ایمیل آزمایشی ${settings.site_name}`,
    text: "اگر این پیام را می‌بینید، تنظیمات SMTP درست است و بازیابی رمز عبور کار می‌کند.",
    html: mailTemplate({
      siteName: settings.site_name,
      title: "ایمیل آزمایشی",
      body: "اگر این پیام را می‌بینید، تنظیمات SMTP درست است و بازیابی رمز عبور کار می‌کند.",
    }),
  });

  await logAdmin("mail_tested", user!.email, result.ok ? "موفق" : (result.detail ?? "ناموفق"));
  return result.ok
    ? { success: `ایمیل آزمایشی به ${user!.email} فرستاده شد. صندوق ورودی و اسپم را ببینید.` }
    : { error: `ارسال ایمیل انجام نشد: ${result.detail ?? "تنظیمات را بررسی کنید."}` };
}

/** اطلاعیهٔ همگانی: اعلان درون‌سایتی برای همهٔ کاربرانِ انتخاب‌شده (+ پوش اختیاری) */
export async function announceAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const title = str(formData, "title");
  const body = str(formData, "body");
  const href = str(formData, "href");
  const audience = (str(formData, "audience") || "all") as Audience;
  const withPush = checked(formData, "push");

  if (title.length < 3) return { error: "عنوان اطلاعیه را بنویسید (حداقل ۳ حرف)." };
  if (title.length > 120) return { error: "عنوان طولانی است؛ کوتاه‌ترش کنید." };
  if (href && !href.startsWith("/")) {
    return { error: "لینک باید داخلی باشد و با / شروع شود؛ مثلاً /plans" };
  }
  if (!(audience in AUDIENCE_LABEL)) return { error: "مخاطب اطلاعیه درست انتخاب نشده است." };

  const result = await announceToUsers({ audience, title, body, href, push: withPush });
  if (!result.users) return { error: `کاربری در گروه «${AUDIENCE_LABEL[audience]}» نیست.` };

  await logAdmin("announcement_sent", title, `${result.users} کاربر`);
  revalidatePath("/admin/announce");
  revalidatePath("/dashboard", "layout");

  const pushNote = withPush
    ? result.pushed
      ? ` و روی ${faNum(result.pushed)} دستگاه پوش شد`
      : " (اعلان پوش به هیچ دستگاهی نرسید؛ کسی آن را روشن نکرده است)"
    : "";

  return {
    success: `اطلاعیه برای ${faNum(result.users)} کاربر ثبت شد${pushNote}. کاربران آن را در زنگ اعلان‌ها می‌بینند.`,
  };
}

/* --------------------- انتقال سرویس بین سرورها --------------------- */

/** انتقال یک سرویس به سرور دیگر با حفظ حجم باقی‌مانده و تاریخ انقضا */
export async function migrateServiceAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const panelId = str(formData, "panelId");
  if (!panelId) return { error: "سرور مقصد را انتخاب کنید." };

  const service = await db.service.findUnique({ where: { id }, include: { user: true } });
  if (!service) return { error: "سرویس پیدا نشد." };

  try {
    const result = await migrateService(id, panelId);
    await logAdmin("service_migrated", service.user.email, `${result.fromPanel} → ${result.toPanel}`);
    await notifyUser({
      userId: service.userId,
      kind: "migrated",
      title: "سرویس شما به سرور تازه منتقل شد",
      body: "حجم باقی‌مانده و تاریخ انقضا سر جای خودشان هستند، ولی لینک اشتراک عوض شده است؛ لینک تازه را از پنل کاربری بردارید یا در برنامه یک بار Update بزنید.",
      href: `/dashboard/services/${service.id}`,
      serviceId: service.id,
    });
    revalidatePath("/admin/services");
    revalidatePath("/admin/monitor");
    revalidatePath(`/admin/users/${service.userId}`);

    const notes: string[] = [];
    if (!result.usageFromPanel) notes.push("سرور قبلی پاسخ نداد، پس آمار از دیتابیس برداشته شد");
    if (!result.oldRemoved) notes.push("کلاینت قدیمی روی سرور قبلی پاک نشد");

    const volume = result.remainingBytes ? formatBytes(result.remainingBytes) : "نامحدود";
    return {
      success:
        `سرویس از «${result.fromPanel}» به «${result.toPanel}» منتقل شد (باقی‌مانده: ${volume}).` +
        (notes.length ? ` توجه: ${notes.join("؛ ")}.` : "") +
        " به کاربر هم اطلاع داده شد که لینک اشتراکش عوض شده است.",
    };
  } catch (err) {
    return { error: `انتقال سرویس ناموفق بود: ${(err as Error).message}` };
  }
}

/** انتقال همهٔ سرویس‌های یک سرور (مثلاً سرور خراب) به سرور دیگر */
export async function migratePanelServicesAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const fromId = str(formData, "fromId");
  const panelId = str(formData, "panelId");
  if (!fromId || !panelId) return { error: "سرور مبدأ و مقصد را انتخاب کنید." };
  if (fromId === panelId) return { error: "سرور مبدأ و مقصد یکی است." };

  const [from, to] = await Promise.all([
    db.panel.findUnique({ where: { id: fromId } }),
    db.panel.findUnique({ where: { id: panelId } }),
  ]);
  if (!from || !to) return { error: "سرور پیدا نشد." };

  const services = await db.service.findMany({
    where: { panelId: fromId, status: { in: ["active", "disabled"] } },
    include: { user: true },
  });
  if (!services.length) return { error: `سرویس فعالی روی «${from.name}» نیست.` };

  let moved = 0;
  const failed: string[] = [];

  for (const service of services) {
    try {
      await migrateService(service.id, panelId);
      moved += 1;
      await notifyUser({
        userId: service.userId,
        kind: "migrated",
        title: "سرویس شما به سرور تازه منتقل شد",
        body: "حجم باقی‌مانده و تاریخ انقضا سر جای خودشان هستند، ولی لینک اشتراک عوض شده است؛ لینک تازه را از پنل کاربری بردارید یا در برنامه یک بار Update بزنید.",
        href: `/dashboard/services/${service.id}`,
        serviceId: service.id,
      });
    } catch (err) {
      failed.push(`${service.clientEmail}: ${(err as Error).message}`);
    }
  }

  await logAdmin("panel_services_migrated", `${from.name} → ${to.name}`, `${moved} سرویس`);
  revalidatePath("/admin/services");
  revalidatePath("/admin/monitor");

  if (!moved) return { error: `هیچ سرویسی منتقل نشد. ${failed[0] ?? ""}`.trim() };
  return {
    success:
      `${faNum(moved)} سرویس از «${from.name}» به «${to.name}» منتقل شد.` +
      (failed.length ? ` ${faNum(failed.length)} سرویس منتقل نشد (${failed[0]}).` : "") +
      " برای همهٔ کاربرها اعلان فرستاده شد.",
  };
}

/* ------------------------ کاربر ویژه و نمایندگی ------------------------ */

/** کاربر ویژه: روش‌های پرداختِ «فقط ویژه» (مثل کارت‌به‌کارت) برایش باز می‌شود */
export async function toggleVipAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const user = await db.user.findUnique({ where: { id } });
  if (!user) return { error: "کاربر پیدا نشد." };

  const updated = await db.user.update({
    where: { id },
    data: { isVip: !user.isVip, vipNote: str(formData, "vipNote") || user.vipNote },
  });
  await logAdmin(updated.isVip ? "user_vip_on" : "user_vip_off", user.email);
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
  return {
    success: updated.isVip
      ? `${user.email} کاربر ویژه شد؛ شماره کارت برای او نمایش داده می‌شود.`
      : `${user.email} از فهرست کاربران ویژه خارج شد.`,
  };
}

/** نقش پشتیبانی: دسترسی محدود به تیکت‌ها، سرویس‌ها و کاربران */
export async function toggleSupportAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const user = await db.user.findUnique({ where: { id } });
  if (!user) return { error: "کاربر پیدا نشد." };
  if (user.role === "admin") return { error: "این حساب مدیر است؛ نقشش از اینجا عوض نمی‌شود." };

  const nowSupport = user.role !== "support";
  await db.user.update({ where: { id }, data: { role: nowSupport ? "support" : "user" } });
  await logAdmin(nowSupport ? "user_support_on" : "user_support_off", user.email);
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);

  return {
    success: nowSupport
      ? `${user.email} پشتیبان شد: تیکت‌ها، سرویس‌ها، سفارش‌ها و کاربران را می‌بیند، ولی به سرورها، پرداخت‌ها، پشتیبان‌گیری و تنظیمات دسترسی ندارد.`
      : `${user.email} دیگر پشتیبان نیست و به پنل مدیریت دسترسی ندارد.`,
  };
}

/** فعال/غیرفعال کردن نمایندگی و تنظیم درصد تخفیف */
export async function saveResellerAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const user = await db.user.findUnique({ where: { id } });
  if (!user) return { error: "کاربر پیدا نشد." };

  const enabled = checked(formData, "isReseller");
  const discount = Math.min(90, Math.max(0, num(formData, "resellerOff", user.resellerOff)));

  await db.user.update({
    where: { id },
    data: {
      isReseller: enabled,
      resellerOff: discount,
      resellerName: str(formData, "resellerName") || null,
    },
  });

  await logAdmin(enabled ? "reseller_on" : "reseller_off", user.email, `${discount}٪ تخفیف`);
  if (enabled && !user.isReseller) {
    await notifyUser({
      userId: user.id,
      kind: "announcement",
      title: "پنل نمایندگی شما فعال شد",
      body: `از این پس با ${faNum(discount)}٪ تخفیف می‌توانید برای مشتری‌های خودتان سرویس بسازید.`,
      href: "/reseller",
    });
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/resellers");
  revalidatePath(`/admin/users/${id}`);
  return {
    success: enabled
      ? `نمایندگی ${user.email} با ${faNum(discount)}٪ تخفیف فعال است.`
      : `نمایندگی ${user.email} خاموش شد.`,
  };
}

/* --------------------------- روش‌های پرداخت --------------------------- */

/** افزودن یا ویرایش یک درگاه پرداخت آنلاین */
export async function saveGatewayAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const driver = str(formData, "driver") || "zarinpal";
  if (!findDriver(driver)) return { error: "این درایور پشتیبانی نمی‌شود." };

  const customRaw = str(formData, "custom");
  if (driver === "custom" && customRaw) {
    try {
      JSON.parse(customRaw);
    } catch {
      return { error: "تنظیمات JSON درگاه دلخواه معتبر نیست." };
    }
  }

  const data = {
    driver,
    label: str(formData, "label") || (findDriver(driver)?.label ?? driver),
    apiKey: str(formData, "apiKey"),
    apiSecret: str(formData, "apiSecret"),
    sandbox: checked(formData, "sandbox"),
    isActive: checked(formData, "isActive"),
    minAmount: Math.max(0, num(formData, "minAmount", 10_000)),
    maxAmount: Math.max(0, num(formData, "maxAmount", 0)),
    sortOrder: num(formData, "sortOrder", 0),
    note: str(formData, "note") || null,
    config: JSON.stringify({
      feeMode: str(formData, "feeMode") || "buyer",
      ...(customRaw ? { custom: JSON.parse(customRaw) as unknown } : {}),
    }),
  };

  const row = id
    ? await db.gateway.update({ where: { id }, data })
    : await db.gateway.create({ data });

  await logAdmin("gateway_saved", row.label, row.driver);
  revalidatePath("/admin/payments");
  flash(
    "/admin/payments",
    gatewayUsable(row)
      ? `درگاه «${row.label}» ذخیره و آماده استفاده است.`
      : `درگاه «${row.label}» ذخیره شد، ولی هنوز کلید یا تنظیمات لازم را ندارد.`,
  );
}

export async function deleteGatewayAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const row = await db.gateway.findUnique({ where: { id } });
  if (!row) return { error: "درگاه پیدا نشد." };

  // سفارش‌های قبلی نباید بشکنند؛ فقط ارتباطشان قطع می‌شود
  await db.order.updateMany({ where: { gatewayId: id }, data: { gatewayId: null } });
  await db.gateway.delete({ where: { id } });
  await logAdmin("gateway_deleted", row.label, row.driver);
  revalidatePath("/admin/payments");
  flash("/admin/payments", `درگاه «${row.label}» حذف شد.`);
}

export async function toggleGatewayAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const row = await db.gateway.findUnique({ where: { id } });
  if (!row) return { error: "درگاه پیدا نشد." };

  const updated = await db.gateway.update({
    where: { id },
    data: { isActive: !row.isActive },
  });
  await logAdmin("gateway_saved", row.label, updated.isActive ? "فعال" : "غیرفعال");
  revalidatePath("/admin/payments");
  flash("/admin/payments", updated.isActive ? `درگاه «${row.label}» فعال شد.` : `درگاه «${row.label}» خاموش شد.`);
}

/** افزودن یا ویرایش آدرس کیف پول ارز دیجیتال */
export async function saveWalletAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const address = str(formData, "address");
  if (address.length < 25) return { error: "آدرس کیف پول معتبر نیست." };

  const network = str(formData, "network") || "trc20";
  if (network === "trc20" && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
    return { error: "آدرس TRC20 باید با T شروع شود و ۳۴ کاراکتر باشد." };
  }

  const data = {
    network,
    symbol: str(formData, "symbol") || "USDT",
    address,
    label: str(formData, "label"),
    isActive: checked(formData, "isActive"),
    sortOrder: num(formData, "sortOrder", 0),
    note: str(formData, "note") || null,
  };

  const row = id
    ? await db.cryptoWallet.update({ where: { id }, data })
    : await db.cryptoWallet.create({ data });

  await logAdmin("wallet_saved", `${row.symbol}-${row.network}`, row.address);
  revalidatePath("/admin/payments");
  flash("/admin/payments", "آدرس کیف پول ذخیره شد.");
}

export async function deleteWalletAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
  const row = await db.cryptoWallet.findUnique({ where: { id } });
  if (!row) return { error: "آدرس پیدا نشد." };

  await db.cryptoWallet.delete({ where: { id } });
  await logAdmin("wallet_deleted", row.address);
  revalidatePath("/admin/payments");
  flash("/admin/payments", "آدرس کیف پول حذف شد.");
}

/** گرفتن نرخ تازهٔ تتر از منبع تنظیم‌شده */
export async function refreshRateAction(_prev: AdminState, _formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const rate = await usdtRate(true);
  revalidatePath("/admin/payments");
  return rate.toman > 0
    ? {
        success:
          `نرخ به‌روز شد: هر تتر ${toman(rate.toman)}` +
          (rate.source === "auto" ? " (از منبع خودکار)" : " (نرخ دستی)"),
      }
    : { error: "نرخ تتر گرفته نشد؛ نرخ دستی را در تنظیمات وارد کنید." };
}

/** انتقال تنظیمات تک‌درگاهی قدیمی به جدول درگاه‌ها */
export async function importLegacyGatewayAction(
  _prev: AdminState,
  _formData: FormData,
): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const moved = await migrateLegacyGateway();
  revalidatePath("/admin/payments");
  return moved
    ? { success: "درگاه تنظیم‌شده در تنظیمات قدیمی، به فهرست درگاه‌ها اضافه شد." }
    : { error: "چیزی برای انتقال پیدا نشد." };
}

/* ------------------------------ پایش سرورها ------------------------------ */

/** بررسی سلامت همهٔ سرورها همین حالا */
export async function checkAllPanelsAction(_prev: AdminState, _formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const { checked, down } = await runPanelChecks();
  await logAdmin("panels_checked", `${checked} سرور`, down ? `${down} خراب` : "همه سالم");
  revalidatePath("/admin/monitor");
  revalidatePath("/admin/panels");
  return {
    success: down
      ? `${faNum(checked)} سرور بررسی شد؛ ${faNum(down)} سرور پاسخ نداد.`
      : `${faNum(checked)} سرور بررسی شد و همه سالم بودند.`,
  };
}

/** بررسی سلامت یک سرور */
export async function checkPanelAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const panel = await db.panel.findUnique({ where: { id: str(formData, "id") } });
  if (!panel) return { error: "سرور پیدا نشد." };

  const health = await checkPanel(panel);
  revalidatePath("/admin/monitor");
  return health.ok
    ? { success: `${panel.name}: سالم است (${faNum(health.latencyMs)} میلی‌ثانیه، ${health.message}).` }
    : { error: `${panel.name}: پاسخ نداد — ${health.message}` };
}

/** بازگرداندن دستی سرور به چرخهٔ فروش (بدون انتظار برای بررسی بعدی) */
export async function resumePanelSalesAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const panel = await db.panel.findUnique({ where: { id: str(formData, "id") } });
  if (!panel) return { error: "سرور پیدا نشد." };

  await db.panel.update({
    where: { id: panel.id },
    data: { autoDisabled: false, failCount: 0 },
  });
  await logAdmin("panel_resumed", panel.name);
  revalidatePath("/admin/monitor");
  revalidatePath("/admin/panels");
  return { success: `فروش روی «${panel.name}» دوباره فعال شد.` };
}

/* ----------------------------- اقدام‌های گروهی ----------------------------- */

/** همگام‌سازی مصرف همه سرویس‌ها با پنل */
export async function syncAllServicesAction(_prev: AdminState, _formData: FormData): Promise<AdminState> {
  const denied = await guardStaff();
  if (denied) return denied;

  const services = await db.service.findMany({ select: { id: true } });
  let ok = 0;
  for (const service of services) {
    try {
      await syncService(service.id, true);
      ok += 1;
    } catch {
      /* سرویس‌های ناموفق نادیده گرفته می‌شوند */
    }
  }
  await logAdmin("services_synced", `${ok} سرویس`);
  revalidatePath("/admin/services");
  return { success: `${ok} سرویس از ${services.length} سرویس به‌روزرسانی شد.` };
}

/** حذف سرویس‌های منقضی‌شده از پنل و سایت */
export async function pruneExpiredServicesAction(_prev: AdminState, _formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const expired = await db.service.findMany({
    where: { status: "expired", expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
    select: { id: true },
  });
  let removed = 0;
  for (const service of expired) {
    try {
      await removeService(service.id);
      removed += 1;
    } catch {
      /* ادامه می‌دهیم */
    }
  }
  await logAdmin("services_pruned", `${removed} سرویس`);
  revalidatePath("/admin/services");
  return {
    success: removed
      ? `${removed} سرویس منقضی (بیش از ۷ روز) حذف شد.`
      : "سرویس منقضی‌ای برای حذف پیدا نشد.",
  };
}

/** تست اتصال همه سرورها */
export async function testAllPanelsAction(_prev: AdminState, _formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const panels = await db.panel.findMany();
  if (!panels.length) return { error: "سروری ثبت نشده است." };

  const lines: string[] = [];
  for (const panel of panels) {
    const result = await panelClient(panel).testConnection();
    await db.panel.update({
      where: { id: panel.id },
      data: { lastError: result.ok ? null : result.message, lastCheckAt: new Date() },
    });
    lines.push(`${panel.flag} ${panel.name}: ${result.ok ? "سالم ✅" : `خطا — ${result.message}`}`);
  }
  await logAdmin("panel_tested", `${panels.length} سرور`);
  revalidatePath("/admin/panels");
  revalidatePath("/admin");
  return { success: lines.join(" | ") };
}

/** ارسال پیام آزمایشی تلگرام */
export async function testTelegramAction(_prev: AdminState, _formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const { getSettings } = await import("@/lib/settings");
  const settings = await getSettings();
  if (!settings.telegram_bot_token || !settings.telegram_admin_chat_id) {
    return { error: "ابتدا توکن ربات و آیدی چت را در همین صفحه ذخیره کنید." };
  }

  await notifyTelegram(
    `🔔 پیام آزمایشی از ${settings.site_name}\nاگر این پیام را می‌بینید، اطلاع‌رسانی تلگرام درست کار می‌کند.`,
    "system",
  );
  await logAdmin("telegram_tested");
  return { success: "پیام آزمایشی ارسال شد. تلگرام خود را بررسی کنید." };
}

/** افزایش یا کاهش دستی موجودی کیف پول کاربر */
export async function adjustWalletAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const userId = str(formData, "userId");
  const amount = num(formData, "amount");
  const note = str(formData, "note") || "تنظیم توسط مدیر";
  if (!amount) return { error: "مبلغ را وارد کنید (منفی برای کسر)." };

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "کاربر پیدا نشد." };

  try {
    if (amount > 0) {
      await creditWallet(userId, amount, "admin", note);
      await notifyUser({
        userId,
        kind: "wallet_credit",
        title: "کیف پول شما شارژ شد",
        body: `${toman(amount)} توسط پشتیبانی اضافه شد. (${note})`,
        href: "/dashboard/wallet",
      });
    } else {
      await debitWallet(userId, Math.abs(amount), "admin", note);
    }
  } catch (err) {
    return { error: (err as Error).message };
  }

  await logAdmin("wallet_adjusted", user.email, `${amount > 0 ? "+" : ""}${amount} — ${note}`);
  revalidatePath(`/admin/users/${userId}`);
  return { success: `کیف پول ${user.email} به‌روزرسانی شد.` };
}

/** فعال‌سازی وب‌هوک ربات تلگرام تا بتوان از تلگرام به تیکت‌ها پاسخ داد */
export async function setupTelegramWebhookAction(_prev: AdminState, _formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const { getSettings, saveSettings: persist } = await import("@/lib/settings");
  const settings = await getSettings();

  if (!settings.telegram_bot_token?.trim()) {
    return { error: "ابتدا توکن ربات را وارد و ذخیره کنید." };
  }

  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  if (!appUrl.startsWith("https://")) {
    return {
      error:
        "تلگرام فقط آدرس HTTPS را می‌پذیرد. ابتدا دامنه و SSL را تنظیم کنید (bash install.sh --ssl --domain=…) و APP_URL را روی همان دامنه بگذارید.",
    };
  }

  const { randomBytes } = await import("node:crypto");
  const secret = settings.telegram_webhook_secret?.trim() || randomBytes(16).toString("hex");
  await persist({ telegram_webhook_secret: secret });

  const result = await telegramApi("setWebhook", {
    url: `${appUrl}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });

  if (!result.ok) {
    return { error: `فعال‌سازی ناموفق بود: ${result.description ?? "خطای نامشخص"}` };
  }

  await notifyTelegram(
    "🤖 ربات پشتیبانی فعال شد. حالا می‌توانید اعلان هر تیکت را ریپلای کنید تا پاسخ برای مشتری ثبت شود. /help",
    "system",
  );
  await logAdmin("telegram_webhook_set", appUrl);
  revalidatePath("/admin/settings");
  return { success: "ربات فعال شد. یک پیام راهنما در تلگرام برایتان فرستادیم." };
}
