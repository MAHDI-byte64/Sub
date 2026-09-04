import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { Panel, Plan, Service } from "@prisma/client";
import { db } from "./db";
import { GB } from "./format";
import { asNum, getSettings, type Settings } from "./settings";
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

/**
 * انتخاب پنل: پنل انتخابی کاربر، وگرنه کم‌بارترین پنل فعال.
 * اگر پلن به سرورهای مشخصی محدود شده باشد، فقط از همان‌ها انتخاب می‌شود.
 */
export async function pickPanel(
  preferredPanelId?: string | null,
  allowedPanelIds?: string[] | null,
): Promise<Panel> {
  const allowed = allowedPanelIds?.length ? allowedPanelIds : null;

  if (preferredPanelId && (!allowed || allowed.includes(preferredPanelId))) {
    const panel = await db.panel.findFirst({
      where: { id: preferredPanelId, isActive: true, autoDisabled: false },
    });
    if (panel) return panel;
  }
  const all = await db.panel.findMany({
    where: { isActive: true, ...(allowed ? { id: { in: allowed } } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  // سرورهایی که پایش، خرابشان تشخیص داده کنار گذاشته می‌شوند؛
  // مگر اینکه هیچ سرور سالمی نمانده باشد (آن وقت شانس را امتحان می‌کنیم).
  const healthy = all.filter((p) => !p.autoDisabled);
  const panels = healthy.length ? healthy : all;
  if (!panels.length) {
    throw new XuiError(
      allowed
        ? "سرورهای این پلن در حال حاضر در دسترس نیستند. لطفاً با پشتیبانی تماس بگیرید."
        : "هیچ سروری فعال نیست. لطفاً با پشتیبانی تماس بگیرید.",
    );
  }

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

/**
 * یک کلاینت این سرویس روی پنل: کدام اینباند، با چه نامی و با چه UUID.
 * در پنل نسخه ۲ هر اینباند کلاینت جداگانه‌ای دارد (نام و UUID مخصوص خودش)،
 * ولی همهٔ آن‌ها یک subId مشترک دارند تا در یک لینک اشتراک بیایند.
 */
export type ClientRef = { inboundId: number; email: string; uuid?: string };

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

  if (o.deviceLimit > 0) client.limitIp = o.deviceLimit;
  else if (typeof client.limitIp !== "number") client.limitIp = 0;

  if (o.flow) client.flow = o.flow;
  else if (typeof client.flow !== "string") client.flow = "";

  if (typeof client.tgId !== "string" && typeof client.tgId !== "number") client.tgId = "";

  return client;
}

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

function findByEmail(clients: XuiRawClient[], email: string): XuiRawClient | undefined {
  return clients.find((c) => String(c.email ?? "").toLowerCase() === email.toLowerCase());
}

/**
 * کلاینت الگو و همهٔ اینباندهایی که این کاربر روی آن‌ها حضور دارد.
 *
 * پنل 3x-ui کانفیگ‌های یک کاربر را با `subId` گروه می‌کند: لینک اشتراک هر
 * کلاینتی را برمی‌گرداند که همان subId را داشته باشد. پس «اینباندهای الگو»
 * یعنی هر اینباندی که کلاینتی با subId کلاینت الگو در آن باشد.
 */
export async function loadTemplate(
  client: XuiClient,
  panel: Panel,
): Promise<{ template: XuiRawClient | null; taken: Set<string>; inboundIds: number[] }> {
  const wanted = panel.templateEmail?.trim();
  const inbounds = await client.listInbounds();

  const taken = new Set<string>();
  for (const inbound of inbounds) {
    for (const c of parseInboundClients(inbound)) {
      const email = String(c.email ?? "").toLowerCase();
      if (email) taken.add(email);
    }
  }

  if (!wanted) {
    const fallback = inbounds.some((i) => i.id === panel.inboundId)
      ? panel.inboundId
      : (inbounds[0]?.id ?? panel.inboundId);
    return { template: null, taken, inboundIds: [fallback] };
  }

  let template: XuiRawClient | null = null;
  let homeInbound = 0;
  for (const inbound of inbounds) {
    const found = findByEmail(parseInboundClients(inbound), wanted);
    if (found) {
      template = found;
      homeInbound = inbound.id;
      break;
    }
  }

  if (!template) {
    throw new XuiError(
      `کلاینت الگو با نام «${wanted}» در هیچ‌کدام از اینباندهای این پنل پیدا نشد. ` +
        `نام کلاینت الگو را در تنظیمات سرور اصلاح کنید یا آن کلاینت را در پنل بسازید.`,
    );
  }

  if (!panel.multiInbound) return { template, taken, inboundIds: [homeInbound] };

  // همهٔ اینباندهایی که کلاینتی با همان subId (یا همان نام) دارند
  const subId = String(template.subId ?? "").trim();
  const inboundIds: number[] = [];
  for (const inbound of inbounds) {
    const clients = parseInboundClients(inbound);
    const match = subId
      ? clients.some((c) => String(c.subId ?? "").trim() === subId)
      : Boolean(findByEmail(clients, wanted));
    if (match) inboundIds.push(inbound.id);
  }
  if (!inboundIds.includes(homeInbound)) inboundIds.unshift(homeInbound);

  return { template, taken, inboundIds };
}

function planBytes(volumeGb: number): number {
  return volumeGb > 0 ? Math.round(volumeGb * GB) : 0;
}

function expiryFrom(days: number, from = Date.now()): number {
  return days > 0 ? from + days * 86_400_000 : 0;
}

/** کلاینت‌های ثبت‌شدهٔ یک سرویس روی پنل */
export function serviceRefs(service: Service): ClientRef[] {
  if (service.clientRefs) {
    try {
      const parsed = JSON.parse(service.clientRefs) as ClientRef[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      /* رکوردهای قدیمی */
    }
  }
  return [{ inboundId: service.inboundId, email: service.clientEmail }];
}

/* -------------------------------------------------------------------------- */
/*                                تحویل سرویس                                 */
/* -------------------------------------------------------------------------- */

/** ساخت سرویس تازه روی پنل (کپی از کلاینت الگو، روی همهٔ اینباندهای آن) */
export async function createServiceOnPanel(params: {
  userId: string;
  userEmail: string;
  plan: PlanShape;
  planId: string | null;
  panel: Panel;
  orderId?: string | null;
  isTrial?: boolean;
  code: string;
  remark: string;
}): Promise<Service> {
  const { userId, userEmail, plan, planId, panel, orderId, isTrial = false, code, remark } = params;
  const client = panelClient(panel);
  const { template, taken, inboundIds } = await loadTemplate(client, panel);

  // اگر کلاینت الگو روی اینباند دیگری بود، تنظیمات سرور اصلاح می‌شود
  if (!inboundIds.includes(panel.inboundId)) {
    await db.panel.update({ where: { id: panel.id }, data: { inboundId: inboundIds[0] } });
  }

  const uuid = randomUUID();
  const subId = randomBytes(8).toString("hex");
  const totalBytes = planBytes(plan.volumeGb);
  const expiryTime = expiryFrom(plan.days);

  const baseName = uniqueName(
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
    email: baseName,
    subId,
    totalBytes,
    expiryTime,
    deviceLimit: plan.deviceLimit,
    flow: panel.flow,
  });

  const refs: ClientRef[] = [];

  if ((await client.apiGeneration()) === "v3") {
    // یک کلاینت که به همهٔ اینباندها وصل است
    await client.addClientToInbounds(inboundIds, spec);
    for (const inboundId of inboundIds) refs.push({ inboundId, email: baseName, uuid });
  } else {
    // پنل نسخه ۲: نام کلاینت باید در کل پنل یکتا باشد و UUID تکراری روی چند
    // اینباند می‌تواند به‌روزرسانی را مبهم کند؛ پس هر اینباند کلاینت خودش را
    // با نام و UUID جدا می‌گیرد و فقط subId مشترک است.
    for (const [index, inboundId] of inboundIds.entries()) {
      const email = index === 0 ? baseName : uniqueName(`${baseName}-${index + 1}`, taken);
      const clientUuid = index === 0 ? uuid : randomUUID();
      taken.add(email.toLowerCase());
      await client.addClient(inboundId, { ...spec, email, id: clientUuid });
      refs.push({ inboundId, email, uuid: clientUuid });
    }
  }

  return db.service.create({
    data: {
      userId,
      planId,
      panelId: panel.id,
      orderId: orderId ?? null,
      remark,
      clientEmail: baseName,
      clientRefs: JSON.stringify(refs),
      uuid,
      subId,
      inboundId: refs[0].inboundId,
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

/** کلاینت فعلی یک ref روی پنل */
async function fetchClient(
  client: XuiClient,
  ref: ClientRef,
): Promise<XuiRawClient | null> {
  const clients = await client.listClients(ref.inboundId).catch(() => [] as XuiRawClient[]);
  return findByEmail(clients, ref.email) ?? null;
}

/** ورودی تمدید: می‌تواند یک پلن واقعی باشد یا مقدار دلخواه مدیر */
export type RenewInput = PlanShape & {
  id?: string | null;
  /**
   * تاریخ انقضای فعلی دست‌نخورده بماند (خرید حجم اضافه).
   * بدون این پرچم، `days = 0` یعنی «بدون محدودیت زمانی».
   */
  keepExpiry?: boolean;
};

/** تمدید سرویس: افزودن حجم و زمان روی همان کلاینت‌ها */
export async function renewServiceOnPanel(service: Service, plan: RenewInput): Promise<Service> {
  const panel = await db.panel.findUniqueOrThrow({ where: { id: service.panelId } });
  const client = panelClient(panel);
  const refs = serviceRefs(service);
  const isV3 = (await client.apiGeneration()) === "v3";

  const stat = await client.getClientTraffics(refs[0].email).catch(() => null);
  const current = await fetchClient(client, refs[0]);

  const currentTotal =
    stat?.total ?? (typeof current?.totalGB === "number" ? current.totalGB : service.totalBytes);
  const currentExpiry =
    stat?.expiryTime ??
    (typeof current?.expiryTime === "number" ? current.expiryTime : (service.expiresAt?.getTime() ?? 0));

  const addBytes = planBytes(plan.volumeGb);
  const newTotal = currentTotal === 0 || addBytes === 0 ? 0 : currentTotal + addBytes;
  const base = currentExpiry && currentExpiry > Date.now() ? currentExpiry : Date.now();
  const newExpiry = plan.keepExpiry
    ? currentExpiry
    : plan.days > 0
      ? currentExpiry === 0
        ? 0
        : expiryFrom(plan.days, base)
      : 0;

  const makeSpec = (ref: ClientRef, template: XuiRawClient | null) =>
    buildClientFromTemplate(template, {
      uuid: ref.uuid ?? service.uuid,
      email: ref.email,
      subId: service.subId,
      totalBytes: newTotal,
      expiryTime: newExpiry,
      deviceLimit: plan.deviceLimit || service.deviceLimit,
      flow: panel.flow,
    });

  if (isV3) {
    // نسخه ۳: یک کلاینت روی چند اینباند؛ یک درخواست کافی است
    const spec = makeSpec(refs[0], current);
    try {
      await client.updateClient(refs[0].inboundId, refs[0].uuid ?? service.uuid, spec);
    } catch (err) {
      if (!(err instanceof XuiError)) throw err;
      await client.addClientToInbounds(
        refs.map((r) => r.inboundId),
        spec,
      );
    }
  } else {
    for (const ref of refs) {
      const existing = await fetchClient(client, ref);
      const spec = makeSpec(ref, existing);
      try {
        await client.updateClient(ref.inboundId, ref.uuid ?? service.uuid, spec);
      } catch (err) {
        if (!(err instanceof XuiError)) throw err;
        await client.addClient(ref.inboundId, spec);
      }
    }
  }

  const used = await sumUsage(client, refs);

  return db.service.update({
    where: { id: service.id },
    data: {
      ...(plan.id ? { planId: plan.id } : {}),
      totalBytes: newTotal ? (service.usageOffset || 0) + newTotal : 0,
      expiresAt: newExpiry ? new Date(newExpiry) : null,
      deviceLimit: plan.deviceLimit || service.deviceLimit,
      status: "active",
      usedBytes: (service.usageOffset || 0) + used.used,
      lastSyncAt: new Date(),
    },
  });
}

/** مجموع مصرف همهٔ کلاینت‌های یک سرویس */
async function sumUsage(
  client: XuiClient,
  refs: ClientRef[],
): Promise<{ used: number; total: number; expiryTime: number; enable: boolean; found: boolean }> {
  let used = 0;
  let total = 0;
  let expiryTime = 0;
  let enable = false;
  let found = false;

  const seen = new Set<string>();
  for (const ref of refs) {
    if (seen.has(ref.email.toLowerCase())) continue;
    seen.add(ref.email.toLowerCase());

    const stat = await client.getClientTraffics(ref.email);
    if (!stat) continue;
    found = true;
    used += (stat.up || 0) + (stat.down || 0);
    total = Math.max(total, stat.total || 0);
    expiryTime = Math.max(expiryTime, stat.expiryTime || 0);
    enable = enable || stat.enable;
  }
  return { used, total, expiryTime, enable, found };
}

/** تحویل سفارش تأییدشده: خرید جدید یا تمدید */
export async function fulfillOrder(orderId: string): Promise<Service> {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { plan: { include: { panels: true } }, user: true },
  });

  // خرید حجم اضافه: پلن ندارد؛ فقط حجم به همان کانفیگ اضافه می‌شود و تاریخ
  // انقضا (اگر روز نخریده باشد) دست‌نخورده می‌ماند.
  if (order.kind === "addon") {
    if (!order.renewServiceId) {
      throw new XuiError("این سفارش حجم اضافه، سرویسی برای اعمال ندارد.");
    }
    const service = await db.service.findUniqueOrThrow({ where: { id: order.renewServiceId } });
    const updated = await renewServiceOnPanel(service, {
      volumeGb: order.addonGb,
      days: order.addonDays,
      deviceLimit: 0,
      keepExpiry: order.addonDays <= 0,
    });
    await db.order.update({
      where: { id: order.id },
      data: { status: "approved", reviewedAt: new Date(), panelId: service.panelId },
    });
    return updated;
  }

  if (!order.plan) {
    throw new XuiError("این سفارش پلن ندارد (سفارش شارژ کیف پول) و سرویسی برای تحویل نیست.");
  }
  const orderPlan = order.plan;

  if (order.renewServiceId) {
    const service = await db.service.findUniqueOrThrow({ where: { id: order.renewServiceId } });
    const renewed = await renewServiceOnPanel(service, orderPlan);
    await db.order.update({ where: { id: order.id }, data: { status: "approved", reviewedAt: new Date() } });
    return renewed;
  }

  const panel = await pickPanel(
    order.panelId,
    orderPlan.panels.map((p) => p.id),
  );
  const settings = await getSettings();
  const service = await createServiceOnPanel({
    userId: order.userId,
    userEmail: order.user.email,
    plan: orderPlan,
    planId: orderPlan.id,
    panel,
    orderId: order.id,
    code: order.code,
    remark: `${settings.site_name} | ${orderPlan.title}`,
  });
  await db.order.update({
    where: { id: order.id },
    data: { status: "approved", reviewedAt: new Date(), panelId: panel.id },
  });
  return service;
}

/** ساخت اکانت تست رایگان */
/**
 * سرور اکانت تست.
 *
 * اگر مدیر در تنظیمات سروری را برای تست انتخاب کرده باشد، تست فقط از همان داده
 * می‌شود و انتخاب لوکیشنِ مشتری نادیده گرفته می‌شود. اگر آن سرور خاموش یا خراب
 * باشد، `pickPanel` سرور سالم دیگری می‌دهد تا تست بی‌جواب نماند.
 */
export async function trialPanelId(
  settings: Settings,
  requestedPanelId?: string | null,
): Promise<string | null> {
  const fixed = settings.trial_panel_id?.trim();
  if (!fixed) return requestedPanelId ?? null;

  const panel = await db.panel.findFirst({ where: { id: fixed, isActive: true } });
  return panel ? panel.id : null;
}

export async function createTrialService(userId: string, panelId?: string | null): Promise<Service> {
  const settings = await getSettings();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.trialUsedAt) throw new XuiError("شما قبلاً اکانت تست رایگان دریافت کرده‌اید.");

  const panel = await pickPanel(await trialPanelId(settings, panelId));
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
    const usage = await sumUsage(client, serviceRefs(service));
    if (!usage.found) {
      return db.service.update({ where: { id: service.id }, data: { lastSyncAt: new Date() } });
    }

    const expiresAt = usage.expiryTime ? new Date(usage.expiryTime) : null;
    const expired =
      (expiresAt && expiresAt.getTime() < Date.now()) ||
      (usage.total > 0 && usage.used >= usage.total) ||
      !usage.enable;

    // مصرف سرورهای قبلی (اگر سرویس منتقل شده) روی شمارندهٔ پنل تازه سوار می‌شود
    const offset = service.usageOffset || 0;

    return db.service.update({
      where: { id: service.id },
      data: {
        usedBytes: offset + usage.used,
        totalBytes: usage.total ? offset + usage.total : 0,
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

/** لینک‌های اتصال یک سرویس (ساب + کانفیگ همهٔ اینباندها) */
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
    const refs = serviceRefs(service);

    // پنل نسخه ۳ خودش لینک‌های آماده را می‌دهد (همه اینباندها یک‌جا)
    const panelLinks = await client.getClientLinks(refs[0].email);
    if (panelLinks?.length) {
      return {
        subscription,
        configs: panelLinks.map((uri) => ({
          label: uri.split("://")[0]?.toUpperCase() || "CONFIG",
          uri,
        })),
      };
    }

    const configs: { label: string; uri: string }[] = [];
    for (const ref of refs) {
      const inbound = await client.getInbound(ref.inboundId).catch(() => null);
      if (!inbound) continue;
      const host = resolveHost(service.panel.hostOverride, inbound.listen, service.panel.url);
      const current = findByEmail(parseInboundClients(inbound), ref.email);
      const flow = typeof current?.flow === "string" && current.flow ? current.flow : service.panel.flow;
      const remark = refs.length > 1 ? `${service.remark} (${inbound.remark || inbound.port})` : service.remark;
      const link = buildClientLink(inbound, ref.uuid ?? service.uuid, remark, host, flow);
      if (link) configs.push(link);
    }
    return { subscription, configs };
  } catch (err) {
    return { subscription, configs: [], error: (err as Error).message };
  }
}

/** غیرفعال/فعال کردن سرویس روی همهٔ اینباندها */
export async function setServiceEnabled(serviceId: string, enabled: boolean): Promise<void> {
  const service = await db.service.findUniqueOrThrow({
    where: { id: serviceId },
    include: { panel: true },
  });
  const client = panelClient(service.panel);
  const refs = serviceRefs(service);
  const isV3 = (await client.apiGeneration()) === "v3";

  const specFor = (ref: ClientRef, template: XuiRawClient | null) =>
    buildClientFromTemplate(template, {
      uuid: ref.uuid ?? service.uuid,
      email: ref.email,
      subId: service.subId,
      totalBytes: service.totalBytes,
      expiryTime: service.expiresAt ? service.expiresAt.getTime() : 0,
      deviceLimit: service.deviceLimit,
      flow: service.panel.flow,
      enable: enabled,
    });

  const targets = isV3 ? refs.slice(0, 1) : refs;
  for (const ref of targets) {
    const current = await fetchClient(client, ref);
    await client.updateClient(ref.inboundId, ref.uuid ?? service.uuid, specFor(ref, current));
  }

  await db.service.update({
    where: { id: service.id },
    data: { status: enabled ? "active" : "disabled" },
  });
}

/* -------------------------------------------------------------------------- */
/*                     بازتولید کانفیگ (باطل‌کردن لینک قدیمی)                    */
/* -------------------------------------------------------------------------- */

/**
 * چند میلی‌ثانیه تا مجاز شدن بازتولید بعدی باقی مانده است (صفر یعنی همین حالا مجاز است).
 */
export function rotateCooldownLeft(
  service: Pick<Service, "rotatedAt">,
  cooldownMs: number,
  now = Date.now(),
): number {
  if (!service.rotatedAt || cooldownMs <= 0) return 0;
  return Math.max(0, service.rotatedAt.getTime() + cooldownMs - now);
}

export type RotateResult = {
  service: Service;
  /** اینباندهایی که به‌روزرسانی آن‌ها روی پنل انجام نشد */
  failed: { inboundId: number; message: string }[];
};

/**
 * UUID و subId سرویس را عوض می‌کند تا هر کسی که کانفیگ یا لینک اشتراک قدیمی
 * را دارد دیگر نتواند وصل شود.
 *
 * نام کلاینت (email) عمداً دست‌نخورده می‌ماند: آمار مصرف در پنل به نام کلاینت
 * گره خورده است، پس با ثابت‌ماندن نام، حجم مصرف‌شده و سهمیه سر جای خود می‌مانند
 * و کاربر نمی‌تواند با بازتولید پیاپی، مصرفش را صفر کند.
 */
export async function rotateService(serviceId: string): Promise<RotateResult> {
  const service = await db.service.findUniqueOrThrow({
    where: { id: serviceId },
    include: { panel: true },
  });
  const client = panelClient(service.panel);
  const refs = serviceRefs(service);
  const isV3 = (await client.apiGeneration()) === "v3";

  const newSubId = randomBytes(8).toString("hex");

  // سهمیه و انقضای فعلی از پنل خوانده می‌شود تا بازتولید چیزی را جابه‌جا نکند
  const stat = await client.getClientTraffics(refs[0].email).catch(() => null);
  const currentTotal = stat?.total ?? service.totalBytes;
  const currentExpiry = stat?.expiryTime ?? (service.expiresAt?.getTime() ?? 0);
  const enable = service.status !== "disabled";

  const nextRefs: ClientRef[] = [];
  const failed: { inboundId: number; message: string }[] = [];

  // نسخه ۳: یک کلاینت روی همهٔ اینباندها؛ یک UUID تازه برای همه
  const sharedUuid = randomUUID();

  for (const [index, ref] of refs.entries()) {
    if (isV3 && index > 0) {
      // همان کلاینت است؛ فقط رفرنس را با UUID تازه نگه می‌داریم
      nextRefs.push({ ...ref, uuid: sharedUuid });
      continue;
    }

    const nextUuid = isV3 ? sharedUuid : randomUUID();
    const existing = await fetchClient(client, ref);
    const spec = buildClientFromTemplate(existing, {
      uuid: nextUuid,
      email: ref.email,
      subId: newSubId,
      totalBytes: currentTotal,
      expiryTime: currentExpiry,
      deviceLimit: service.deviceLimit,
      flow: service.panel.flow,
      enable,
    });

    try {
      await client.updateClient(ref.inboundId, ref.uuid ?? service.uuid, spec);
      nextRefs.push({ ...ref, uuid: nextUuid });
    } catch (err) {
      failed.push({ inboundId: ref.inboundId, message: (err as Error).message });
      nextRefs.push({ ...ref, uuid: ref.uuid ?? service.uuid });
    }
  }

  const rotatedAny = nextRefs.some((ref, i) => ref.uuid !== (refs[i].uuid ?? service.uuid));
  if (!rotatedAny) {
    throw new XuiError(
      `بازتولید کانفیگ روی پنل انجام نشد${failed[0] ? `: ${failed[0].message}` : "."}`,
    );
  }

  const updated = await db.service.update({
    where: { id: service.id },
    data: {
      uuid: nextRefs[0].uuid ?? sharedUuid,
      subId: newSubId,
      clientRefs: JSON.stringify(nextRefs),
      rotatedAt: new Date(),
      rotateCount: { increment: 1 },
      lastSyncAt: new Date(),
    },
  });

  return { service: updated, failed };
}

/* -------------------------------------------------------------------------- */
/*                          انتقال سرویس بین سرورها                           */
/* -------------------------------------------------------------------------- */

export type MigrateResult = {
  service: Service;
  fromPanel: string;
  toPanel: string;
  /** حجم باقی‌ماندهٔ منتقل‌شده (۰ یعنی نامحدود) */
  remainingBytes: number;
  /** آمار از پنل قبلی خوانده شد یا از دیتابیس (پنل خراب بود) */
  usageFromPanel: boolean;
  /** کلاینت قبلی از سرور مبدأ پاک شد یا نه */
  oldRemoved: boolean;
};

/**
 * انتقال یک سرویس به سرور دیگر.
 *
 * حجم باقی‌مانده و تاریخ انقضا حفظ می‌شوند: شمارندهٔ مصرف روی پنل تازه از صفر
 * شروع می‌شود، پس سهمیهٔ کلاینت جدید «باقی‌ماندهٔ» سرویس است و مصرف قبلی در
 * `usageOffset` می‌ماند تا کاربر همان حجم کل و همان مصرف را ببیند.
 *
 * اگر سرور مبدأ خراب یا خاموش باشد هم انتقال انجام می‌شود؛ در این حالت آمار از
 * دیتابیس برداشته می‌شود و کلاینت قدیمی روی همان سرور باقی می‌ماند.
 */
export async function migrateService(
  serviceId: string,
  targetPanelId: string,
): Promise<MigrateResult> {
  const service = await db.service.findUniqueOrThrow({
    where: { id: serviceId },
    include: { panel: true, user: true },
  });
  if (service.panelId === targetPanelId) {
    throw new XuiError("این سرویس همین حالا روی همان سرور است.");
  }

  const target = await db.panel.findUniqueOrThrow({ where: { id: targetPanelId } });
  const source = service.panel;

  // ۱) وضعیت فعلی: اول از پنل مبدأ، و اگر جواب نداد از دیتابیس
  const sourceClient = panelClient(source);
  const refs = serviceRefs(service);
  const stat = await sumUsage(sourceClient, refs).catch(() => null);

  const usageFromPanel = Boolean(stat?.found);
  const offset = service.usageOffset || 0;
  const used = usageFromPanel ? offset + stat!.used : service.usedBytes;
  const total = usageFromPanel ? (stat!.total ? offset + stat!.total : 0) : service.totalBytes;
  const expiryTime = usageFromPanel && stat!.expiryTime
    ? stat!.expiryTime
    : (service.expiresAt?.getTime() ?? 0);
  const enable = usageFromPanel ? stat!.enable : service.status !== "disabled";

  // ۰ یعنی نامحدود؛ در غیر این صورت فقط باقی‌مانده منتقل می‌شود
  const remainingBytes = total === 0 ? 0 : Math.max(0, total - used);

  // ۲) ساخت کلاینت روی سرور مقصد (با الگوی خودِ آن سرور)
  const targetClient = panelClient(target);
  const { template, taken, inboundIds } = await loadTemplate(targetClient, target);

  if (!inboundIds.includes(target.inboundId)) {
    await db.panel.update({ where: { id: target.id }, data: { inboundId: inboundIds[0] } });
  }

  const baseName = uniqueName(
    renderClientName(target.namePattern, {
      template: slug(target.templateEmail?.trim() || target.name, 24),
      code: slug(service.remark, 24),
      user: slug(service.user.email.split("@")[0] ?? "user", 24),
      rand: randomBytes(3).toString("hex"),
    }),
    taken,
  );

  const uuid = randomUUID();
  const spec = buildClientFromTemplate(template, {
    uuid,
    email: baseName,
    // لینک اشتراک همان مسیر قبلی را نگه می‌دارد (میزبانش عوض می‌شود)
    subId: service.subId,
    totalBytes: remainingBytes,
    expiryTime,
    deviceLimit: service.deviceLimit,
    flow: target.flow,
    enable,
  });

  const nextRefs: ClientRef[] = [];

  if ((await targetClient.apiGeneration()) === "v3") {
    await targetClient.addClientToInbounds(inboundIds, spec);
    for (const inboundId of inboundIds) nextRefs.push({ inboundId, email: baseName, uuid });
  } else {
    for (const [index, inboundId] of inboundIds.entries()) {
      const email = index === 0 ? baseName : uniqueName(`${baseName}-${index + 1}`, taken);
      const clientUuid = index === 0 ? uuid : randomUUID();
      taken.add(email.toLowerCase());
      await targetClient.addClient(inboundId, { ...spec, email, id: clientUuid });
      nextRefs.push({ inboundId, email, uuid: clientUuid });
    }
  }

  // ۳) پاک‌کردن کلاینت قدیمی (اگر سرور مبدأ در دسترس نباشد، همان‌جا می‌ماند)
  let oldRemoved = false;
  try {
    const isV3 = (await sourceClient.apiGeneration()) === "v3";
    const targets = isV3 ? refs.slice(0, 1) : refs;
    for (const ref of targets) {
      await sourceClient.deleteClient(ref.inboundId, ref.uuid ?? service.uuid, ref.email);
    }
    oldRemoved = true;
  } catch {
    oldRemoved = false;
  }

  const updated = await db.service.update({
    where: { id: service.id },
    data: {
      panelId: target.id,
      clientEmail: baseName,
      clientRefs: JSON.stringify(nextRefs),
      uuid: nextRefs[0].uuid ?? uuid,
      inboundId: nextRefs[0].inboundId,
      usageOffset: used,
      usedBytes: used,
      totalBytes: total,
      expiresAt: expiryTime ? new Date(expiryTime) : null,
      status: enable ? "active" : "disabled",
      movedAt: new Date(),
      movedFrom: source.name,
      lastSyncAt: new Date(),
    },
  });

  return {
    service: updated,
    fromPanel: source.name,
    toPanel: target.name,
    remainingBytes,
    usageFromPanel,
    oldRemoved,
  };
}

/** صفر کردن مصرف سرویس روی پنل و در دیتابیس */
export async function resetServiceTraffic(serviceId: string): Promise<void> {
  const service = await db.service.findUniqueOrThrow({
    where: { id: serviceId },
    include: { panel: true },
  });
  const client = panelClient(service.panel);

  for (const ref of serviceRefs(service)) {
    await client.resetClientTraffic(ref.inboundId, ref.email);
  }
  await db.service.update({
    where: { id: service.id },
    // مصرف انتقال‌یافته از سرور قبلی هم پاک می‌شود، وگرنه دوباره شمرده می‌شود
    data: { usedBytes: 0, usageOffset: 0, status: "active", lastSyncAt: new Date() },
  });
}

/** حذف کامل سرویس از پنل و دیتابیس */
export async function removeService(serviceId: string): Promise<void> {
  const service = await db.service.findUniqueOrThrow({
    where: { id: serviceId },
    include: { panel: true },
  });
  const client = panelClient(service.panel);
  const refs = serviceRefs(service);
  const isV3 = await client.apiGeneration().catch(() => "v2" as const);

  const targets = isV3 === "v3" ? refs.slice(0, 1) : refs;
  for (const ref of targets) {
    try {
      await client.deleteClient(ref.inboundId, ref.uuid ?? service.uuid, ref.email);
    } catch {
      // اگر روی پنل نبود، ادامه می‌دهیم
    }
  }
  await db.service.delete({ where: { id: service.id } });
}
