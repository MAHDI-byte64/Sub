import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { Panel, Plan, Service } from "@prisma/client";
import { db } from "./db";
import { GB } from "./format";
import { asNum, getSettings } from "./settings";
import { XuiClient, XuiError, type XuiClientSpec } from "./xui";
import { buildClientLink, buildSubscriptionUrl, resolveHost } from "./vless";

export function panelClient(panel: Panel): XuiClient {
  return new XuiClient({
    url: panel.url,
    username: panel.username,
    password: panel.password,
    insecure: true,
  });
}

/** انتخاب پنل: پنل انتخابی کاربر، وگرنه کم‌بارترین پنل فعال */
export async function pickPanel(preferredPanelId?: string | null): Promise<Panel> {
  if (preferredPanelId) {
    const panel = await db.panel.findFirst({ where: { id: preferredPanelId, isActive: true } });
    if (panel) return panel;
  }
  const panels = await db.panel.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (!panels.length) throw new XuiError("هیچ سروری فعال نیست. لطفاً با پشتیبانی تماس بگیرید.");

  const counts = await db.service.groupBy({
    by: ["panelId"],
    where: { status: "active" },
    _count: { _all: true },
  });
  const load = new Map(counts.map((c) => [c.panelId, c._count._all]));
  const available = panels.filter((p) => p.capacity === 0 || (load.get(p.id) ?? 0) < p.capacity);
  const pool = available.length ? available : panels;
  return pool.reduce((best, p) => ((load.get(p.id) ?? 0) < (load.get(best.id) ?? 0) ? p : best), pool[0]);
}

function makeClientEmail(prefix: string): string {
  return `${prefix}-${randomBytes(3).toString("hex")}`.toLowerCase();
}

function planBytes(volumeGb: number): number {
  return volumeGb > 0 ? Math.round(volumeGb * GB) : 0;
}

function expiryFrom(days: number, from = Date.now()): number {
  return days > 0 ? from + days * 86_400_000 : 0;
}

type SpecInput = {
  uuid: string;
  email: string;
  subId: string;
  totalBytes: number;
  expiryTime: number;
  deviceLimit: number;
  flow: string;
};

function toSpec(input: SpecInput): XuiClientSpec {
  return {
    id: input.uuid,
    email: input.email,
    subId: input.subId,
    totalGB: Math.max(0, Math.round(input.totalBytes)),
    expiryTime: Math.max(0, Math.round(input.expiryTime)),
    limitIp: Math.max(0, input.deviceLimit),
    flow: input.flow || "",
    enable: true,
    tgId: "",
    reset: 0,
  };
}

/** ساخت سرویس تازه روی پنل و ثبت آن در دیتابیس */
export type PlanShape = Pick<Plan, "volumeGb" | "days" | "deviceLimit">;

export async function createServiceOnPanel(params: {
  userId: string;
  plan: PlanShape;
  planId: string | null;
  panel: Panel;
  orderId?: string | null;
  isTrial?: boolean;
  emailPrefix: string;
  remark: string;
}): Promise<Service> {
  const { userId, plan, planId, panel, orderId, isTrial = false, emailPrefix, remark } = params;
  const client = panelClient(panel);

  const uuid = randomUUID();
  const subId = randomBytes(8).toString("hex");
  const email = makeClientEmail(emailPrefix);
  const totalBytes = planBytes(plan.volumeGb);
  const expiryTime = expiryFrom(plan.days);

  await client.addClient(
    panel.inboundId,
    toSpec({
      uuid,
      email,
      subId,
      totalBytes,
      expiryTime,
      deviceLimit: plan.deviceLimit,
      flow: panel.flow,
    }),
  );

  return db.service.create({
    data: {
      userId,
      planId,
      panelId: panel.id,
      orderId: orderId ?? null,
      remark,
      clientEmail: email,
      uuid,
      subId,
      inboundId: panel.inboundId,
      totalBytes,
      usedBytes: 0,
      deviceLimit: plan.deviceLimit,
      expiresAt: expiryTime ? new Date(expiryTime) : null,
      isTrial,
      status: "active",
      lastSyncAt: new Date(),
    },
  });
}

