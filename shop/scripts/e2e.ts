/**
 * تست سرتاسری منطق فروش + اتصال به پنل 3x-ui.
 * سناریو دو بار اجرا می‌شود: یک بار روی پنل نسخه ۲ (نام کاربری/رمز) و یک بار
 * روی پنل نسخه ۳ (API رسمی با توکن Bearer).
 *
 *   bash scripts/test.sh
 */
import { db } from "../src/lib/db";
import { GB } from "../src/lib/format";
import { pickPanel } from "../src/lib/provision";
import {
  createTrialService,
  fulfillOrder,
  panelClient,
  removeService,
  rotateCooldownLeft,
  rotateService,
  serviceLinks,
  syncService,
} from "../src/lib/provision";
import { getSettings, saveSettings } from "../src/lib/settings";
import { creditWallet, debitWallet } from "../src/lib/wallet";
import { runMaintenance } from "../src/lib/scheduler";
import { checkPanel, probePanel, pruneChecks, uptimeStats } from "../src/lib/monitor";
import { gatewayReady, startPayment, verifyPayment } from "../src/lib/gateway";
import {
  activeGateways,
  availableMethods,
  gatewayUsable,
  hooshpaySignature,
  migrateLegacyGateway,
  quoteCrypto,
  startWithGateway,
  validHooshpaySignature,
  verifyWithGateway,
} from "../src/lib/payments";
import { tomanToUsdt, usdtRate } from "../src/lib/rates";
import { completePaidOrder } from "../src/lib/orders";
import {
  broadcastPush,
  ensureVapidKeys,
  pushPublicKey,
  pushReady,
  removeSubscription,
  saveSubscription,
  sendPushToUser,
} from "../src/lib/push";
import { notifyUser } from "../src/lib/notify";
import { fmt } from "../src/lib/format";
import { DICT, t, type Locale } from "../src/lib/i18n";
import { XuiClient, type XuiRawClient } from "../src/lib/xui";
import { serviceRefs } from "../src/lib/provision";

