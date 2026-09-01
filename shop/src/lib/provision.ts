import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { Panel, Plan, Service } from "@prisma/client";
import { db } from "./db";
import { GB } from "./format";
import { asNum, getSettings } from "./settings";
import { XuiClient, XuiError, parseInboundClients, type XuiRawClient } from "./xui";
import { buildClientLink, buildSubscriptionUrl, resolveHost } from "./vless";

export function panelClient(panel: Panel): XuiClient {
  return new XuiClient({
    url: panel.url,
    username: panel.username,
    password: panel.password,
    apiToken: panel.apiToken,
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

/* -------------------------------------------------------------------------- */
/*                       ساخت کلاینت بر پایه «کلاینت الگو»                      */
/* -------------------------------------------------------------------------- */

export type PlanShape = Pick<Plan, "volumeGb" | "days" | "deviceLimit">;

type ClientOverrides = {
  uuid: string;
  email: string;
  subId: string;
  totalBytes: number;
  expiryTime: number;
  /** صفر یا منفی یعنی «از کلاینت الگو بردار» */
  deviceLimit: number;
  /** خالی یعنی «از کلاینت الگو بردار» */
  flow: string;
  enable?: boolean;
};

/**
 * کلاینت جدید را دقیقاً از روی کلاینت الگوی پنل می‌سازد و فقط فیلدهای
 * هویتی و سهمیه را عوض می‌کند؛ بقیه تنظیمات (flow، tgId، comment، security و …)
 * همان چیزی می‌ماند که مدیر روی پنل تعریف کرده است.
 */
export function buildClientFromTemplate(template: XuiRawClient | null, o: ClientOverrides): XuiRawClient {
  const client: XuiRawClient = { ...(template ?? {}) };

  client.id = o.uuid;
  client.email = o.email;
  client.subId = o.subId;
  client.totalGB = Math.max(0, Math.round(o.totalBytes));
  client.expiryTime = Math.max(0, Math.round(o.expiryTime));
  client.enable = o.enable ?? true;
  client.reset = 0;

  // محدودیت کاربر همزمان: مقدار پلن اولویت دارد، وگرنه مقدار الگو
  if (o.deviceLimit > 0) client.limitIp = o.deviceLimit;
  else if (typeof client.limitIp !== "number") client.limitIp = 0;

  // flow: مقدار تنظیم‌شده روی سرور اولویت دارد، وگرنه مقدار الگو
  if (o.flow) client.flow = o.flow;
  else if (typeof client.flow !== "string") client.flow = "";

  if (typeof client.tgId !== "string" && typeof client.tgId !== "number") client.tgId = "";

  return client;
}

/** فقط حروف و ارقام مجاز برای نام کلاینت */
function slug(input: string, max = 40): string {
  return (
    input
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max) || "user"
  );
}

/** جایگزینی متغیرهای الگوی نام‌گذاری */
export function renderClientName(
  pattern: string,
  vars: { template: string; code: string; user: string; rand: string },
): string {
  const result = (pattern || "{template}-{code}").replace(
    /\{(template|code|user|rand)\}/g,
    (_, key: keyof typeof vars) => vars[key] ?? "",
  );
  return slug(result.replace(/-{2,}/g, "-"), 60);
}

function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 0; i < 20; i += 1) {
    const candidate = slug(`${name}-${randomBytes(2).toString("hex")}`, 60);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  throw new XuiError("ساخت نام یکتا برای کلاینت ممکن نشد.");
}

function nameSet(clients: XuiRawClient[]): Set<string> {
  return new Set(clients.map((c) => String(c.email ?? "").toLowerCase()).filter(Boolean));
}

function findByEmail(clients: XuiRawClient[], email: string): XuiRawClient | undefined {
  return clients.find((c) => String(c.email ?? "").toLowerCase() === email.toLowerCase());
}

/**
 * کلاینت الگو را پیدا می‌کند.
 * اگر در اینباند تنظیم‌شده نبود، بقیه اینباندهای پنل هم جستجو می‌شوند تا مدیر
 * مجبور نباشد شناسه اینباند را دستی درست کند.
 */
export async function loadTemplate(
  client: XuiClient,
  panel: Panel,
): Promise<{ template: XuiRawClient | null; taken: Set<string>; inboundId: number }> {
  const wanted = panel.templateEmail?.trim();
  const inbound = await client.getInbound(panel.inboundId).catch((err: unknown) => {
    if (!wanted) throw err;
    return null;
  });

  const clients = inbound ? parseInboundClients(inbound) : [];
  if (!wanted) return { template: null, taken: nameSet(clients), inboundId: panel.inboundId };

  const template = findByEmail(clients, wanted);
  if (template) return { template, taken: nameSet(clients), inboundId: panel.inboundId };

  // جستجو در سایر اینباندهای همین پنل
  for (const other of await client.listInbounds()) {
    if (other.id === panel.inboundId) continue;
    const otherClients = parseInboundClients(other);
    const found = findByEmail(otherClients, wanted);
    if (found) return { template: found, taken: nameSet(otherClients), inboundId: other.id };
  }

  throw new XuiError(
    `کلاینت الگو با نام «${wanted}» در هیچ‌کدام از اینباندهای این پنل پیدا نشد. ` +
      `نام کلاینت الگو را در تنظیمات سرور اصلاح کنید یا آن کلاینت را در پنل بسازید.`,
  );
}

function planBytes(volumeGb: number): number {
  return volumeGb > 0 ? Math.round(volumeGb * GB) : 0;
}

function expiryFrom(days: number, from = Date.now()): number {
  return days > 0 ? from + days * 86_400_000 : 0;
}

/* -------------------------------------------------------------------------- */
/*                                تحویل سرویس                                 */
/* -------------------------------------------------------------------------- */

/** ساخت سرویس تازه روی پنل (کپی از کلاینت الگو) و ثبت آن در دیتابیس */
export async function createServiceOnPanel(params: {
  userId: string;
  userEmail: string;
  plan: PlanShape;
  planId: string | null;
  panel: Panel;
  orderId?: string | null;
  isTrial?: boolean;
  /** کد سفارش یا شناسه کوتاه برای نام‌گذاری */
  code: string;
  remark: string;
}): Promise<Service> {
  const { userId, userEmail, plan, planId, panel, orderId, isTrial = false, code, remark } = params;
  const client = panelClient(panel);
  const { template, taken, inboundId } = await loadTemplate(client, panel);

  // اگر کلاینت الگو در اینباند دیگری بود، تنظیمات سرور اصلاح می‌شود
  if (inboundId !== panel.inboundId) {
    await db.panel.update({ where: { id: panel.id }, data: { inboundId } });
  }

  const uuid = randomUUID();
  const subId = randomBytes(8).toString("hex");
  const totalBytes = planBytes(plan.volumeGb);
  const expiryTime = expiryFrom(plan.days);

  const name = uniqueName(
    renderClientName(panel.namePattern, {
      template: slug(panel.templateEmail?.trim() || panel.name, 24),
      code: slug(code, 24),
      user: slug(userEmail.split("@")[0] ?? "user", 24),
      rand: randomBytes(3).toString("hex"),
    }),
    taken,
  );

  const spec = buildClientFromTemplate(template, {
    uuid,
    email: name,
    subId,
    totalBytes,
    expiryTime,
    deviceLimit: plan.deviceLimit,
    flow: panel.flow,
  });

  await client.addClient(inboundId, spec);

  return db.service.create({
    data: {
      userId,
      planId,
      panelId: panel.id,
      orderId: orderId ?? null,
      remark,
      clientEmail: name,
      uuid,
      subId,
      inboundId,
      totalBytes,
      usedBytes: 0,
      deviceLimit: typeof spec.limitIp === "number" ? spec.limitIp : plan.deviceLimit,
      expiresAt: expiryTime ? new Date(expiryTime) : null,
      isTrial,
      status: "active",
      lastSyncAt: new Date(),
    },
  });
}

/** پیدا کردن کلاینت فعلی سرویس روی پنل */
async function findServiceClient(
  client: XuiClient,
  service: Service,
): Promise<XuiRawClient | null> {
  const clients = await client.listClients(service.inboundId).catch(() => [] as XuiRawClient[]);
  return (
    clients.find((c) => String(c.id ?? "") === service.uuid) ??
    clients.find((c) => String(c.email ?? "").toLowerCase() === service.clientEmail.toLowerCase()) ??
    null
  );
}

/** تمدید سرویس موجود: افزودن حجم و زمان روی همان کلاینت پنل */
export async function renewServiceOnPanel(service: Service, plan: Plan): Promise<Service> {
  const panel = await db.panel.findUniqueOrThrow({ where: { id: service.panelId } });
  const client = panelClient(panel);

  const current = await findServiceClient(client, service);
  const stat = await client.getClientTraffics(service.clientEmail).catch(() => null);

  const currentTotal = stat?.total ?? (typeof current?.totalGB === "number" ? current.totalGB : service.totalBytes);
  const currentExpiry =
    stat?.expiryTime ??
    (typeof current?.expiryTime === "number" ? current.expiryTime : service.expiresAt?.getTime() ?? 0);

  const addBytes = planBytes(plan.volumeGb);
  // اگر یکی از دو طرف نامحدود باشد، نتیجه نامحدود می‌ماند
  const newTotal = currentTotal === 0 || addBytes === 0 ? 0 : currentTotal + addBytes;
  const base = currentExpiry && currentExpiry > Date.now() ? currentExpiry : Date.now();
  const newExpiry = plan.days > 0 ? (currentExpiry === 0 ? 0 : expiryFrom(plan.days, base)) : 0;

  const spec = buildClientFromTemplate(current, {
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
    // اگر کلاینت روی پنل حذف شده باشد، دوباره ساخته می‌شود
    await client.addClient(service.inboundId, spec);
  }

  return db.service.update({
    where: { id: service.id },
    data: {
      planId: plan.id,
      totalBytes: newTotal,
      expiresAt: newExpiry ? new Date(newExpiry) : null,
      deviceLimit: typeof spec.limitIp === "number" ? spec.limitIp : service.deviceLimit,
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
    userEmail: order.user.email,
    plan: order.plan,
    planId: order.planId,
    panel,
    orderId: order.id,
    code: order.code,
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
    userEmail: user.email,
    plan: trialPlan,
    planId: null,
    panel,
    isTrial: true,
    code: `trial-${randomBytes(3).toString("hex")}`,
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

    // پنل نسخه ۳ خودش لینک‌های آماده را می‌دهد؛ دقیق‌ترین منبع همان است
    const panelLinks = await client.getClientLinks(service.clientEmail);
    if (panelLinks?.length) {
      return {
        subscription,
        configs: panelLinks.map((uri) => ({
          label: uri.split("://")[0]?.toUpperCase() || "CONFIG",
          uri,
        })),
      };
    }

    const inbound = await client.getInbound(service.inboundId);
    const host = resolveHost(service.panel.hostOverride, inbound.listen, service.panel.url);
    const current = await findServiceClient(client, service);
    const flow = typeof current?.flow === "string" && current.flow ? current.flow : service.panel.flow;
    const link = buildClientLink(inbound, service.uuid, service.remark, host, flow);
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
  const current = await findServiceClient(client, service);

  const spec = buildClientFromTemplate(current, {
    uuid: service.uuid,
    email: service.clientEmail,
    subId: service.subId,
    totalBytes: service.totalBytes,
    expiryTime: service.expiresAt ? service.expiresAt.getTime() : 0,
    deviceLimit: service.deviceLimit,
    flow: service.panel.flow,
    enable: enabled,
  });

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
    await panelClient(service.panel).deleteClient(service.inboundId, service.uuid, service.clientEmail);
  } catch {
    // اگر روی پنل نبود، فقط از دیتابیس حذف می‌کنیم
  }
  await db.service.delete({ where: { id: service.id } });
}