/** تمدید سرویس موجود: افزودن حجم و زمان روی همان کلاینت پنل */
export async function renewServiceOnPanel(service: Service, plan: Plan): Promise<Service> {
  const panel = await db.panel.findUniqueOrThrow({ where: { id: service.panelId } });
  const client = panelClient(panel);

  const stat = await client.getClientTraffics(service.clientEmail).catch(() => null);
  const currentTotal = stat?.total ?? service.totalBytes;
  const currentExpiry = stat?.expiryTime ?? (service.expiresAt ? service.expiresAt.getTime() : 0);

  const addBytes = planBytes(plan.volumeGb);
  // اگر یکی از دو طرف نامحدود باشد، نتیجه نامحدود می‌ماند
  const newTotal = currentTotal === 0 || addBytes === 0 ? 0 : currentTotal + addBytes;
  const base = currentExpiry && currentExpiry > Date.now() ? currentExpiry : Date.now();
  const newExpiry = plan.days > 0 ? (currentExpiry === 0 ? 0 : expiryFrom(plan.days, base)) : 0;

  const spec = toSpec({
    uuid: service.uuid,
    email: service.clientEmail,
    subId: service.subId,
    totalBytes: newTotal,
    expiryTime: newExpiry,
    deviceLimit: plan.deviceLimit || service.deviceLimit,
    flow: panel.flow,
  });

  try {
    await client.updateClient(service.inboundId, service.uuid, spec);
  } catch (err) {
    if (!(err instanceof XuiError)) throw err;
    // اگر کلاینت روی پنل حذف شده باشد، دوباره می‌سازیمش
    await client.addClient(service.inboundId, spec);
  }

  return db.service.update({
    where: { id: service.id },
    data: {
      planId: plan.id,
      totalBytes: newTotal,
      expiresAt: newExpiry ? new Date(newExpiry) : null,
      deviceLimit: plan.deviceLimit || service.deviceLimit,
      status: "active",
      usedBytes: (stat?.up ?? 0) + (stat?.down ?? 0),
      lastSyncAt: new Date(),
    },
  });
}

/** تحویل سفارش تأییدشده: خرید جدید یا تمدید */
export async function fulfillOrder(orderId: string): Promise<Service> {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { plan: true, user: true },
  });

  if (order.renewServiceId) {
    const service = await db.service.findUniqueOrThrow({ where: { id: order.renewServiceId } });
    const renewed = await renewServiceOnPanel(service, order.plan);
    await db.order.update({ where: { id: order.id }, data: { status: "approved", reviewedAt: new Date() } });
    return renewed;
  }

  const panel = await pickPanel(order.panelId);
  const settings = await getSettings();
  const service = await createServiceOnPanel({
    userId: order.userId,
    plan: order.plan,
    planId: order.planId,
    panel,
    orderId: order.id,
    emailPrefix: order.code.toLowerCase(),
    remark: `${settings.site_name} | ${order.plan.title}`,
  });
  await db.order.update({
    where: { id: order.id },
    data: { status: "approved", reviewedAt: new Date(), panelId: panel.id },
  });
  return service;
}

/** ساخت اکانت تست رایگان */
export async function createTrialService(userId: string, panelId?: string | null): Promise<Service> {
  const settings = await getSettings();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.trialUsedAt) throw new XuiError("شما قبلاً اکانت تست رایگان دریافت کرده‌اید.");

  const panel = await pickPanel(panelId);
  const trialPlan: PlanShape = {
    volumeGb: asNum(settings.trial_volume_gb, 1),
    days: asNum(settings.trial_days, 1),
    deviceLimit: asNum(settings.trial_device_limit, 1),
  };

  const service = await createServiceOnPanel({
    userId,
    plan: trialPlan,
    planId: null,
    panel,
    isTrial: true,
    emailPrefix: `trial-${randomBytes(3).toString("hex")}`,
    remark: `${settings.site_name} | تست رایگان`,
  });

  await db.user.update({ where: { id: userId }, data: { trialUsedAt: new Date() } });
  return service;
}

