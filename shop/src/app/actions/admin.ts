"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { saveSettings } from "@/lib/settings";
import { notifyAdmin } from "@/lib/telegram";
import { fulfillOrder, panelClient, removeService, setServiceEnabled, syncService } from "@/lib/provision";
import { toman } from "@/lib/format";

export type AdminState = { error?: string; success?: string };

async function guard(): Promise<AdminState | null> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fadmin");
  if (user.role !== "admin") return { error: "دسترسی مدیریتی ندارید." };
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

  try {
    await fulfillOrder(order.id);
  } catch (err) {
    const message = (err as Error).message || "خطای نامشخص";
    await db.order.update({ where: { id: order.id }, data: { adminNote: `خطای تحویل: ${message}` } });
    return { error: `تحویل سرویس ناموفق بود: ${message}` };
  }

  if (order.discountId) {
    await db.discount.update({
      where: { id: order.discountId },
      data: { usedCount: { increment: 1 } },
    });
  }

  await notifyAdmin(
    `✅ سفارش ${order.code} تأیید و سرویس «${order.plan.title}» برای ${order.user.email} ساخته شد.`,
    "system",
  );

  revalidatePath("/admin/orders");
  revalidatePath("/dashboard");
  flash("/admin/orders?status=pending_review", `سفارش ${order.code} تأیید و سرویس تحویل شد.`);
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
  revalidatePath("/admin/orders");
  flash("/admin/orders?status=pending_review", `سفارش ${order.code} رد شد.`);
}

/* ------------------------------------ پلن‌ها ---------------------------------- */

export async function savePlanAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;

  const id = str(formData, "id");
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

  if (id) await db.plan.update({ where: { id }, data });
  else await db.plan.create({ data });

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
  let inboundId = panel.inboundId;
  let moved = false;

  if (template) {
    const holder = result.inbounds.find((i) =>
      parseInboundClients(i).some((c) => String(c.email ?? "").toLowerCase() === template.toLowerCase()),
    );
    if (!holder) {
      const all = result.inbounds
        .flatMap((i) => parseInboundClients(i).map((c) => String(c.email ?? "")))
        .filter(Boolean);
      return {
        error:
          `اتصال برقرار شد اما کلاینت الگو با نام «${template}» در هیچ اینباندی پیدا نشد. ` +
          `کلاینت‌های موجود: ${all.join("، ") || "—"}`,
      };
    }
    if (holder.id !== panel.inboundId) {
      inboundId = holder.id;
      moved = true;
      await db.panel.update({ where: { id: panel.id }, data: { inboundId } });
      revalidatePath("/admin/panels");
    }
  } else if (!result.inbounds.some((i) => i.id === panel.inboundId)) {
    return { error: `اتصال برقرار شد اما اینباند #${panel.inboundId} در این پنل نیست. اینباندها: ${list}` };
  }

  const selected = result.inbounds.find((i) => i.id === inboundId);
  const names = selected
    ? parseInboundClients(selected)
        .map((c) => String(c.email ?? ""))
        .filter(Boolean)
    : [];

  const templateNote = template
    ? `کلاینت الگو «${template}» در اینباند #${inboundId} پیدا شد ✅` +
      (moved ? " (شناسه اینباند خودکار اصلاح شد)" : "")
    : "کلاینت الگو تعیین نشده است؛ کانفیگ‌ها با تنظیمات پیش‌فرض ساخته می‌شوند.";

  const tokenNote =
    result.generation === "v3" && result.authMode !== "token"
      ? " | پیشنهاد: این پنل نسخه ۳ است؛ بهتر است به‌جای نام کاربری از «توکن API» استفاده کنید."
      : "";

  return {
    success:
      `${result.message} | اینباندها: ${list} | ${templateNote}` +
      (names.length ? ` | کلاینت‌های اینباند: ${names.join("، ")}` : "") +
      tokenNote,
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
  revalidatePath("/admin/users");
  flash("/admin/users", user.isBlocked ? "کاربر آزاد شد." : "کاربر مسدود شد.");
}

export async function resetTrialFlagAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;
  const id = str(formData, "id");
  await db.user.update({ where: { id }, data: { trialUsedAt: null } });
  revalidatePath("/admin/users");
  flash("/admin/users", "امکان دریافت تست رایگان برای این کاربر آزاد شد.");
}

/* --------------------------------- سرویس‌ها ---------------------------------- */

export async function syncServiceAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
  if (denied) return denied;
  const id = str(formData, "id");
  await syncService(id, true);
  revalidatePath("/admin/services");
  flash("/admin/services", "وضعیت سرویس به‌روزرسانی شد.");
}

export async function toggleServiceAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const denied = await guard();
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