const MOCK_V2 = process.env.MOCK_PANEL_URL || "http://127.0.0.1:8899";
const MOCK_V3 = process.env.MOCK_PANEL_V3_URL || "http://127.0.0.1:8898";
const API_TOKEN = process.env.MOCK_API_TOKEN || "3xui-test-token";
const MOCK_GATEWAY = process.env.MOCK_GATEWAY_URL || "http://127.0.0.1:8896";
const GATEWAY_KEY = process.env.MOCK_GATEWAY_KEY || "gw-test-key";

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
  await db.gateway.deleteMany();
  await db.cryptoWallet.deleteMany();
  await db.pushSub.deleteMany();
  await db.panelCheck.deleteMany();
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

  console.log("→ بازتولید کانفیگ (باطل‌کردن لینک قبلی)");
  const beforeRotate = await db.service.findUniqueOrThrow({ where: { id: service.id } });
  const oldRefs = serviceRefs(beforeRotate);
  const oldUuids = oldRefs.map((r) => r.uuid ?? beforeRotate.uuid);
  const oldSub = (await serviceLinks(service.id)).subscription;

  const rotated = (await rotateService(service.id)).service;
  const rotatedRefs = serviceRefs(rotated);

  check("UUID سرویس عوض شد", rotated.uuid !== beforeRotate.uuid, [beforeRotate.uuid, rotated.uuid]);
  check("subId (آدرس لینک اشتراک) عوض شد", rotated.subId !== beforeRotate.subId, [
    beforeRotate.subId,
    rotated.subId,
  ]);
  check("شمارنده بازتولید یک واحد بالا رفت", rotated.rotateCount === beforeRotate.rotateCount + 1);
  check("زمان بازتولید ثبت شد", Boolean(rotated.rotatedAt));

  const rotatedClients: (XuiRawClient | undefined)[] = [];
  for (const ref of rotatedRefs) {
    const clients = await panelClient(panel).listClients(ref.inboundId);
    rotatedClients.push(clients.find((c) => c.email === ref.email));
  }
  check(
    "UUID روی همهٔ اینباندهای پنل عوض شد",
    rotatedClients.every((c, i) => c && c.id !== oldUuids[i]),
    rotatedClients.map((c) => c?.id),
  );
  check(
    "subId تازه روی همهٔ اینباندها ثبت شد",
    rotatedClients.every((c) => c?.subId === rotated.subId),
    rotatedClients.map((c) => c?.subId),
  );
  check(
    "هیچ کلاینتی با UUID قدیمی روی پنل نماند",
    rotatedClients.every((c) => !oldUuids.includes(String(c?.id))),
    oldUuids,
  );
  check(
    "حجم و انقضای سرویس دست‌نخورده ماند",
    rotated.totalBytes === renewed.totalBytes &&
      rotated.expiresAt?.getTime() === renewed.expiresAt?.getTime(),
    [rotated.totalBytes, rotated.expiresAt],
  );
  check(
    "مصرف کاربر بعد از بازتولید صفر نشد (سوءاستفاده ممکن نیست)",
    (await syncService(service.id, true)).usedBytes === 3 * GB,
  );
  check(
    "نام کلاینت روی پنل تغییر نکرد",
    rotatedRefs.every((ref, i) => ref.email === oldRefs[i].email),
    rotatedRefs.map((r) => r.email),
  );

  if (opts.expect === "v2") {
    check(
      "در نسخه ۲ هر اینباند UUID تازهٔ خودش را گرفت",
      rotatedRefs[0].uuid !== rotatedRefs[1].uuid,
      rotatedRefs.map((r) => r.uuid),
    );
  } else {
    check(
      "در نسخه ۳ یک UUID تازه روی هر دو اینباند نشست",
      rotatedRefs[0].uuid === rotatedRefs[1].uuid,
      rotatedRefs.map((r) => r.uuid),
    );
  }

  const newLinks = await serviceLinks(service.id);
  check("لینک اشتراک تازه با قبلی فرق دارد", newLinks.subscription !== oldSub, [
    oldSub,
    newLinks.subscription,
  ]);
  check(
    "کانفیگ‌های تازه به UUID جدید اشاره می‌کنند",
    newLinks.configs.length === 2 && newLinks.configs.every((c) => !oldUuids.some((u) => c.uri.includes(u))),
    newLinks.configs.map((c) => c.uri.slice(0, 48)),
  );

  check(
    "فاصله مجاز بین دو بازتولید رعایت می‌شود",
    rotateCooldownLeft(rotated, 30 * 60_000) > 0 && rotateCooldownLeft(rotated, 0) === 0,
  );
  check(
    "بعد از پایان فاصله مجاز، بازتولید دوباره آزاد است",
    rotateCooldownLeft(rotated, 30 * 60_000, Date.now() + 31 * 60_000) === 0,
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

/** پلن محدود به یک سرور مشخص باید فقط روی همان سرور تحویل شود */
async function planPanelScenario() {
  console.log("\n══════ تخصیص پلن به سرور ══════");
  await reset();
  await saveSettings({ trial_enabled: "0" });

  const panelA = await db.panel.create({
    data: {
      name: "A", location: "آلمان", flag: "🇩🇪", url: MOCK_V2,
      username: "admin", password: "admin", inboundId: 1,
      templateEmail: "template-vip", multiInbound: false, sortOrder: 1, isActive: true,
    },
  });
  const panelB = await db.panel.create({
    data: {
      name: "B", location: "هلند", flag: "🇳🇱", url: MOCK_V2,
      username: "admin", password: "admin", inboundId: 2,
      templateEmail: "template-alt", multiInbound: false, sortOrder: 2, isActive: true,
    },
  });

  const openPlan = await db.plan.create({
    data: { title: "آزاد", volumeGb: 5, days: 30, deviceLimit: 1, priceToman: 50_000 },
  });
  const boundPlan = await db.plan.create({
    data: {
      title: "فقط هلند",
      volumeGb: 5,
      days: 30,
      deviceLimit: 1,
      priceToman: 60_000,
      panels: { connect: [{ id: panelB.id }] },
    },
  });

  const user = await db.user.create({
    data: { email: "planpanel@test.local", passwordHash: "scrypt:x:y" },
  });

  // پلن محدود، بدون انتخاب سرور → باید روی سرور B ساخته شود
  const boundOrder = await db.order.create({
    data: {
      code: "FD-PP-01", userId: user.id, planId: boundPlan.id,
      amount: boundPlan.priceToman, payable: boundPlan.priceToman, status: "pending_review",
    },
  });
  const boundService = await fulfillOrder(boundOrder.id);
  check("پلن محدود روی سرور تعیین‌شده ساخته شد", boundService.panelId === panelB.id, boundService.panelId);

  // پلن آزاد → کم‌بارترین سرور (اینجا A چون B یک سرویس دارد)
  const openOrder = await db.order.create({
    data: {
      code: "FD-PP-02", userId: user.id, planId: openPlan.id,
      amount: openPlan.priceToman, payable: openPlan.priceToman, status: "pending_review",
    },
  });
  const openService = await fulfillOrder(openOrder.id);
  check("پلن آزاد روی کم‌بارترین سرور ساخته شد", openService.panelId === panelA.id, openService.panelId);

  // انتخاب سرور غیرمجاز باید نادیده گرفته شود و به سرور مجاز برگردد
  const wrongOrder = await db.order.create({
    data: {
      code: "FD-PP-03", userId: user.id, planId: boundPlan.id, panelId: panelA.id,
      amount: boundPlan.priceToman, payable: boundPlan.priceToman, status: "pending_review",
    },
  });
  const wrongService = await fulfillOrder(wrongOrder.id);
  check(
    "سرور غیرمجاز برای پلن نادیده گرفته شد",
    wrongService.panelId === panelB.id,
    wrongService.panelId,
  );
}

/** کیف پول، پاداش دعوت، یادآوری انقضا و تمدید خودکار */
async function walletScenario() {
  console.log("\n══════ کیف پول، اعلان‌ها و تمدید خودکار ══════");
  await reset();
  await saveSettings({
    trial_enabled: "0",
    wallet_enabled: "1",
    auto_renew_enabled: "1",
    referral_percent: "10",
    expiry_reminder_days: "3",
    quota_warn_percent: "85",
  });

  const panel = await db.panel.create({
    data: {
      name: "W", location: "آلمان", flag: "🇩🇪", url: MOCK_V2,
      username: "admin", password: "admin", inboundId: 1,
      templateEmail: "template-vip", multiInbound: false, isActive: true,
    },
  });
  const plan = await db.plan.create({
    data: { title: "ماهانه", volumeGb: 10, days: 30, deviceLimit: 1, priceToman: 100_000 },
  });

  const inviter = await db.user.create({
    data: { email: "inviter@test.local", passwordHash: "x", referralCode: "INV123" },
  });
  const buyer = await db.user.create({
    data: { email: "buyer-wallet@test.local", passwordHash: "x", referredById: inviter.id },
  });

  // --- عملیات پایه کیف پول
  await creditWallet(buyer.id, 300_000, "topup", "شارژ آزمایشی");
  const afterCredit = await db.user.findUniqueOrThrow({ where: { id: buyer.id } });
  check("شارژ کیف پول ثبت شد", afterCredit.balance === 300_000, afterCredit.balance);

  await debitWallet(buyer.id, 100_000, "purchase", "خرید آزمایشی");
  const afterDebit = await db.user.findUniqueOrThrow({ where: { id: buyer.id } });
  check("برداشت از کیف پول درست بود", afterDebit.balance === 200_000, afterDebit.balance);

  let insufficient = false;
  try {
    await debitWallet(buyer.id, 999_000_000, "purchase", "بیش از موجودی");
  } catch {
    insufficient = true;
  }
  check("برداشت بیش از موجودی جلوگیری شد", insufficient);

  const txCount = await db.walletTx.count({ where: { userId: buyer.id } });
  check("تراکنش‌ها ثبت شدند", txCount === 2, txCount);

  // --- پاداش دعوت روی اولین خرید
  const order = await db.order.create({
    data: {
      code: "FD-W-01", userId: buyer.id, planId: plan.id, panelId: panel.id,
      amount: plan.priceToman, payable: plan.priceToman, status: "pending_review",
    },
  });
  const service = await fulfillOrder(order.id);
  const { payReferralBonus } = await import("../src/lib/referral");
  await payReferralBonus(buyer.id, plan.priceToman);

  const inviterAfter = await db.user.findUniqueOrThrow({ where: { id: inviter.id } });
  check("پاداش دعوت ۱۰٪ واریز شد", inviterAfter.balance === 10_000, inviterAfter.balance);
  const referralNote = await db.notification.findFirst({
    where: { userId: inviter.id, kind: "referral" },
  });
  check("اعلان پاداش دعوت ساخته شد", Boolean(referralNote));

  // --- یادآوری انقضا (۲ روز مانده)
  await db.service.update({
    where: { id: service.id },
    data: {
      expiresAt: new Date(Date.now() + 2 * 86_400_000),
      lastSyncAt: new Date(),
      status: "active",
    },
  });
  await runMaintenance();
  const reminder = await db.notification.findFirst({
    where: { userId: buyer.id, kind: "expiry_soon", serviceId: service.id },
  });
  check("یادآوری انقضا برای کاربر ساخته شد", Boolean(reminder), reminder?.title);

  // تکرار نباید اعلان دوباره بسازد
  await runMaintenance();
  const reminderCount = await db.notification.count({
    where: { userId: buyer.id, kind: "expiry_soon", serviceId: service.id },
  });
  check("یادآوری تکراری ارسال نشد", reminderCount === 1, reminderCount);

  // --- هشدار اتمام حجم
  await db.service.update({
    where: { id: service.id },
    data: { usedBytes: 9.2 * GB, totalBytes: 10 * GB, lastSyncAt: new Date() },
  });
  await runMaintenance();
  const quotaNote = await db.notification.findFirst({
    where: { userId: buyer.id, kind: "quota_low", serviceId: service.id },
  });
  check("هشدار اتمام حجم ساخته شد", Boolean(quotaNote), quotaNote?.title);

  // --- تمدید خودکار از کیف پول
  const before = await db.service.findUniqueOrThrow({ where: { id: service.id } });
  const balanceBefore = (await db.user.findUniqueOrThrow({ where: { id: buyer.id } })).balance;
  await db.service.update({
    where: { id: service.id },
    data: {
      autoRenew: true,
      expiresAt: new Date(Date.now() + 12 * 3_600_000),
      lastSyncAt: new Date(),
      status: "active",
    },
  });
  await runMaintenance();

  const renewed = await db.service.findUniqueOrThrow({ where: { id: service.id } });
  const balanceAfter = (await db.user.findUniqueOrThrow({ where: { id: buyer.id } })).balance;
  check(
    "تمدید خودکار مبلغ پلن را از کیف پول کم کرد",
    balanceBefore - balanceAfter === plan.priceToman,
    [balanceBefore, balanceAfter],
  );
  check(
    "تاریخ انقضا بعد از تمدید خودکار جلو رفت",
    (renewed.expiresAt?.getTime() ?? 0) > (before.expiresAt?.getTime() ?? 0),
    renewed.expiresAt,
  );
  const autoNote = await db.notification.findFirst({
    where: { userId: buyer.id, kind: "auto_renew" },
  });
  check("اعلان تمدید خودکار ساخته شد", Boolean(autoNote));

  // --- موجودی ناکافی: فقط هشدار، بدون تمدید
  await db.user.update({ where: { id: buyer.id }, data: { balance: 0 } });
  await db.notification.deleteMany({ where: { userId: buyer.id, kind: "expiry_soon" } });
  await db.service.update({
    where: { id: service.id },
    data: { expiresAt: new Date(Date.now() + 6 * 3_600_000), lastSyncAt: new Date() },
  });
  await runMaintenance();
  const lowBalanceNote = await db.notification.findFirst({
    where: { userId: buyer.id, kind: "expiry_soon" },
    orderBy: { createdAt: "desc" },
  });
  check(
    "با موجودی ناکافی، هشدار شارژ داده شد",
    Boolean(lowBalanceNote && lowBalanceNote.title.includes("موجودی")),
    lowBalanceNote?.title,
  );
}

/** پایش سرورها: تشخیص خرابی، توقف خودکار فروش و بازگشت */
async function monitorScenario() {
  console.log("\n══════ پایش سرورها ══════");
  await reset();
  await saveSettings({ monitor_enabled: "1", monitor_fail_threshold: "3", trial_enabled: "0" });

  const up = await db.panel.create({
    data: {
      name: "سرور سالم",
      location: "آلمان",
      url: MOCK_V2,
      username: "admin",
      password: "admin",
      templateEmail: "template-vip",
      subBase: "https://sub.test.local/sub",
      sortOrder: 1,
    },
  });
  // پورتی که هیچ سرویسی روی آن نیست ⇒ اتصال رد می‌شود
  const down = await db.panel.create({
    data: {
      name: "سرور خراب",
      location: "هلند",
      url: "http://127.0.0.1:9",
      username: "admin",
      password: "admin",
      templateEmail: "template-vip",
      subBase: "https://sub.test.local/sub",
      sortOrder: 2,
    },
  });

  const healthy = await probePanel(up);
  check("سرور سالم پاسخ داد", healthy.ok, healthy.message);
  check("زمان پاسخ اندازه‌گیری شد", healthy.latencyMs >= 0 && healthy.latencyMs < 20_000, healthy.latencyMs);

  const broken = await probePanel(down);
  check("سرور خراب تشخیص داده شد", !broken.ok, broken.message);

  let downPanel = down;
  for (let i = 0; i < 2; i += 1) {
    await checkPanel(downPanel);
    downPanel = await db.panel.findUniqueOrThrow({ where: { id: down.id } });
  }
  check("قبل از رسیدن به حد مجاز، فروش متوقف نشد", !downPanel.autoDisabled, downPanel.failCount);

  await checkPanel(downPanel);
  downPanel = await db.panel.findUniqueOrThrow({ where: { id: down.id } });
  check("بعد از ۳ خرابی پیاپی، فروش روی سرور خراب متوقف شد", downPanel.autoDisabled, downPanel.failCount);
  check("خطای آخرین بررسی ذخیره شد", Boolean(downPanel.lastError), downPanel.lastError?.slice(0, 40));

  await checkPanel(up);
  const chosen = await pickPanel(down.id);
  check("سرور خراب حتی وقتی مستقیم انتخاب شده باشد کنار گذاشته می‌شود", chosen.id === up.id, chosen.name);

  const stats = await uptimeStats(24);
  check("آپتایم سرور سالم ۱۰۰٪ است", stats.get(up.id)?.uptime === 100, stats.get(up.id));
  check("آپتایم سرور خراب صفر است", stats.get(down.id)?.uptime === 0, stats.get(down.id));
  check("تاریخچه بررسی‌ها ثبت شد", (await db.panelCheck.count()) >= 4);

  // سرور برمی‌گردد
  await db.panel.update({ where: { id: down.id }, data: { url: MOCK_V2 } });
  const recovered = await checkPanel(await db.panel.findUniqueOrThrow({ where: { id: down.id } }));
  const afterRecover = await db.panel.findUniqueOrThrow({ where: { id: down.id } });
  check("سرور بعد از بازگشت دوباره سالم شد", recovered.ok && !afterRecover.autoDisabled);
  check("شمارنده خرابی صفر شد", afterRecover.failCount === 0, afterRecover.failCount);

  const maintenance = await runMaintenance();
  check("کارهای پس‌زمینه هر دو سرور را بررسی کرد", maintenance.panelsChecked === 2, maintenance.panelsChecked);

  await db.panelCheck.updateMany({ data: { createdAt: new Date(Date.now() - 10 * 86_400_000) } });
  const pruned = await pruneChecks(7);
  check("تاریخچه قدیمی پاک شد", pruned > 0 && (await db.panelCheck.count()) === 0, pruned);
}

/** پرداخت آنلاین: شروع پرداخت، بازگشت از درگاه، تأیید و تحویل خودکار */
async function gatewayScenario() {
  console.log("\n══════ درگاه پرداخت آنلاین ══════");
  await reset();

  const customConfig = {
    requestUrl: `${MOCK_GATEWAY}/request`,
    verifyUrl: `${MOCK_GATEWAY}/verify`,
    startUrl: `${MOCK_GATEWAY}/pay/{ref}`,
    currency: "rial",
    auth: "none",
    keyField: "api_key",
    amountField: "amount",
    callbackField: "callback",
    orderField: "order_id",
    descriptionField: "description",
    refPath: "data.token",
    successPath: "status",
    successValue: "100",
    callbackRefParam: "token",
    verifyRefPath: "data.ref_id",
  };

  await saveSettings({
    gateway_enabled: "1",
    gateway_driver: "custom",
    gateway_key: GATEWAY_KEY,
    gateway_min_amount: "10000",
    gateway_custom: JSON.stringify(customConfig),
    trial_enabled: "0",
  });

  const settingsNow = await getSettings();
  check("درگاه آمادهٔ استفاده تشخیص داده شد", gatewayReady(settingsNow));

  const panel = await db.panel.create({
    data: {
      name: "GW-PANEL",
      location: "آلمان",
      url: MOCK_V2,
      username: "admin",
      password: "admin",
      templateEmail: "template-vip",
      subBase: "https://sub.test.local/sub",
      inboundId: 1,
    },
  });
  const plan = await db.plan.create({
    data: { title: "پلن درگاه", volumeGb: 10, days: 30, deviceLimit: 2, priceToman: 150_000, sortOrder: 1 },
  });
  const user = await db.user.create({
    data: { email: "gateway@test.local", passwordHash: "scrypt:x:y" },
  });

  const order = await db.order.create({
    data: {
      code: "FD-GW01",
      userId: user.id,
      kind: "plan",
      payMethod: "online",
      planId: plan.id,
      panelId: panel.id,
      amount: plan.priceToman,
      payable: plan.priceToman,
      status: "awaiting_payment",
    },
  });

  const started = await startPayment({
    amount: order.payable,
    orderCode: order.code,
    description: "تست پرداخت",
    callbackUrl: "http://127.0.0.1:3000/api/pay/callback/FD-GW01",
  });
  check("کد پیگیری از درگاه گرفته شد", Boolean(started.ref), started.ref);
  check("آدرس پرداخت ساخته شد", started.payUrl.startsWith(`${MOCK_GATEWAY}/pay/`), started.payUrl);

  await db.order.update({
    where: { id: order.id },
    data: { gateway: started.driver, gatewayRef: started.ref },
  });

  // قبل از پرداخت، تأیید باید رد شود
  const early = await verifyPayment({
    driver: "custom",
    ref: started.ref,
    amount: order.payable,
    orderCode: order.code,
    params: {},
  });
  check("تراکنش پرداخت‌نشده تأیید نمی‌شود", !early.ok, early.message);

  // کاربر روی صفحهٔ درگاه پرداخت می‌کند
  await fetch(started.payUrl, { redirect: "manual" });

  const verified = await verifyPayment({
    driver: "custom",
    ref: started.ref,
    amount: order.payable,
    orderCode: order.code,
    params: { token: started.ref, status: "1" },
  });
  check("تراکنش پرداخت‌شده تأیید شد", verified.ok, verified.message);
  check("شماره پیگیری بانک برگشت", verified.refId === `BANK-${order.code}`, verified.refId);

  const completed = await completePaidOrder(order.id, {
    gateway: "custom",
    ref: started.ref,
    bankRef: verified.refId,
  });
  check("سفارش پرداخت‌شده تکمیل شد", completed.ok && completed.kind === "plan");

  const afterOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  const service = await db.service.findFirst({ where: { orderId: order.id } });
  check("وضعیت سفارش approved شد", afterOrder.status === "approved", afterOrder.status);
  check("زمان پرداخت ثبت شد", Boolean(afterOrder.paidAt));
  check("شماره پیگیری بانک روی سفارش ذخیره شد", afterOrder.bankRef === verified.refId);
  check("سرویس بعد از پرداخت آنلاین تحویل شد", Boolean(service), service?.clientEmail);

  const again = await completePaidOrder(order.id);
  check("تکمیل دوباره، سرویس تکراری نمی‌سازد", again.ok && (await db.service.count()) === 1);

  // مبلغ دستکاری‌شده نباید تأیید شود
  const tampered = await verifyPayment({
    driver: "custom",
    ref: started.ref,
    amount: 1_000,
    orderCode: order.code,
    params: { token: started.ref },
  });
  check("مبلغ دستکاری‌شده رد شد", !tampered.ok, tampered.message);

  // شارژ کیف پول با درگاه
  const topup = await db.order.create({
    data: {
      code: "FD-GW02",
      userId: user.id,
      kind: "topup",
      payMethod: "online",
      amount: 200_000,
      payable: 200_000,
      status: "awaiting_payment",
    },
  });
  const topupStart = await startPayment({
    amount: topup.payable,
    orderCode: topup.code,
    description: "شارژ کیف پول",
    callbackUrl: "http://127.0.0.1:3000/api/pay/callback/FD-GW02",
  });
  await fetch(topupStart.payUrl, { redirect: "manual" });
  const topupVerify = await verifyPayment({
    driver: "custom",
    ref: topupStart.ref,
    amount: topup.payable,
    orderCode: topup.code,
    params: { token: topupStart.ref },
  });
  await completePaidOrder(topup.id, { gateway: "custom", ref: topupStart.ref, bankRef: topupVerify.refId });
  const walletUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  check("شارژ آنلاین کیف پول انجام شد", walletUser.balance === 200_000, walletUser.balance);

  // پرداخت ناموفق
  const failedOrder = await db.order.create({
    data: {
      code: "FD-GW03",
      userId: user.id,
      kind: "plan",
      payMethod: "online",
      planId: plan.id,
      amount: plan.priceToman,
      payable: plan.priceToman,
      status: "awaiting_payment",
    },
  });
  const failStart = await startPayment({
    amount: failedOrder.payable,
    orderCode: failedOrder.code,
    description: "تست ناموفق",
    callbackUrl: "http://127.0.0.1:3000/api/pay/callback/FD-GW03",
  });
  await fetch(`${failStart.payUrl}?fail=1`, { redirect: "manual" });
  const failVerify = await verifyPayment({
    driver: "custom",
    ref: failStart.ref,
    amount: failedOrder.payable,
    orderCode: failedOrder.code,
    params: { token: failStart.ref, status: "0" },
  });
  check("پرداخت ناموفق تأیید نمی‌شود", !failVerify.ok, failVerify.message);
  check("سرویسی برای پرداخت ناموفق ساخته نشد", (await db.service.count()) === 1);

  await saveSettings({ gateway_enabled: "0" });
  check("با خاموش‌بودن درگاه، پرداخت آنلاین در دسترس نیست", !gatewayReady(await getSettings()));
}

/** اعلان پوش: کلیدها، اشتراک دستگاه و مقاوم‌بودن در برابر خطا */
async function pushScenario() {
  console.log("\n══════ اعلان پوش ══════");
  await reset();
  await saveSettings({ push_enabled: "0", vapid_public: "", vapid_private: "" });

  check("وقتی پوش خاموش است، کلید عمومی داده نمی‌شود", (await pushPublicKey()) === null);

  const keys = await ensureVapidKeys();
  check("کلید VAPID ساخته شد", keys.publicKey.length > 40 && keys.privateKey.length > 20);
  const again = await ensureVapidKeys();
  check("کلید دوباره ساخته نمی‌شود", again.publicKey === keys.publicKey);
  check("تا وقتی پوش روشن نشده، آماده نیست", !(await pushReady()));

  await saveSettings({ push_enabled: "1" });
  check("بعد از روشن‌کردن، پوش آماده است", await pushReady());
  check("کلید عمومی به مرورگر داده می‌شود", (await pushPublicKey()) === keys.publicKey);

  const user = await db.user.create({
    data: { email: "push@test.local", passwordHash: "scrypt:x:y" },
  });

  const endpoint = "https://push.example.com/endpoint/abc";
  await saveSubscription(user.id, { endpoint, keys: { p256dh: "key-1", auth: "auth-1" } }, "Test/1.0");
  await saveSubscription(user.id, { endpoint, keys: { p256dh: "key-2", auth: "auth-2" } }, "Test/1.0");
  const subs = await db.pushSub.findMany({ where: { userId: user.id } });
  check("اشتراک تکراری یک ردیف می‌ماند", subs.length === 1, subs.length);
  check("کلیدهای اشتراک به‌روزرسانی شد", subs[0].p256dh === "key-2", subs[0].p256dh);

  // اشتراک ساختگی: ارسال باید بی‌سروصدا شکست بخورد، نه اینکه خطا بدهد
  const sent = await sendPushToUser(user.id, { title: "تست", body: "متن" });
  check("ارسال به اشتراک نامعتبر خطا نمی‌دهد", sent === 0, sent);

  const broadcast = await broadcastPush({ title: "اطلاعیه" });
  check("اطلاعیه همگانی هم امن است", broadcast.users === 1 && broadcast.sent === 0, broadcast);

  await notifyUser({
    userId: user.id,
    kind: "announcement",
    title: "اعلان با پوش روشن",
    body: "باید ثبت شود حتی اگر پوش شکست بخورد",
  });
  const note = await db.notification.findFirst({ where: { userId: user.id } });
  check("اعلان درون‌سایتی با وجود شکست پوش ثبت شد", Boolean(note), note?.title);

  await removeSubscription(endpoint);
  check("اشتراک حذف شد", (await db.pushSub.count()) === 0);

  await saveSettings({ push_enabled: "0" });
  check("با خاموش‌کردن، ارسال پوش انجام نمی‌شود", (await sendPushToUser(user.id, { title: "x" })) === 0);
}

/** دو زبانه بودن سایت: دیکشنری کامل و قالب‌بندی وابسته به زبان */
function i18nScenario() {
  console.log("\n══════ دو زبانه بودن سایت ══════");

  // هر کلیدی که در فارسی هست باید در انگلیسی هم باشد
  const flatten = (dict: Record<string, unknown>, prefix = ""): string[] =>
    Object.entries(dict).flatMap(([key, value]) =>
      value && typeof value === "object"
        ? flatten(value as Record<string, unknown>, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    );

  const faKeys = flatten(DICT.fa as Record<string, unknown>);
  const enKeys = new Set(flatten(DICT.en as Record<string, unknown>));
  const missing = faKeys.filter((key) => !enKeys.has(key));
  check("همهٔ کلیدهای فارسی ترجمهٔ انگلیسی دارند", missing.length === 0, missing.slice(0, 6));

  check("ترجمه انگلیسی برگردانده می‌شود", t("en", "nav.plans") === "Pricing", t("en", "nav.plans"));
  check("ترجمه فارسی برگردانده می‌شود", t("fa", "nav.plans") === "تعرفه‌ها", t("fa", "nav.plans"));
  check(
    "کلید ناموجود، خود کلید را برمی‌گرداند",
    t("en", "nope.nothing.here") === "nope.nothing.here",
  );
  check(
    "متغیرها در متن جایگزین می‌شوند",
    t("en", "status.ofServers", { ok: 2, total: 3 }) === "2 of 3 servers are available.",
    t("en", "status.ofServers", { ok: 2, total: 3 }),
  );

  const faFmt = fmt("fa" as Locale);
  const enFmt = fmt("en" as Locale);
  check("ارقام فارسی در حالت فارسی", faFmt.num(1250) === "۱۲۵۰", faFmt.num(1250));
  check("ارقام لاتین در حالت انگلیسی", enFmt.num(1250) === "1250", enFmt.num(1250));
  check("واحد پول فارسی", faFmt.money(150000).includes("تومان"), faFmt.money(150000));
  check("واحد پول انگلیسی", enFmt.money(150000) === "150,000 Toman", enFmt.money(150000));
  check("حجم انگلیسی با واحد لاتین", enFmt.bytes(10 * GB) === "10 GB", enFmt.bytes(10 * GB));
  check("حجم فارسی با واحد فارسی", faFmt.bytes(10 * GB).includes("گیگابایت"), faFmt.bytes(10 * GB));
  check("نامحدود در هر دو زبان", enFmt.bytes(0) === "Unlimited" && faFmt.bytes(0) === "نامحدود");

  const sample = new Date("2026-03-21T10:30:00Z");
  check("تاریخ میلادی در انگلیسی", /2026/.test(enFmt.date(sample)), enFmt.date(sample));
  check("تاریخ شمسی در فارسی", /۱۴۰/.test(faFmt.date(sample)), faFmt.date(sample));
  check("مدت انگلیسی", enFmt.days(30) === "30 days", enFmt.days(30));
  check("تعداد دستگاه انگلیسی", enFmt.devices(1) === "1 device", enFmt.devices(1));
}

/** هوش‌پی، چند درگاهی، و پرداخت تتری */
async function hooshpayAndCryptoScenario() {
  console.log("\n══════ هوش‌پی و پرداخت تتری ══════");
  await reset();
  await saveSettings({
    card_enabled: "1",
    wallet_enabled: "1",
    crypto_enabled: "1",
    crypto_min_amount: "0",
    usdt_rate_auto: "0",
    usdt_rate_manual: "60000",
    usdt_rate_margin: "2",
    trial_enabled: "0",
  });

  const secret = "hp-secret-test";
  const gateway = await db.gateway.create({
    data: {
      driver: "hooshpay",
      label: "هوش‌پی",
      apiKey: GATEWAY_KEY,
      apiSecret: secret,
      isActive: true,
      minAmount: 10_000,
      config: JSON.stringify({ feeMode: "buyer" }),
    },
  });
  check("درگاه هوش‌پی قابل استفاده تشخیص داده شد", gatewayUsable(gateway));

  const incomplete = await db.gateway.create({
    data: { driver: "zarinpal", label: "زرین‌پال بدون کلید", apiKey: "", isActive: true },
  });
  check("درگاه بدون کلید در فهرست فعال‌ها نمی‌آید", !gatewayUsable(incomplete));
  check(
    "فقط درگاه‌های کامل به مشتری پیشنهاد می‌شوند",
    (await activeGateways(150_000)).every((g) => g.id === gateway.id),
  );

  const panel = await db.panel.create({
    data: {
      name: "HP-PANEL",
      location: "آلمان",
      url: MOCK_V2,
      username: "admin",
      password: "admin",
      templateEmail: "template-vip",
      subBase: "https://sub.test.local/sub",
      inboundId: 1,
    },
  });
  const plan = await db.plan.create({
    data: { title: "پلن هوش‌پی", volumeGb: 10, days: 30, deviceLimit: 2, priceToman: 250_000, sortOrder: 1 },
  });
  const user = await db.user.create({
    data: { email: "hooshpay@test.local", passwordHash: "scrypt:x:y" },
  });

  const order = await db.order.create({
    data: {
      code: "FD-HP01",
      userId: user.id,
      kind: "plan",
      payMethod: "online",
      gatewayId: gateway.id,
      planId: plan.id,
      panelId: panel.id,
      amount: plan.priceToman,
      payable: plan.priceToman,
      status: "awaiting_payment",
    },
  });

  const started = await startWithGateway(gateway, {
    amount: order.payable,
    orderCode: order.code,
    description: "تست هوش‌پی",
    callbackUrl: "http://127.0.0.1:3000/api/pay/callback/FD-HP01",
  });
  check("فاکتور هوش‌پی ساخته شد", started.ref.startsWith("inv_"), started.ref);
  check("آدرس پرداخت هوش‌پی برگشت", started.payUrl.includes("/pay/inv_"), started.payUrl);
  await db.order.update({ where: { id: order.id }, data: { gatewayRef: started.ref } });

  const early = await verifyWithGateway(gateway, {
    ref: started.ref,
    amount: order.payable,
    orderCode: order.code,
    params: {},
  });
  check("فاکتور پرداخت‌نشده تأیید نمی‌شود", !early.ok, early.message);

  // مشتری روی صفحهٔ هوش‌پی پرداخت می‌کند
  await fetch(`${MOCK_GATEWAY}/pay/${started.ref}`, { redirect: "manual" });
  const verified = await verifyWithGateway(gateway, {
    ref: started.ref,
    amount: order.payable,
    orderCode: order.code,
    params: {},
  });
  check("فاکتور پرداخت‌شده تأیید شد", verified.ok, verified.message);
  check("کد رهگیری هوش‌پی برگشت", verified.refId === `HP-${order.code}`, verified.refId);

  await completePaidOrder(order.id, { gateway: "hooshpay", ref: started.ref, bankRef: verified.refId });
  const hpService = await db.service.findFirst({ where: { orderId: order.id } });
  check("سرویس بعد از پرداخت هوش‌پی تحویل شد", Boolean(hpService), hpService?.clientEmail);

  // امضای وب‌هوک
  const payload = { event: "payment.success", invoice: "inv_x", order_id: "FD-HP01", amount: 250000 };
  const signature = hooshpaySignature(payload, secret);
  check("امضای وب‌هوک ساخته شد", signature.length === 64, signature.slice(0, 12));
  check("امضای درست پذیرفته می‌شود", validHooshpaySignature(payload, signature, secret));
  check("امضای غلط رد می‌شود", !validHooshpaySignature(payload, signature, "wrong-secret"));
  check(
    "دستکاری محتوا امضا را باطل می‌کند",
    !validHooshpaySignature({ ...payload, amount: 1 }, signature, secret),
  );
  check(
    "ترتیب کلیدها روی امضا اثر ندارد",
    hooshpaySignature({ amount: 250000, order_id: "FD-HP01", invoice: "inv_x", event: "payment.success" }, secret) ===
      signature,
  );

  // انتقال تنظیمات تک‌درگاهی قدیمی
  await db.gateway.deleteMany();
  await saveSettings({
    gateway_enabled: "1",
    gateway_driver: "zarinpal",
    gateway_key: "legacy-merchant",
    gateway_min_amount: "20000",
  });
  const moved = await migrateLegacyGateway();
  const migrated = await db.gateway.findFirst();
  check("درگاه قدیمی به جدول منتقل شد", moved && migrated?.apiKey === "legacy-merchant", migrated?.driver);
  check("انتقال دوباره تکرار نمی‌شود", !(await migrateLegacyGateway()));

  /* ------------------------------ پرداخت تتری ------------------------------ */
  const rate = await usdtRate();
  check("نرخ دستی با حاشیه اعمال شد", rate.toman === 61_200, rate.toman);
  check("تبدیل تومان به تتر رو به بالا است", tomanToUsdt(250_000, 61_200) === 4.09, tomanToUsdt(250_000, 61_200));

  const methodsNoWallet = await availableMethods(250_000);
  check("بدون آدرس کیف پول، پرداخت تتری پیشنهاد نمی‌شود", !methodsNoWallet.crypto);

  await db.cryptoWallet.create({
    data: { network: "trc20", symbol: "USDT", address: "TTestWalletAddressForE2E0000000000", isActive: true },
  });
  const methods = await availableMethods(250_000);
  check("با آدرس فعال، پرداخت تتری در دسترس است", methods.crypto);
  check("کارت‌به‌کارت هم فعال است", methods.card);

  const quote = await quoteCrypto(250_000);
  check("مبلغ تتری سفارش محاسبه شد", quote.amount > 0 && quote.rate === 61_200, quote);

  const cryptoOrder = await db.order.create({
    data: {
      code: "FD-CR01",
      userId: user.id,
      kind: "plan",
      payMethod: "crypto",
      planId: plan.id,
      panelId: panel.id,
      amount: plan.priceToman,
      payable: plan.priceToman,
      status: "awaiting_receipt",
      cryptoAmount: quote.amount,
      cryptoRate: quote.rate,
      cryptoAddress: "TTestWalletAddressForE2E0000000000",
      cryptoNetwork: "USDT-TRC20",
    },
  });
  check("مبلغ و نرخ روی سفارش تتری قفل شد", cryptoOrder.cryptoRate === 61_200);

  await db.order.update({
    where: { id: cryptoOrder.id },
    data: { cryptoTxHash: "0xtesthash1234567890abcdef", status: "pending_review", paidAt: new Date() },
  });
  await completePaidOrder(cryptoOrder.id);
  const cryptoService = await db.service.findFirst({ where: { orderId: cryptoOrder.id } });
  const afterCrypto = await db.order.findUniqueOrThrow({ where: { id: cryptoOrder.id } });
  check("بعد از تأیید مدیر، سرویس تتری تحویل شد", Boolean(cryptoService));
  check("وضعیت سفارش تتری approved شد", afterCrypto.status === "approved", afterCrypto.status);

  // خاموش‌کردن روش‌ها از پنل مدیریت
  await saveSettings({ crypto_enabled: "0", card_enabled: "0" });
  const off = await availableMethods(250_000);
  check("خاموش‌کردن روش‌ها از تنظیمات اثر می‌کند", !off.crypto && !off.card);
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

  await planPanelScenario();
  await walletScenario();
  await monitorScenario();
  await gatewayScenario();
  await hooshpayAndCryptoScenario();
  await pushScenario();
  i18nScenario();

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