/** به‌روزرسانی مصرف سرویس از روی پنل (با throttle) */
export async function syncService(serviceId: string, force = false): Promise<Service> {
  const service = await db.service.findUniqueOrThrow({
    where: { id: serviceId },
    include: { panel: true },
  });
  const fresh = service.lastSyncAt && Date.now() - service.lastSyncAt.getTime() < 45_000;
  if (fresh && !force) return service;

  try {
    const client = panelClient(service.panel);
    const stat = await client.getClientTraffics(service.clientEmail);
    if (!stat) {
      return db.service.update({
        where: { id: service.id },
        data: { lastSyncAt: new Date() },
      });
    }
    const used = (stat.up || 0) + (stat.down || 0);
    const expiresAt = stat.expiryTime ? new Date(stat.expiryTime) : null;
    const expired =
      (expiresAt && expiresAt.getTime() < Date.now()) ||
      (stat.total > 0 && used >= stat.total) ||
      !stat.enable;

    return db.service.update({
      where: { id: service.id },
      data: {
        usedBytes: used,
        totalBytes: stat.total || 0,
        expiresAt,
        status: expired ? "expired" : "active",
        lastSyncAt: new Date(),
      },
    });
  } catch {
    return db.service.update({ where: { id: service.id }, data: { lastSyncAt: new Date() } });
  }
}

export async function syncUserServices(userId: string): Promise<void> {
  const services = await db.service.findMany({ where: { userId } });
  await Promise.all(services.map((s) => syncService(s.id).catch(() => null)));
}

/** لینک‌های اتصال یک سرویس (ساب + کانفیگ مستقیم) */
export async function serviceLinks(serviceId: string): Promise<{
  subscription: string;
  configs: { label: string; uri: string }[];
  error?: string;
}> {
  const service = await db.service.findUniqueOrThrow({
    where: { id: serviceId },
    include: { panel: true },
  });
  const subscription = buildSubscriptionUrl(service.panel.subBase, service.panel.url, service.subId);
  try {
    const client = panelClient(service.panel);
    const inbound = await client.getInbound(service.inboundId);
    const host = resolveHost(service.panel.hostOverride, inbound.listen, service.panel.url);
    const link = buildClientLink(inbound, service.uuid, service.remark, host, service.panel.flow);
    return { subscription, configs: link ? [link] : [] };
  } catch (err) {
    return { subscription, configs: [], error: (err as Error).message };
  }
}

/** غیرفعال/فعال کردن سرویس روی پنل */
export async function setServiceEnabled(serviceId: string, enabled: boolean): Promise<void> {
  const service = await db.service.findUniqueOrThrow({
    where: { id: serviceId },
    include: { panel: true },
  });
  const client = panelClient(service.panel);
  const spec = toSpec({
    uuid: service.uuid,
    email: service.clientEmail,
    subId: service.subId,
    totalBytes: service.totalBytes,
    expiryTime: service.expiresAt ? service.expiresAt.getTime() : 0,
    deviceLimit: service.deviceLimit,
    flow: service.panel.flow,
  });
  spec.enable = enabled;
  await client.updateClient(service.inboundId, service.uuid, spec);
  await db.service.update({
    where: { id: service.id },
    data: { status: enabled ? "active" : "disabled" },
  });
}

/** حذف کامل سرویس از پنل و دیتابیس */
export async function removeService(serviceId: string): Promise<void> {
  const service = await db.service.findUniqueOrThrow({
    where: { id: serviceId },
    include: { panel: true },
  });
  try {
    await panelClient(service.panel).deleteClient(service.inboundId, service.uuid);
  } catch {
    // اگر روی پنل نبود، فقط از دیتابیس حذف می‌کنیم
  }
  await db.service.delete({ where: { id: service.id } });
}
