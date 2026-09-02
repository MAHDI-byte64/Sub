/**
 * تست سرتاسری منطق فروش + اتصال به پنل 3x-ui.
 * سناریو دو بار اجرا می‌شود: یک بار روی پنل نسخه ۲ (نام کاربری/رمز) و یک بار
 * روی پنل نسخه ۳ (API رسمی با توکن Bearer).
 *
 *   bash scripts/test.sh
 */
import { db } from "../src/lib/db";
import { GB } from "../src/lib/format";
import {
  createTrialService,
  fulfillOrder,
  panelClient,
  removeService,
  serviceLinks,
  syncService,
} from "../src/lib/provision";
import { saveSettings } from "../src/lib/settings";
import { XuiClient, type XuiRawClient } from "../src/lib/xui";
import { serviceRefs } from "../src/lib/provision";

const MOCK_V2 = process.env.MOCK_PANEL_URL || "http://127.0.0.1:8899";
const MOCK_V3 = process.env.MOCK_PANEL_V3_URL || "http://127.0.0.1:8898";
const API_TOKEN = process.env.MOCK_API_TOKEN || "3xui-test-token";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`, extra ?? "");
  }
}

async function reset() {
  await db.ticketMessage.deleteMany();
  await db.ticket.deleteMany();
  await db.service.deleteMany();
  await db.order.deleteMany();
  await db.discount.deleteMany();
  await db.plan.deleteMany();
  await db.panel.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.setting.deleteMany();
}

type ScenarioOptions = {
  label: string;
  url: string;
  apiToken: string | null;
  /** در حالت توکن عمداً نام کاربری اشتباه می‌دهیم تا ثابت شود توکن کار می‌کند */
  username: string;
  password: string;
  prefix: string;
  expect: "v2" | "v3";
};

async function scenario(opts: ScenarioOptions) {
  console.log(`\n══════ ${opts.label} ══════`);
  await reset();
  await saveSettings({ trial_enabled: "1", trial_volume_gb: "1", trial_days: "1", trial_device_limit: "1" });

  const panel = await db.panel.create({
    data: {
      name: `MOCK-${opts.prefix}`,
      location: "آلمان - تست",
      flag: "🇩🇪",
      url: opts.url,
      username: opts.username,
      password: opts.password,
      apiToken: opts.apiToken,
      inboundId: 1,
      subBase: "https://sub.test.local/sub",
      flow: "",
      templateEmail: "template-vip",
      namePattern: "{template}-{code}",
      isActive: true,
    },
  });

  console.log("→ تست اتصال و تشخیص نسل API");
  const test = await panelClient(panel).testConnection();
  check("ورود به پنل و دریافت اینباندها", test.ok, test.message);
  check(`نسل API درست تشخیص داده شد (${opts.expect})`, test.generation === opts.expect, test.generation);
  check(
    `روش احراز هویت: ${opts.apiToken ? "توکن API" : "نام کاربری"}`,
    test.authMode === (opts.apiToken ? "token" : "session"),
    test.authMode,
  );
  check("اینباند شماره ۱ موجود است", test.inbounds.some((i) => i.id === 1));

  const plan = await db.plan.create({
    data: { title: "تست ۱۰ گیگ", volumeGb: 10, days: 30, deviceLimit: 2, priceToman: 100_000 },
  });
  const user = await db.user.create({
    data: { email: `buyer-${opts.prefix}@test.local`, passwordHash: "scrypt:x:y", name: "خریدار" },
  });

  console.log("→ ثبت سفارش و تحویل سرویس");
  const order = await db.order.create({
    data: {
      code: `${opts.prefix}-01`,
      userId: user.id,
      planId: plan.id,
      panelId: panel.id,
      amount: plan.priceToman,
      payable: plan.priceToman,
      status: "pending_review",
    },
  });

  const service = await fulfillOrder(order.id);
  const approved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  check("وضعیت سفارش به approved تغییر کرد", approved.status === "approved", approved.status);
  check("سرویس با حجم درست ساخته شد", service.totalBytes === 10 * GB, service.totalBytes);
  check(
    "تاریخ انقضا حدود ۳۰ روز بعد است",
    (() => {
      const days = ((service.expiresAt?.getTime() ?? 0) - Date.now()) / 86_400_000;
      return days > 29.9 && days < 30.1;
    })(),
    service.expiresAt,
  );

  console.log("→ کپی دقیق از کلاینت الگو");
  const clients = await panelClient(panel).listClients(1);
  const template = clients.find((c) => c.email === "template-vip") as XuiRawClient;
  const created = clients.find((c) => c.email === service.clientEmail) as XuiRawClient;

  check("کلاینت جدید روی اینباند ساخته شد", Boolean(created), service.clientEmail);
  check(
    "نام طبق الگوی {template}-{code} ساخته شد",
    service.clientEmail === `template-vip-${opts.prefix}-01`,
    service.clientEmail,
  );
  check("UUID با کلاینت الگو فرق دارد", created?.id !== template?.id);
  check("subId با کلاینت الگو فرق دارد", created?.subId !== template?.subId);
  check("flow از کلاینت الگو کپی شد", created?.flow === "xtls-rprx-vision", created?.flow);
  check("tgId از کلاینت الگو کپی شد", created?.tgId === "999888777", created?.tgId);
  check("فیلدهای اضافه (comment) هم کپی شد", created?.comment === "vip-template", created?.comment);
  check("محدودیت کاربر از پلن گرفته شد (نه الگو)", created?.limitIp === 2, created?.limitIp);
  check(
    "حجم و انقضا از پلن گرفته شد",
    created?.totalGB === 10 * GB && created?.expiryTime !== 0,
    [created?.totalGB, created?.expiryTime],
  );

  console.log("→ ساخت روی همهٔ اینباندهای کلاینت الگو");
  const refs = serviceRefs(service);
  check("سرویس روی هر دو اینباند ساخته شد", refs.length === 2, refs);
  check(
    "اینباندهای ۱ و ۲ پوشش داده شدند",
    refs.map((r) => r.inboundId).sort().join(",") === "1,2",
    refs.map((r) => r.inboundId),
  );
  const secondInbound = await panelClient(panel).listClients(2);
  const secondClient = secondInbound.find((c) => c.email === refs[1]?.email);
  check("کلاینت روی اینباند دوم هم وجود دارد", Boolean(secondClient), refs[1]?.email);
  check("هر دو کلاینت یک subId دارند (یک لینک اشتراک)", secondClient?.subId === service.subId, [
    secondClient?.subId,
    service.subId,
  ]);
  if (opts.expect === "v2") {
    check("در نسخه ۲ نام کلاینت دوم یکتاست", refs[1]?.email === `${refs[0].email}-2`, refs[1]?.email);
    check(
      "در نسخه ۲ هر اینباند UUID جدا دارد (به‌روزرسانی مبهم نشود)",
      Boolean(refs[1]?.uuid) && refs[1]?.uuid !== refs[0].uuid && secondClient?.id === refs[1]?.uuid,
      [refs[0].uuid, refs[1]?.uuid, secondClient?.id],
    );
  } else {
    check("در نسخه ۳ یک کلاینت به هر دو اینباند وصل است", refs[1]?.email === refs[0].email);
    check("در نسخه ۳ UUID روی هر دو اینباند یکی است", secondClient?.id === service.uuid);
  }

  console.log("→ همگام‌سازی مصرف");
  await fetch(`${opts.url}/_mock/usage?email=${encodeURIComponent(service.clientEmail)}&up=${GB}&down=${2 * GB}`);
  const synced = await syncService(service.id, true);
  check("مصرف از پنل خوانده شد (۳ گیگ)", synced.usedBytes === 3 * GB, synced.usedBytes);
  check("وضعیت سرویس فعال است", synced.status === "active");

  console.log("→ ساخت لینک اتصال");
  const links = await serviceLinks(service.id);
  check(
    "لینک اشتراک درست ساخته شد",
    links.subscription === `https://sub.test.local/sub/${service.subId}`,
    links.subscription,
  );
  const uri = links.configs[0]?.uri ?? "";
  check("کانفیگ ساخته شد", uri.startsWith("vless://"), uri);
  check(
    "برای هر اینباند یک کانفیگ آمد",
    links.configs.length === 2,
    links.configs.map((c) => c.uri.slice(0, 40)),
  );
  if (opts.expect === "v3") {
    check("لینک از خود پنل گرفته شد (API نسخه ۳)", uri.includes("panel.example.com"), uri);
    check("لینک به کلاینت همین سرویس اشاره می‌کند", uri.includes(service.uuid), uri);
  } else {
    check("پارامترهای Reality در لینک هست", uri.includes("security=reality") && uri.includes("pbk=PUBLICKEY123"), uri);
    check("SNI و flow در لینک هست", uri.includes("sni=www.datadoghq.com") && uri.includes("flow=xtls-rprx-vision"), uri);
  }

  console.log("→ تمدید سرویس");
  const renewOrder = await db.order.create({
    data: {
      code: `${opts.prefix}-02`,
      userId: user.id,
      planId: plan.id,
      renewServiceId: service.id,
      amount: plan.priceToman,
      payable: plan.priceToman,
      status: "pending_review",
    },
  });
  const renewed = await fulfillOrder(renewOrder.id);
  check("حجم بعد از تمدید ۲۰ گیگ شد", renewed.totalBytes === 20 * GB, renewed.totalBytes);
  check(
    "انقضا حدود ۶۰ روز شد",
    (() => {
      const days = ((renewed.expiresAt?.getTime() ?? 0) - Date.now()) / 86_400_000;
      return days > 59.5 && days < 60.5;
    })(),
    renewed.expiresAt,
  );
  check("لینک اشتراک بعد از تمدید تغییر نکرد", renewed.subId === service.subId);
  const renewRefs = serviceRefs(renewed);
  const afterSecond = (await panelClient(panel).listClients(2)).find(
    (c) => c.email === renewRefs[1]?.email,
  );
  check("کلاینت اینباند دوم هم تمدید شد", afterSecond?.totalGB === 20 * GB, afterSecond?.totalGB);
  const afterRenew = (await panelClient(panel).listClients(1)).find((c) => c.email === service.clientEmail);
  check(
    "تنظیمات کپی‌شده بعد از تمدید حفظ شد",
    afterRenew?.comment === "vip-template" && afterRenew?.tgId === "999888777",
    [afterRenew?.comment, afterRenew?.tgId],
  );

  console.log("→ اکانت تست رایگان");
  const trialUser = await db.user.create({
    data: { email: `trial-${opts.prefix}@test.local`, passwordHash: "scrypt:x:y" },
  });
  const trial = await createTrialService(trialUser.id);
  check("اکانت تست ساخته شد", trial.isTrial && trial.totalBytes === 1 * GB, trial.totalBytes);
  let secondTrialBlocked = false;
  try {
    await createTrialService(trialUser.id);
  } catch {
    secondTrialBlocked = true;
  }
  check("تست رایگان دوم مسدود شد", secondTrialBlocked);

  console.log("→ پیدا کردن کلاینت الگو در اینباند دیگر");
  await db.panel.update({ where: { id: panel.id }, data: { templateEmail: "template-alt", inboundId: 1 } });
  const altOrder = await db.order.create({
    data: {
      code: `${opts.prefix}-03`,
      userId: user.id,
      planId: plan.id,
      panelId: panel.id,
      amount: plan.priceToman,
      payable: plan.priceToman,
      status: "pending_review",
    },
  });
  const altService = await fulfillOrder(altOrder.id);
  const altPanel = await db.panel.findUniqueOrThrow({ where: { id: panel.id } });
  check("سرویس روی اینباند کلاینت الگو ساخته شد", altService.inboundId === 2, altService.inboundId);
  check("شناسه اینباند سرور خودکار اصلاح شد", altPanel.inboundId === 2, altPanel.inboundId);
  const altCreated = (await panelClient(altPanel).listClients(2)).find((c) => c.email === altService.clientEmail);
  check("تنظیمات از کلاینت الگوی اینباند دوم کپی شد", altCreated?.comment === "alt-template", altCreated?.comment);
  await db.panel.update({ where: { id: panel.id }, data: { templateEmail: "template-vip", inboundId: 1 } });

  console.log("→ خطای کلاینت الگوی نامعتبر");
  await db.panel.update({ where: { id: panel.id }, data: { templateEmail: "does-not-exist" } });
  const badOrder = await db.order.create({
    data: {
      code: `${opts.prefix}-04`,
      userId: user.id,
      planId: plan.id,
      panelId: panel.id,
      amount: plan.priceToman,
      payable: plan.priceToman,
      status: "pending_review",
    },
  });
  let templateErrorShown = false;
  try {
    await fulfillOrder(badOrder.id);
  } catch (err) {
    templateErrorShown = (err as Error).message.includes("کلاینت الگو");
  }
  check("نبودن کلاینت الگو با خطای روشن گزارش شد", templateErrorShown);
  await db.panel.update({ where: { id: panel.id }, data: { templateEmail: "template-vip" } });

  console.log("→ حذف سرویس");
  const trialRefs = serviceRefs(trial);
  await removeService(trial.id);
  const leftovers: string[] = [];
  for (const ref of trialRefs) {
    const clients = await panelClient(panel).listClients(ref.inboundId);
    if (clients.some((c) => c.email === ref.email)) leftovers.push(`${ref.inboundId}:${ref.email}`);
  }
  check("کلاینت از همهٔ اینباندها حذف شد", leftovers.length === 0, leftovers);
  const gone = await panelClient(panel).getClientTraffics(trial.clientEmail);
  check("کلاینت از پنل حذف شد", gone === null, gone);
  check("سرویس از دیتابیس حذف شد", (await db.service.findUnique({ where: { id: trial.id } })) === null);
}

async function main() {
  await scenario({
    label: "پنل نسخه ۲ — ورود با نام کاربری و رمز",
    url: MOCK_V2,
    apiToken: null,
    username: "admin",
    password: "admin",
    prefix: "FD-V2",
    expect: "v2",
  });

  await scenario({
    label: "پنل نسخه ۳ — API رسمی با توکن Bearer",
    url: MOCK_V3,
    apiToken: API_TOKEN,
    // عمداً نام کاربری اشتباه: اگر کار کند یعنی واقعاً از توکن استفاده شده است
    username: "wrong-user",
    password: "wrong-pass",
    prefix: "FD-V3",
    expect: "v3",
  });

  console.log("\n══════ بررسی توکن نامعتبر ══════");
  const badToken = new XuiClient({
    url: MOCK_V3,
    username: "wrong-user",
    password: "wrong-pass",
    apiToken: "totally-wrong-token",
    insecure: true,
  });
  const badResult = await badToken.testConnection();
  check("توکن نامعتبر با پیام روشن رد شد", !badResult.ok && badResult.message.includes("توکن API"), badResult.message);

  console.log(`\nنتیجه: ${passed} تست موفق، ${failed} تست ناموفق`);
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
