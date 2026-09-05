/**
 * تست سرتاسری منطق فروش + اتصال به پنل 3x-ui.
 * سناریو دو بار اجرا می‌شود: یک بار روی پنل نسخه ۲ (نام کاربری/رمز) و یک بار
 * روی پنل نسخه ۳ (API رسمی با توکن Bearer).
 *
 *   bash scripts/test.sh
 */
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { rm, utimes, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { db } from "../src/lib/db";
import { GB } from "../src/lib/format";
import {
  createServiceOnPanel,
  createTrialService,
  fulfillOrder,
  migrateService,
  panelClient,
  pickPanel,
  removeService,
  renewServiceOnPanel,
  resetServiceTraffic,
  rotateCooldownLeft,
  rotateService,
  serviceLinks,
  syncService,
  trialPanelId,
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
import {
  customQuote,
  renameCustomer,
  resellerCreateCustomService,
  resellerCreateService,
  resellerOptions,
  resellerPlans,
  resellerPrice,
  resellerRenewCustom,
  resellerRenewService,
  resellerServices,
  resellerStats,
} from "../src/lib/reseller";
import { checkCustom, customPrice, customRates, ratesReady } from "../src/lib/pricing";
import { DEFAULT_THEME_ID, THEMES, themeById, themeCss, themeVars } from "../src/lib/themes";
import { displayName, isImageFile, saveUpload } from "../src/lib/uploads";
import { completePaidOrder, orderTitle } from "../src/lib/orders";
import {
  ensureVapidKeys,
  pushPublicKey,
  pushReady,
  removeSubscription,
  saveSubscription,
  sendPushToUser,
} from "../src/lib/push";
import {
  autoBackupDue,
  createBackup,
  decryptArchive,
  encryptArchive,
  isEncryptedArchive,
  deleteBackup,
  listBackups,
  makeTar,
  pruneBackups,
  readBackup,
  readTar,
  restoreBackup,
  runAutoBackup,
  safeBackupName,
  sendBackupToTelegram,
} from "../src/lib/backup";
import {
  backupCodesLeft,
  base32Decode,
  base32Encode,
  currentTotp,
  newBackupCodes,
  newTotpSecret,
  otpauthUrl,
  totpCode,
  redeemBackupCode,
  verifyTotp,
} from "../src/lib/totp";
import { hashPassword, isStaff, roleLabel, verifyPassword } from "../src/lib/roles";
import { sendMail } from "../src/lib/mail";
import {
  checkResetToken,
  completePasswordReset,
  pruneResetTokens,
  requestPasswordReset,
} from "../src/lib/reset";
import { announceToUsers, audienceUserIds, notifyUser, unreadCount } from "../src/lib/notify";
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

  const broadcast = await announceToUsers({ audience: "all", title: "اطلاعیه", push: true });
  check("اطلاعیه همگانی با پوشِ شکست‌خورده هم ثبت می‌شود", broadcast.users >= 1 && broadcast.pushed === 0, broadcast);

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

/** نمایندگی: قیمت عمده، کسر از اعتبار، مالکیت سرویس‌ها و کاربر ویژه */
async function resellerScenario() {
  console.log("\n══════ پنل نمایندگی و کاربر ویژه ══════");
  await reset();
  await saveSettings({ card_enabled: "1", card_vip_only: "1", wallet_enabled: "1", trial_enabled: "0" });

  const panel = await db.panel.create({
    data: {
      name: "RS-PANEL",
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
    data: { title: "پلن نمایندگی", volumeGb: 20, days: 30, deviceLimit: 2, priceToman: 200_000, sortOrder: 1 },
  });

  // قیمت عمده
  check("قیمت با ۲۵٪ تخفیف درست حساب شد", resellerPrice(200_000, 25) === 150_000, resellerPrice(200_000, 25));
  check("تخفیف صفر یعنی قیمت کامل", resellerPrice(200_000, 0) === 200_000);
  check("تخفیف بیش از حد محدود می‌شود", resellerPrice(200_000, 200) === resellerPrice(200_000, 90));

  const reseller = await db.user.create({
    data: {
      email: "reseller@test.local",
      passwordHash: "scrypt:x:y",
      isReseller: true,
      resellerOff: 25,
      resellerName: "فروشگاه تست",
      balance: 400_000,
    },
  });
  const normal = await db.user.create({
    data: { email: "normal@test.local", passwordHash: "scrypt:x:y", balance: 0 },
  });

  const priced = await resellerPlans(reseller.resellerOff);
  check("لیست قیمت نماینده ساخته شد", priced[0]?.price === 150_000 && priced[0]?.saving === 50_000, priced[0]);

  // فروش سرویس
  const sold = await resellerCreateService({
    resellerId: reseller.id,
    planId: plan.id,
    panelId: panel.id,
    customerName: "مشتری اول",
  });
  const afterSale = await db.user.findUniqueOrThrow({ where: { id: reseller.id } });
  check("سرویس مشتری ساخته شد", Boolean(sold.clientEmail), sold.clientEmail);
  check("مبلغ عمده از اعتبار کم شد", afterSale.balance === 250_000, afterSale.balance);
  check("سرویس به نماینده نسبت داده شد", sold.resellerId === reseller.id);
  check("نام مشتری ذخیره شد", sold.customerName === "مشتری اول", sold.customerName);

  const saleTx = await db.walletTx.findFirst({
    where: { userId: reseller.id, kind: "reseller_sale" },
  });
  check("تراکنش فروش نمایندگی ثبت شد", saleTx?.amount === -150_000, saleTx?.amount);

  // سرویس نمایندگی نباید در پنل شخصی نماینده بیاید
  const personal = await db.service.count({ where: { userId: reseller.id, resellerId: null } });
  const asReseller = await resellerServices(reseller.id);
  check("سرویس مشتری در پنل شخصی نماینده نمی‌آید", personal === 0, personal);
  check("سرویس در فهرست نمایندگی هست", asReseller.length === 1, asReseller.length);

  // تمدید
  const renewed = await resellerRenewService({ resellerId: reseller.id, serviceId: sold.id });
  const afterRenew = await db.user.findUniqueOrThrow({ where: { id: reseller.id } });
  check("حجم بعد از تمدید دو برابر شد", renewed.totalBytes === 40 * GB, renewed.totalBytes);
  check("مبلغ تمدید هم از اعتبار کم شد", afterRenew.balance === 100_000, afterRenew.balance);
  check("لینک اشتراک مشتری بعد از تمدید عوض نشد", renewed.subId === sold.subId);

  // موجودی ناکافی
  let blocked = "";
  try {
    await resellerCreateService({
      resellerId: reseller.id,
      planId: plan.id,
      panelId: panel.id,
      customerName: "مشتری دوم",
    });
  } catch (err) {
    blocked = (err as Error).message;
  }
  check("با موجودی کم، فروش انجام نمی‌شود", blocked.includes("موجودی"), blocked);
  check(
    "بعد از تلاش ناموفق، اعتبار دست‌نخورده ماند",
    (await db.user.findUniqueOrThrow({ where: { id: reseller.id } })).balance === 100_000,
  );

  // کاربر عادی نمی‌تواند بفروشد
  let denied = "";
  try {
    await resellerCreateService({ resellerId: normal.id, planId: plan.id, customerName: "x" });
  } catch (err) {
    denied = (err as Error).message;
  }
  check("کاربر عادی نمی‌تواند از مسیر نمایندگی سرویس بسازد", denied.includes("نمایندگی"), denied);

  // تغییر نام مشتری فقط برای سرویس‌های خود نماینده
  await renameCustomer(reseller.id, sold.id, "مشتری تغییرنام‌یافته");
  const renamed = await db.service.findUniqueOrThrow({ where: { id: sold.id } });
  check("نام مشتری تغییر کرد", renamed.customerName === "مشتری تغییرنام‌یافته");

  let foreign = "";
  try {
    await renameCustomer(normal.id, sold.id, "دزدیده‌شده");
  } catch (err) {
    foreign = (err as Error).message;
  }
  check("نماینده دیگر نمی‌تواند سرویس این نماینده را عوض کند", foreign.includes("فهرست شما"), foreign);

  const stats = await resellerStats(reseller.id);
  check("گزارش نمایندگی درست است", stats.services === 1 && stats.spent === 300_000, stats);

  /* ------------------------------ کاربر ویژه ------------------------------ */
  const vip = await db.user.create({
    data: { email: "vip@test.local", passwordHash: "scrypt:x:y", isVip: true },
  });

  const forNormal = await availableMethods(200_000, { isVip: false });
  const forVip = await availableMethods(200_000, { isVip: vip.isVip });
  check("کاربر عادی شماره کارت را نمی‌بیند", !forNormal.card);
  check("کاربر ویژه کارت‌به‌کارت را می‌بیند", forVip.card);

  await saveSettings({ card_vip_only: "0" });
  check("با خاموش‌کردن حالت ویژه، کارت برای همه باز می‌شود", (await availableMethods(200_000)).card);

  await saveSettings({ card_enabled: "0" });
  check(
    "اگر کارت‌به‌کارت خاموش باشد، حتی کاربر ویژه هم نمی‌بیند",
    !(await availableMethods(200_000, { isVip: true })).card,
  );
}

/* ------------------------------ پشتیبان‌گیری ------------------------------ */

async function backupScenario() {
  console.log("\n══════ پشتیبان‌گیری و بازیابی ══════");
  await reset();

  const dir = path.resolve("data/e2e-backups");
  process.env.BACKUP_DIR = dir;
  await rm(dir, { recursive: true, force: true });

  /* ۱) tar دست‌ساز باید بی‌کم‌وکاست باز شود (فایل باینری و نام بلند) */
  const binary = Buffer.from(Array.from({ length: 1500 }, (_, i) => i % 256));
  const roundTrip = readTar(
    makeTar([
      { name: "manifest.json", data: Buffer.from('{"a":1}', "utf8") },
      { name: "uploads/receipt-با-نام-فارسی.jpg", data: binary },
    ]),
  );
  check("tar دو فایل را برمی‌گرداند", roundTrip.length === 2, roundTrip.map((e) => e.name));
  check(
    "محتوای باینری بعد از tar دست‌نخورده است",
    Buffer.from(roundTrip[1].data).equals(binary),
  );
  check(
    "نام فایل فارسی در tar سالم می‌ماند",
    roundTrip[1].name === "uploads/receipt-با-نام-فارسی.jpg",
    roundTrip[1].name,
  );

  /* ۲) نام فایل: جلوی path traversal گرفته می‌شود */
  check("نام معتبر پذیرفته می‌شود", safeBackupName("fandogh-backup-2026-01-01-00-00-00.tar.gz") !== null);
  check("نام بدون پیشوند رد می‌شود", safeBackupName("hack.tar.gz") === null);
  check("مسیر بالارونده رد می‌شود", safeBackupName("../../../etc/passwd") === null);
  check(
    "مسیر با پیشوند درست ولی پوشهٔ دیگر هم فقط نامش خوانده می‌شود",
    safeBackupName("/etc/fandogh-backup-x.tar.gz") === "fandogh-backup-x.tar.gz",
  );
  check("فایل غیر tar.gz رد می‌شود", safeBackupName("fandogh-backup-x.db") === null);

  /* ۳) ساخت پشتیبان از وضعیت واقعی دیتابیس */
  await saveSettings({ site_name: "فندق تست" });
  const owner = await db.user.create({
    data: { email: "backup@test.local", name: "کاربر پشتیبان", passwordHash: "x", role: "user" },
  });

  const first = await createBackup("تست");
  check("فایل پشتیبان ساخته شد", first.file.startsWith("fandogh-backup-") && first.size > 0, first);

  const listed = await listBackups();
  check("پشتیبان در فهرست دیده می‌شود", listed.some((f) => f.name === first.file), listed);

  const archive = await readBackup(first.file);
  check("فایل پشتیبان خوانده می‌شود", Boolean(archive));

  const inside = readTar(gunzipSync(archive!));
  const manifest = JSON.parse(
    inside.find((e) => e.name === "manifest.json")!.data.toString("utf8"),
  ) as { site: string; reason: string; counts: Record<string, number> };
  const dbInside = inside.find((e) => e.name === "database.db")!;

  check("دیتابیس داخل پشتیبان هست", Boolean(dbInside));
  check(
    "فایل داخل پشتیبان واقعاً دیتابیس SQLite است",
    Buffer.from(dbInside.data).subarray(0, 15).toString("utf8") === "SQLite format 3",
  );
  check("نام سایت در فهرست پشتیبان ثبت شده", manifest.site === "فندق تست", manifest.site);
  check("علت ساخت پشتیبان ثبت شده", manifest.reason === "تست", manifest.reason);
  check("تعداد کاربران در فهرست درست است", manifest.counts.users === 1, manifest.counts);

  /* ۴) خواندن با نام نامعتبر چیزی برنمی‌گرداند */
  check("خواندن با نام نامعتبر ناموفق است", (await readBackup("../fandogh.db")) === null);
  check("حذف با نام نامعتبر انجام نمی‌شود", (await deleteBackup("../fandogh.db")) === false);

  /* ۵) نگه‌داشتن N تای آخر */
  for (let i = 1; i <= 4; i += 1) {
    const name = `fandogh-backup-2026-01-0${i}-00-00-00.tar.gz`;
    await writeFile(path.join(dir, name), Buffer.from("x"));
    const when = new Date(2026, 0, i);
    await utimes(path.join(dir, name), when, when);
  }
  const removed = await pruneBackups(2);
  const afterPrune = await listBackups();
  check("پشتیبان‌های قدیمی پاک شدند", removed === 3, removed);
  check("فقط ۲ پشتیبان تازه ماند", afterPrune.length === 2, afterPrune.map((f) => f.name));
  check(
    "تازه‌ترین پشتیبان اول فهرست است",
    afterPrune[0].createdAt.getTime() >= afterPrune[1].createdAt.getTime(),
  );

  /* ۶) بازیابی فایل خراب یا نامربوط باید رد شود */
  const corrupt = await restoreBackup(Buffer.from("this is not a gzip file"));
  check("فایل خراب رد می‌شود", !corrupt.ok && corrupt.code === "corrupt", corrupt);

  const notBackup = gzipSync(
    makeTar([{ name: "database.db", data: Buffer.from("just some text, not a database") }]),
  );
  const rejected = await restoreBackup(notBackup);
  check("فایلی که دیتابیس سالم ندارد رد می‌شود", !rejected.ok && rejected.code === "not-a-backup", rejected);

  /* ۷) بازیابی واقعی: تغییرات بعد از پشتیبان باید برگردند */
  const snapshot = await createBackup("قبل از تغییر");
  await saveSettings({ site_name: "نام عوض‌شده" });
  const ghost = await db.user.create({
    data: { email: "ghost@test.local", name: "کاربر بعد از پشتیبان", passwordHash: "x", role: "user" },
  });
  check("تغییر قبل از بازیابی اعمال شده بود", (await getSettings()).site_name === "نام عوض‌شده");

  const restored = await restoreBackup((await readBackup(snapshot.file))!);
  check("بازیابی موفق بود", restored.ok && restored.code === "restored", restored);
  check("قبل از بازیابی، پشتیبان ایمنی ساخته شد", Boolean(restored.safetyCopy), restored.safetyCopy);
  check("فهرست پشتیبان داخل فایل خوانده شد", restored.manifest?.site === "فندق تست", restored.manifest);

  const settingsAfter = await getSettings();
  check("تنظیمات به حالت پشتیبان برگشت", settingsAfter.site_name === "فندق تست", settingsAfter.site_name);
  check(
    "کاربر ساخته‌شده بعد از پشتیبان دیگر نیست",
    (await db.user.findUnique({ where: { id: ghost.id } })) === null,
  );
  check(
    "کاربر قبل از پشتیبان سر جایش هست",
    (await db.user.findUnique({ where: { id: owner.id } }))?.email === "backup@test.local",
  );

  /* ۸) زمان‌بندی خودکار */
  await saveSettings({ backup_auto: "0", backup_interval_hours: "24", backup_last_at: "0" });
  check("با خاموش بودن، پشتیبان خودکار گرفته نمی‌شود", (await autoBackupDue()) === false);

  await saveSettings({ backup_auto: "1", backup_last_at: String(Date.now()) });
  check("درست بعد از پشتیبان، نوبت بعدی نرسیده", (await autoBackupDue()) === false);

  await saveSettings({ backup_last_at: String(Date.now() - 25 * 3_600_000) });
  check("بعد از گذشتن فاصلهٔ تعیین‌شده، نوبت رسیده", (await autoBackupDue()) === true);

  await saveSettings({ backup_keep: "2", backup_telegram: "0" });
  const auto = await runAutoBackup();
  check("پشتیبان خودکار ساخته شد", Boolean(auto?.file), auto);
  check("پشتیبان خودکار در تلگرام فرستاده نشد (خاموش است)", auto?.sent === false);
  check("بعد از پشتیبان خودکار، فقط ۲ فایل ماند", (await listBackups()).length === 2);
  check("زمان آخرین پشتیبان به‌روز شد", (await autoBackupDue()) === false);
  check("اجرای دوباره پشتیبان تکراری نمی‌سازد", (await runAutoBackup()) === null);

  /* ۹) ارسال به تلگرام بدون ربات نباید خطا بیندازد */
  await saveSettings({ telegram_bot_token: "", telegram_admin_chat_id: "" });
  const sendResult = await sendBackupToTelegram(auto!.file);
  check("بدون ربات، ارسال تلگرام با پیام روشن رد می‌شود", !sendResult.ok && sendResult.code === "no-bot", sendResult);

  /* ۱۰) کارهای پس‌زمینه هم پشتیبان خودکار را اجرا می‌کنند */
  await saveSettings({ backup_last_at: "0", monitor_enabled: "0" });
  const tick = await runMaintenance();
  check("چرخهٔ کارهای پس‌زمینه پشتیبان ساخت", Boolean(tick.backup), tick.backup);

  /* ۱۱) رمزگذاری با گذرواژه */
  const plain = gzipSync(makeTar([{ name: "database.db", data: Buffer.from("SQLite format 3\u0000rest") }]));
  const sealed = encryptArchive(plain, "رمز-تست ۱۲۳");
  check("فایل رمزشده نشانهٔ خودش را دارد", isEncryptedArchive(sealed));
  check("فایل رمزنشده نشانهٔ رمز ندارد", !isEncryptedArchive(plain));
  check("رمزشده با اصل فرق دارد", !sealed.equals(plain));
  check(
    "با گذرواژهٔ درست دقیقاً همان فایل برمی‌گردد",
    decryptArchive(sealed, "رمز-تست ۱۲۳")?.equals(plain) === true,
  );
  check("با گذرواژهٔ غلط باز نمی‌شود", decryptArchive(sealed, "رمز-غلط") === null);
  check(
    "دست‌کاری فایل رمزشده لو می‌رود",
    decryptArchive(
      Buffer.concat([sealed.subarray(0, sealed.length - 1), Buffer.from([sealed[sealed.length - 1] ^ 0xff])]),
      "رمز-تست ۱۲۳",
    ) === null,
  );
  check("هر بار نمک و بردار تازه است", !encryptArchive(plain, "x").equals(encryptArchive(plain, "x")));

  await saveSettings({ backup_password: "گذرواژهٔ فروشگاه ۹۹" });
  await saveSettings({ site_name: "فندق رمزدار" });
  const encBackup = await createBackup("تست رمزگذاری");
  check("نام فایل رمزشده پسوند enc دارد", encBackup.file.endsWith(".tar.gz.enc"), encBackup.file);
  check(
    "فایل رمزشده در فهرست با نشان رمز می‌آید",
    (await listBackups()).find((f) => f.name === encBackup.file)?.encrypted === true,
  );
  check("محتوای روی دیسک رمز است", isEncryptedArchive((await readBackup(encBackup.file))!));

  const needsPass = await restoreBackup((await readBackup(encBackup.file))!);
  check("بازیابی بدون گذرواژه رد می‌شود", needsPass.code === "needs-password", needsPass);

  const wrongPass = await restoreBackup((await readBackup(encBackup.file))!, "یک چیز دیگر");
  check("بازیابی با گذرواژهٔ غلط رد می‌شود", wrongPass.code === "bad-password", wrongPass);

  await saveSettings({ site_name: "عوض شد دوباره" });
  const withPass = await restoreBackup((await readBackup(encBackup.file))!, "گذرواژهٔ فروشگاه ۹۹");
  check("بازیابی با گذرواژهٔ درست انجام می‌شود", withPass.ok && withPass.code === "restored", withPass);
  check(
    "دادهٔ داخل پشتیبان رمزشده درست برگشت",
    (await getSettings()).site_name === "فندق رمزدار",
    (await getSettings()).site_name,
  );

  await saveSettings({ backup_password: "" });
  const backToPlain = await createBackup("بدون رمز");
  check("با خالی‌کردن گذرواژه، پشتیبان تازه رمز ندارد", !backToPlain.file.endsWith(".enc"), backToPlain.file);
  check(
    "پشتیبان رمزنشده بدون گذرواژه بازیابی می‌شود",
    (await restoreBackup((await readBackup(backToPlain.file))!)).ok,
  );

  check("نام فایل enc معتبر است", safeBackupName("fandogh-backup-2026-01-01-00-00-00.tar.gz.enc") !== null);
  check("پسوند ناشناس رد می‌شود", safeBackupName("fandogh-backup-x.tar.gz.exe") === null);

  await rm(dir, { recursive: true, force: true });
  delete process.env.BACKUP_DIR;
}

/* ------------------------- انتقال سرویس بین سرورها ------------------------- */

async function migrateScenario() {
  console.log("\n══════ انتقال سرویس بین سرورها ══════");
  await reset();
  await saveSettings({ trial_enabled: "0" });

  const source = await db.panel.create({
    data: {
      name: "سرور قدیمی", location: "آلمان", flag: "🇩🇪", url: MOCK_V2,
      username: "admin", password: "admin", inboundId: 1,
      templateEmail: "template-vip", multiInbound: false, sortOrder: 1,
      subBase: "https://old.test.local/sub",
    },
  });
  const target = await db.panel.create({
    data: {
      name: "سرور تازه", location: "هلند", flag: "🇳🇱", url: MOCK_V2,
      username: "admin", password: "admin", inboundId: 2,
      templateEmail: "template-alt", multiInbound: false, sortOrder: 2,
      subBase: "https://new.test.local/sub",
    },
  });

  const plan = await db.plan.create({
    data: { title: "۱۰ گیگ", volumeGb: 10, days: 30, deviceLimit: 2, priceToman: 100_000 },
  });
  const buyer = await db.user.create({
    data: { email: "move@test.local", name: "مشتری انتقالی", passwordHash: "x" },
  });

  const before = await createServiceOnPanel({
    userId: buyer.id,
    userEmail: buyer.email,
    plan: { volumeGb: plan.volumeGb, days: plan.days, deviceLimit: plan.deviceLimit },
    planId: plan.id,
    panel: source,
    code: "MOVE-1",
    remark: "سرویس انتقالی",
  });

  // ۳ گیگ مصرف روی سرور قدیمی
  await fetch(`${MOCK_V2}/_mock/usage?email=${encodeURIComponent(before.clientEmail)}&up=${GB}&down=${2 * GB}`);
  const synced = await syncService(before.id, true);
  check("مصرف اولیه روی سرور قدیمی ثبت شد", Math.round(synced.usedBytes / GB) === 3, synced.usedBytes / GB);

  const moved = await migrateService(before.id, target.id);
  const after = moved.service;

  check("سرویس روی سرور تازه نشست", after.panelId === target.id, after.panelId);
  check("نام سرور قبلی ثبت شد", after.movedFrom === "سرور قدیمی", after.movedFrom);
  check("زمان انتقال ثبت شد", Boolean(after.movedAt));
  check("آمار از پنل قبلی خوانده شد", moved.usageFromPanel);
  check("کلاینت قدیمی از سرور قبلی پاک شد", moved.oldRemoved);
  check("فقط باقی‌مانده منتقل شد", Math.round(moved.remainingBytes / GB) === 7, moved.remainingBytes / GB);

  check("حجم کل سرویس عوض نشده", Math.round(after.totalBytes / GB) === 10, after.totalBytes / GB);
  check("مصرف قبلی حفظ شد", Math.round(after.usedBytes / GB) === 3, after.usedBytes / GB);
  check("مصرف قبلی در usageOffset نگه داشته شد", Math.round(after.usageOffset / GB) === 3, after.usageOffset / GB);
  check(
    "تاریخ انقضا دست‌نخورده ماند",
    Math.abs((after.expiresAt?.getTime() ?? 0) - (before.expiresAt?.getTime() ?? 0)) < 2000,
  );
  check("شناسه اشتراک (subId) همان است", after.subId === before.subId);
  check("UUID تازه است", after.uuid !== before.uuid);
  check("نام کلاینت تازه است", after.clientEmail !== before.clientEmail);
  check("اینباند سرور مقصد گرفته شد", after.inboundId === 2, after.inboundId);

  const targetClient = new XuiClient({
    url: target.url, username: "admin", password: "admin", insecure: true,
  });
  const onTarget = await targetClient.getClientTraffics(after.clientEmail);
  check("کلاینت روی سرور مقصد ساخته شد", Boolean(onTarget));
  check("سهمیهٔ کلاینت تازه، باقی‌ماندهٔ سرویس است", Math.round((onTarget?.total ?? 0) / GB) === 7, onTarget?.total);

  const sourceClient = new XuiClient({
    url: source.url, username: "admin", password: "admin", insecure: true,
  });
  const oldClients = await sourceClient.listClients(1);
  check(
    "کلاینت قدیمی روی سرور قبلی نمانده",
    !oldClients.some((c) => c.email === before.clientEmail),
    oldClients.map((c) => c.email),
  );

  // مصرف تازه روی سرور مقصد روی مصرف قبلی سوار می‌شود
  await fetch(`${MOCK_V2}/_mock/usage?email=${encodeURIComponent(after.clientEmail)}&up=${GB}&down=0`);
  const resynced = await syncService(after.id, true);
  check("مصرف بعد از انتقال جمع می‌شود", Math.round(resynced.usedBytes / GB) === 4, resynced.usedBytes / GB);
  check("حجم کل بعد از همگام‌سازی هم درست است", Math.round(resynced.totalBytes / GB) === 10, resynced.totalBytes / GB);

  const links = await serviceLinks(after.id);
  check("لینک اشتراک از سرور تازه ساخته می‌شود", links.subscription.includes("new.test.local"), links.subscription);

  // تمدید بعد از انتقال هم باید حجم را روی همان مبنا اضافه کند
  const renewed = await renewServiceOnPanel(resynced, { volumeGb: 5, days: 10, deviceLimit: 2, id: plan.id });
  check("تمدید بعد از انتقال حجم را درست بالا می‌برد", Math.round(renewed.totalBytes / GB) === 15, renewed.totalBytes / GB);
  check("مصرف بعد از تمدید هم حفظ شد", Math.round(renewed.usedBytes / GB) === 4, renewed.usedBytes / GB);

  // صفر کردن مصرف، مصرف انتقال‌یافته را هم پاک می‌کند
  await resetServiceTraffic(renewed.id);
  const zeroed = await db.service.findUniqueOrThrow({ where: { id: renewed.id } });
  check("صفرکردن مصرف، مصرف انتقالی را هم صفر می‌کند", zeroed.usedBytes === 0 && zeroed.usageOffset === 0, zeroed.usedBytes);

  /* انتقال از سرور خراب: آمار از دیتابیس و کلاینت قدیمی باقی می‌ماند */
  const dead = await db.panel.create({
    data: {
      name: "سرور خراب", location: "فرانسه", flag: "🇫🇷", url: "http://127.0.0.1:9",
      username: "admin", password: "admin", inboundId: 1, templateEmail: "template-vip",
      multiInbound: false, sortOrder: 3,
    },
  });
  const stranded = await db.service.create({
    data: {
      userId: buyer.id, planId: plan.id, panelId: dead.id, remark: "روی سرور خراب",
      clientEmail: "stranded-client", uuid: randomUUID(), subId: "abcdef0123456789",
      inboundId: 1, clientRefs: JSON.stringify([{ inboundId: 1, email: "stranded-client" }]),
      totalBytes: 10 * GB, usedBytes: 4 * GB, deviceLimit: 1,
      expiresAt: new Date(Date.now() + 15 * 86_400_000), status: "active",
    },
  });

  const rescued = await migrateService(stranded.id, target.id);
  check("انتقال از سرور خراب هم انجام می‌شود", rescued.service.panelId === target.id);
  check("آمار از دیتابیس برداشته شد", rescued.usageFromPanel === false);
  check("کلاینت روی سرور خراب پاک نشد (و خطا نداد)", rescued.oldRemoved === false);
  check("باقی‌ماندهٔ درست منتقل شد", Math.round(rescued.remainingBytes / GB) === 6, rescued.remainingBytes / GB);
  check("مصرف قبلی از دیتابیس حفظ شد", Math.round(rescued.service.usedBytes / GB) === 4);

  /* سرویس نامحدود: باقی‌مانده هم نامحدود می‌ماند */
  const unlimited = await createServiceOnPanel({
    userId: buyer.id,
    userEmail: buyer.email,
    plan: { volumeGb: 0, days: 0, deviceLimit: 0 },
    planId: null,
    panel: source,
    code: "MOVE-2",
    remark: "نامحدود",
  });
  const movedUnlimited = await migrateService(unlimited.id, target.id);
  check("سرویس نامحدود بعد از انتقال نامحدود می‌ماند", movedUnlimited.remainingBytes === 0);
  check("حجم کل نامحدود صفر می‌ماند", movedUnlimited.service.totalBytes === 0);

  /* انتقال به همان سرور باید رد شود */
  let sameRejected = false;
  try {
    await migrateService(movedUnlimited.service.id, target.id);
  } catch {
    sameRejected = true;
  }
  check("انتقال به سرور فعلی رد می‌شود", sameRejected);
}

/* --------------------- ورود دومرحله‌ای و نقش پشتیبان --------------------- */

function securityScenario() {
  console.log("\n══════ ورود دومرحله‌ای و نقش‌ها ══════");

  /* Base32 رفت و برگشت */
  const raw = Buffer.from("فندق-test-secret", "utf8");
  check("Base32 رفت و برگشت درست است", base32Decode(base32Encode(raw)).equals(raw));
  check("کلید تازه ۳۲ کاراکتری Base32 است", /^[A-Z2-7]{32}$/.test(newTotpSecret()), newTotpSecret());

  /* بردار آزمون رسمی RFC 6238 (کلید "12345678901234567890") */
  const rfcSecret = base32Encode(Buffer.from("12345678901234567890", "utf8"));
  check("کد RFC 6238 در ثانیهٔ ۵۹ درست است", totpCode(rfcSecret, Math.floor(59 / 30)) === "287082");
  check("کد RFC 6238 در ثانیهٔ ۱۱۱۱۱۱۱۰۹ درست است", totpCode(rfcSecret, Math.floor(1111111109 / 30)) === "081804");
  check("کد RFC 6238 در ثانیهٔ ۱۲۳۴۵۶۷۸۹ درست است", totpCode(rfcSecret, Math.floor(1234567890 / 30)) === "005924");

  /* پذیرش کد فعلی و رد کد غلط */
  const secret = newTotpSecret();
  const now = Date.now();
  check("کد لحظهٔ فعلی پذیرفته می‌شود", verifyTotp(secret, currentTotp(secret, now), now));
  check("کد ۳۰ ثانیه قبل هم پذیرفته می‌شود", verifyTotp(secret, currentTotp(secret, now - 30_000), now));
  check("کد ۳۰ ثانیه بعد هم پذیرفته می‌شود", verifyTotp(secret, currentTotp(secret, now + 30_000), now));
  check("کد ۵ دقیقه قبل رد می‌شود", !verifyTotp(secret, currentTotp(secret, now - 300_000), now));
  check("کد کلید دیگر رد می‌شود", !verifyTotp(secret, currentTotp(newTotpSecret(), now), now));
  check("کد ناقص رد می‌شود", !verifyTotp(secret, "12345", now));
  check("متن غیرعددی رد می‌شود", !verifyTotp(secret, "abcdef", now));
  check(
    "ارقام فارسی هم پذیرفته می‌شوند",
    verifyTotp(secret, currentTotp(secret, now).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]), now),
  );

  /* آدرس otpauth که اپ احرازهویت می‌خواند */
  const url = otpauthUrl(secret, "admin@test.local", "فندق");
  check("آدرس otpauth کلید را دارد", url.includes(`secret=${secret}`), url);
  check("آدرس otpauth شش‌رقمی و ۳۰ ثانیه‌ای است", url.includes("digits=6") && url.includes("period=30"));

  /* کدهای پشتیبان */
  const backup = newBackupCodes(8);
  check("۸ کد پشتیبان ساخته شد", backup.codes.length === 8);
  check("کدها هش‌شده ذخیره می‌شوند", !backup.hashed.includes(backup.codes[0]));

  const used = redeemBackupCode(backup.hashed, backup.codes[0]);
  check("کد پشتیبان درست پذیرفته می‌شود", used.ok);
  check("کد مصرف‌شده از فهرست حذف می‌شود", used.left === 7, used.left);
  check("همان کد بار دوم کار نمی‌کند", !redeemBackupCode(used.rest, backup.codes[0]).ok);
  check("کد دیگر هنوز کار می‌کند", redeemBackupCode(used.rest, backup.codes[1]).ok);
  check("کد ساختگی رد می‌شود", !redeemBackupCode(used.rest, "00000-00000").ok);
  check("شمارش کدهای باقی‌مانده درست است", backupCodesLeft(used.rest) === 7);

  /* نقش‌ها */
  check("مدیر جزو کارکنان است", isStaff("admin"));
  check("پشتیبان جزو کارکنان است", isStaff("support"));
  check("کاربر عادی جزو کارکنان نیست", !isStaff("user"));
  check("برچسب نقش‌ها درست است", roleLabel("support") === "پشتیبان" && roleLabel("admin") === "مدیر");
}

/* ------------------------- سرور اکانت تست رایگان ------------------------- */

async function trialPanelScenario() {
  console.log("\n══════ انتخاب سرور اکانت تست ══════");
  await reset();
  await saveSettings({ trial_enabled: "1", trial_volume_gb: "1", trial_days: "1", trial_panel_id: "" });

  const normal = await db.panel.create({
    data: {
      name: "سرور فروش", location: "آلمان", flag: "🇩🇪", url: MOCK_V2,
      username: "admin", password: "admin", inboundId: 1,
      templateEmail: "template-vip", multiInbound: false, sortOrder: 1,
    },
  });
  const trialServer = await db.panel.create({
    data: {
      name: "سرور تست", location: "هلند", flag: "🇳🇱", url: MOCK_V2,
      username: "admin", password: "admin", inboundId: 2,
      templateEmail: "template-alt", multiInbound: false, sortOrder: 2,
    },
  });

  const newUser = async (tag: string) =>
    db.user.create({ data: { email: `trial-${tag}-${Date.now()}@test.local`, passwordHash: "x" } });

  /* ۱) بدون تنظیم: انتخاب مشتری رعایت می‌شود */
  const auto = await createTrialService((await newUser("auto")).id, trialServer.id);
  check("بدون تنظیم، لوکیشن انتخابی مشتری رعایت می‌شود", auto.panelId === trialServer.id, auto.panelId);

  const settings = await getSettings();
  check("بدون تنظیم، انتخاب مشتری برگردانده می‌شود", (await trialPanelId(settings, normal.id)) === normal.id);
  check("بدون تنظیم و بدون انتخاب مشتری، خودکار می‌ماند", (await trialPanelId(settings, null)) === null);

  /* ۲) با تنظیم مدیر: انتخاب مشتری نادیده گرفته می‌شود */
  await saveSettings({ trial_panel_id: trialServer.id });
  const fixedSettings = await getSettings();
  check(
    "با تنظیم مدیر، همان سرور برگردانده می‌شود",
    (await trialPanelId(fixedSettings, normal.id)) === trialServer.id,
  );

  const forced = await createTrialService((await newUser("forced")).id, normal.id);
  check("تست از سرور تعیین‌شدهٔ مدیر داده می‌شود", forced.panelId === trialServer.id, forced.panelId);
  check("سرویس تست علامت تست دارد", forced.isTrial && forced.totalBytes === GB, forced.totalBytes);
  check("کلاینت روی اینباند همان سرور ساخته شد", forced.inboundId === 2, forced.inboundId);

  /* ۳) سرور تست خاموش شود: تست بی‌جواب نمی‌ماند */
  await db.panel.update({ where: { id: trialServer.id }, data: { isActive: false } });
  const offSettings = await getSettings();
  check("سرور خاموش، انتخاب را به حالت خودکار برمی‌گرداند", (await trialPanelId(offSettings, null)) === null);

  const fallback = await createTrialService((await newUser("fallback")).id, null);
  check("با خاموش‌بودن سرور تست، سرور دیگری جایگزین می‌شود", fallback.panelId === normal.id, fallback.panelId);

  /* ۴) سرور تست خراب (توسط پایش کنار گذاشته شده) */
  await db.panel.update({
    where: { id: trialServer.id },
    data: { isActive: true, autoDisabled: true },
  });
  const brokenSettings = await getSettings();
  check(
    "سرور خرابِ تعیین‌شده هنوز انتخاب است ولی pickPanel کنارش می‌گذارد",
    (await trialPanelId(brokenSettings, null)) === trialServer.id,
  );
  const rescued = await createTrialService((await newUser("broken")).id, null);
  check("تست روی سرور خراب ساخته نمی‌شود", rescued.panelId === normal.id, rescued.panelId);

  /* ۵) سرور پاک‌شده هم نباید تست را قفل کند */
  await saveSettings({ trial_panel_id: "panel-that-does-not-exist" });
  const goneSettings = await getSettings();
  check("سرور پاک‌شده به حالت خودکار برمی‌گردد", (await trialPanelId(goneSettings, null)) === null);

  await saveSettings({ trial_panel_id: "" });
}

/* ------------------------- بازیابی رمز عبور ------------------------- */

async function resetScenario() {
  console.log("\n══════ بازیابی رمز عبور ══════");
  await reset();

  const SMTP_PORT = Number(process.env.MOCK_SMTP_PORT || 8894);
  const INBOX = `http://127.0.0.1:${SMTP_PORT + 1}/_mail`;
  const lastMail = async () => (await fetch(`${INBOX}/last`).then((r) => r.json())) as
    | { to: string[]; subject: string; text: string }
    | null;

  await fetch(`${INBOX}/clear`).catch(() => null);
  process.env.APP_URL = "https://shop.test.local";

  const user = await db.user.create({
    data: {
      email: "forgot@test.local",
      name: "کاربر فراموشکار",
      passwordHash: hashPassword("old-password-123"),
    },
  });

  /* ۱) بدون تنظیم SMTP هیچ ایمیلی فرستاده نمی‌شود */
  await saveSettings({ smtp_host: "", smtp_from: "" });
  const noSmtp = await requestPasswordReset(user.email);
  check("بدون تنظیم SMTP، بازیابی خاموش است", noSmtp.code === "not-configured", noSmtp);
  check("بدون SMTP، ایمیل ساخته نمی‌شود", (await db.passwordReset.count()) === 0);

  /* ۲) با تنظیم SMTP، ایمیل واقعی فرستاده می‌شود */
  await saveSettings({
    smtp_host: "127.0.0.1",
    smtp_port: String(SMTP_PORT),
    smtp_secure: "0",
    smtp_user: process.env.MOCK_SMTP_USER || "shop",
    smtp_pass: process.env.MOCK_SMTP_PASS || "smtp-pass",
    smtp_from: "فندق <no-reply@test.local>",
    reset_enabled: "1",
  });

  const sent = await requestPasswordReset(user.email);
  check("درخواست بازیابی ثبت شد", sent.code === "sent" && Boolean(sent.token), sent.code);

  const mail = await lastMail();
  check("ایمیل به همان کاربر رسید", Boolean(mail?.to?.includes(user.email)), mail?.to);
  check("موضوع ایمیل درست است", (mail?.subject ?? "").includes("بازیابی رمز عبور"), mail?.subject);
  check("لینک بازیابی داخل ایمیل هست", (mail?.text ?? "").includes(sent.token!), mail?.text?.slice(0, 120));
  check(
    "لینک روی آدرس سایت ساخته می‌شود",
    (mail?.text ?? "").includes("https://shop.test.local/reset?token="),
    mail?.text?.slice(0, 160),
  );

  /* ۳) خودِ توکن در دیتابیس ذخیره نمی‌شود، فقط هشش */
  const row = await db.passwordReset.findFirstOrThrow({ where: { userId: user.id } });
  check("توکن خام در دیتابیس نیست", row.tokenHash !== sent.token);
  check(
    "هش ذخیره‌شده همان SHA-256 توکن است",
    row.tokenHash === createHash("sha256").update(sent.token!).digest("hex"),
  );

  /* ۴) ایمیل ناموجود همان پیام را می‌دهد (فهرست کاربران لو نرود) */
  await fetch(`${INBOX}/clear`);
  const ghost = await requestPasswordReset("nobody@test.local");
  check("ایمیل ناموجود هم پیام یکسان می‌گیرد", ghost.code === "sent" && !ghost.token, ghost);
  check("برای ایمیل ناموجود ایمیلی فرستاده نمی‌شود", (await lastMail()) === null);

  /* ۵) توکن نامعتبر و منقضی */
  check("توکن الکی رد می‌شود", (await checkResetToken("not-a-real-token")).code === "invalid");
  check("توکن درست هنوز معتبر است", (await checkResetToken(sent.token!)).ok);

  await db.passwordReset.update({
    where: { id: row.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  check("توکن منقضی رد می‌شود", (await checkResetToken(sent.token!)).code === "expired");
  check(
    "با توکن منقضی رمز عوض نمی‌شود",
    (await completePasswordReset(sent.token!, "brand-new-pass")).code === "expired",
  );
  await db.passwordReset.update({
    where: { id: row.id },
    data: { expiresAt: new Date(Date.now() + 600_000) },
  });

  /* ۶) درخواست تازه، لینک قبلی را باطل می‌کند */
  const second = await requestPasswordReset(user.email);
  check("درخواست تازه ثبت شد", second.code === "sent" && second.token !== sent.token);
  check("لینک قبلی دیگر کار نمی‌کند", (await checkResetToken(sent.token!)).code === "invalid");
  check("فقط یک درخواست باز می‌ماند", (await db.passwordReset.count({ where: { userId: user.id } })) === 1);

  /* ۷) نشست‌های باز بعد از تغییر رمز بسته می‌شوند */
  await db.session.create({
    data: { id: "old-session-token", userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) },
  });

  const done = await completePasswordReset(second.token!, "brand-new-pass-9");
  check("رمز تازه ثبت شد", done.ok && done.code === "done", done);

  const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  check("رمز تازه کار می‌کند", verifyPassword("brand-new-pass-9", updated.passwordHash));
  check("رمز قبلی دیگر کار نمی‌کند", !verifyPassword("old-password-123", updated.passwordHash));
  check("همهٔ نشست‌ها بسته شدند", (await db.session.count({ where: { userId: user.id } })) === 0);
  check(
    "به کاربر اعلان تغییر رمز داده شد",
    (await db.notification.count({ where: { userId: user.id, kind: "security" } })) === 1,
  );

  /* ۸) توکن یک‌بارمصرف است */
  check(
    "همان لینک بار دوم کار نمی‌کند",
    (await completePasswordReset(second.token!, "another-pass-9")).code === "used",
  );

  /* ۹) کاربر مسدود لینک نمی‌گیرد */
  await fetch(`${INBOX}/clear`);
  await db.user.update({ where: { id: user.id }, data: { isBlocked: true } });
  const blocked = await requestPasswordReset(user.email);
  check("کاربر مسدود لینک بازیابی نمی‌گیرد", blocked.code === "sent" && !blocked.token);
  check("برای کاربر مسدود ایمیلی نرفت", (await lastMail()) === null);
  await db.user.update({ where: { id: user.id }, data: { isBlocked: false } });

  /* ۱۰) پاک‌سازی توکن‌های قدیمی */
  await db.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: "expired-hash-for-prune",
      expiresAt: new Date(Date.now() - 86_400_000),
    },
  });
  const pruned = await pruneResetTokens();
  check("توکن‌های منقضی و مصرف‌شده پاک شدند", pruned >= 1, pruned);
  check("چیزی از توکن‌های باطل نمی‌ماند", (await db.passwordReset.count()) === 0);

  /* ۱۱) ایمیل آزمایشی */
  await fetch(`${INBOX}/clear`);
  const test = await sendMail({
    to: "admin@test.local",
    subject: "ایمیل آزمایشی",
    text: "سلام از فندق",
  });
  check("ارسال ایمیل آزمایشی موفق بود", test.ok && test.code === "sent", test);
  check("متن ایمیل آزمایشی درست رسید", ((await lastMail())?.text ?? "").includes("سلام از فندق"));

  await saveSettings({ smtp_host: "", smtp_from: "", smtp_user: "", smtp_pass: "" });
  delete process.env.APP_URL;
}

/* -------------------------- اطلاعیه به کاربران -------------------------- */

async function announceScenario() {
  console.log("\n══════ اطلاعیه به کاربران ══════");
  await reset();

  const shopper = await db.user.create({
    data: { email: "note-shopper@test.local", passwordHash: "x" },
  });
  const reseller = await db.user.create({
    data: { email: "note-reseller@test.local", passwordHash: "x", isReseller: true, resellerOff: 20 },
  });
  const blocked = await db.user.create({
    data: { email: "note-blocked@test.local", passwordHash: "x", isBlocked: true },
  });

  const panel = await db.panel.create({
    data: {
      name: "سرور اطلاعیه", location: "آلمان", url: MOCK_V2, username: "admin", password: "admin",
      inboundId: 1, templateEmail: "template-vip", multiInbound: false,
    },
  });
  await db.service.create({
    data: {
      userId: shopper.id, panelId: panel.id, remark: "سرویس فعال",
      clientEmail: "note-active-client", uuid: randomUUID(), subId: "aabbccddeeff0011",
      inboundId: 1, totalBytes: 10 * GB, status: "active",
    },
  });

  /* مخاطب‌ها */
  check("گروه «همه» کاربران مسدود را ندارد", (await audienceUserIds("all")).length === 2);
  check("گروه «سرویس فعال» فقط مشتری را دارد", (await audienceUserIds("active")).join() === shopper.id);
  check("گروه «نمایندگان» فقط نماینده را دارد", (await audienceUserIds("resellers")).join() === reseller.id);

  /* ارسال به همه */
  const all = await announceToUsers({
    audience: "all",
    title: "سرور آلمان ارتقا پیدا کرد",
    body: "سرعت بیشتر، بدون تغییر لینک اشتراک.",
  });
  check("اطلاعیه برای هر دو کاربر ثبت شد", all.users === 2, all);
  check(
    "کاربر مسدود اطلاعیه نگرفت",
    (await db.notification.count({ where: { userId: blocked.id } })) === 0,
  );

  const stored = await db.notification.findFirstOrThrow({ where: { userId: shopper.id } });
  check("نوع اعلان «اطلاعیه» است", stored.kind === "announcement", stored.kind);
  check("عنوان و متن درست ثبت شد", stored.title === "سرور آلمان ارتقا پیدا کرد" && Boolean(stored.body));
  check("لینک پیش‌فرض به فهرست اعلان‌هاست", stored.href === "/dashboard/notifications", stored.href);
  check("اعلان خوانده‌نشده است", stored.readAt === null);

  /* ارسال گروهی با لینک دلخواه */
  const onlyResellers = await announceToUsers({
    audience: "resellers",
    title: "قیمت عمده به‌روز شد",
    href: "/reseller/prices",
  });
  check("اطلاعیهٔ نمایندگان فقط یک گیرنده داشت", onlyResellers.users === 1, onlyResellers);
  check(
    "مشتری عادی اطلاعیهٔ نمایندگان را نگرفت",
    (await db.notification.count({ where: { userId: shopper.id } })) === 1,
  );
  const resellerNote = await db.notification.findFirstOrThrow({ where: { userId: reseller.id, title: "قیمت عمده به‌روز شد" } });
  check("لینک دلخواه ثبت شد", resellerNote.href === "/reseller/prices", resellerNote.href);

  /* بدون گیرنده */
  await db.user.update({ where: { id: reseller.id }, data: { isReseller: false } });
  const empty = await announceToUsers({ audience: "resellers", title: "بدون مخاطب" });
  check("وقتی گیرنده‌ای نیست چیزی ثبت نمی‌شود", empty.users === 0, empty);
  check(
    "اطلاعیهٔ بی‌مخاطب در دیتابیس نمی‌ماند",
    (await db.notification.count({ where: { title: "بدون مخاطب" } })) === 0,
  );

  /* شمارش خوانده‌نشده‌ها برای زنگ اعلان */
  check("زنگ اعلان کاربر عدد درست را نشان می‌دهد", (await unreadCount(shopper.id)) === 1);
}

/* --------------------- حجم دلخواه، حجم اضافه و پیوست --------------------- */

async function customPricingScenario() {
  console.log("\n══════ حجم دلخواه، حجم اضافه و پیوست تیکت ══════");
  await reset();
  await saveSettings({
    wallet_enabled: "1",
    trial_enabled: "0",
    custom_price_per_gb: "3000",
    custom_price_per_day: "1000",
    custom_round_to: "1000",
    custom_min_gb: "5",
    custom_max_gb: "200",
    custom_min_days: "7",
    custom_max_days: "180",
    custom_device_limit: "2",
    addon_enabled: "1",
    reseller_custom_enabled: "1",
    reseller_plans_visible: "1",
  });

  /* ------------------------------ حساب قیمت ------------------------------ */
  const rates = customRates(await getSettings());
  check("نرخ‌ها از تنظیمات خوانده شد", rates.perGb === 3000 && rates.perDay === 1000, rates);
  check("قیمت = گیگ×نرخ + روز×نرخ", customPrice(rates, 10, 30) === 60_000, customPrice(rates, 10, 30));
  check("قیمت فقط حجم (بدون روز)", customPrice(rates, 10, 0) === 30_000, customPrice(rates, 10, 0));
  check("رند رو به بالا انجام می‌شود", customPrice({ ...rates, perGb: 2500, roundTo: 1000 }, 3, 0) === 8000);
  check("بدون رند، قیمت خام می‌ماند", customPrice({ ...rates, perGb: 2500, roundTo: 0 }, 3, 0) === 7500);
  check("نرخ صفر یعنی فروش دلخواه آماده نیست", !ratesReady({ ...rates, perGb: 0, perDay: 0 }));

  check("حجم کمتر از حداقل رد می‌شود", checkCustom(rates, { gb: 1, days: 30 }).ok === false);
  check("حجم بیشتر از حداکثر رد می‌شود", checkCustom(rates, { gb: 500, days: 30 }).ok === false);
  check("مدت کمتر از حداقل رد می‌شود", checkCustom(rates, { gb: 10, days: 1 }).ok === false);
  check("ورودی درست پذیرفته می‌شود", checkCustom(rates, { gb: 10, days: 30 }).ok === true);
  check("در حالت حجم اضافه، روز بررسی نمی‌شود", checkCustom(rates, { gb: 10 }, "addon").ok === true);

  /* ------------------------- خرید حجم اضافه توسط مشتری ------------------------- */
  const panel = await db.panel.create({
    data: {
      name: "ADDON-PANEL",
      location: "فنلاند",
      url: MOCK_V2,
      username: "admin",
      password: "admin",
      templateEmail: "template-vip",
      subBase: "https://sub.test.local/sub",
      inboundId: 1,
    },
  });
  const plan = await db.plan.create({
    data: { title: "پلن پایه", volumeGb: 20, days: 30, deviceLimit: 2, priceToman: 100_000 },
  });
  const user = await db.user.create({
    data: { email: "addon@test.local", passwordHash: "scrypt:x:y", balance: 0 },
  });

  const service = await createServiceOnPanel({
    userId: user.id,
    userEmail: user.email,
    plan,
    planId: plan.id,
    panel,
    code: "FD-ADDON",
    remark: "تست حجم اضافه",
  });
  const beforeExpiry = service.expiresAt?.getTime() ?? 0;
  check("سرویس پایه ساخته شد", service.totalBytes === 20 * GB, service.totalBytes);

  const addonOrder = await db.order.create({
    data: {
      code: "FD-ADDON1",
      userId: user.id,
      kind: "addon",
      payMethod: "card",
      renewServiceId: service.id,
      addonGb: 15,
      amount: customPrice(rates, 15, 0),
      payable: customPrice(rates, 15, 0),
      status: "pending_review",
    },
  });
  check("مبلغ سفارش حجم اضافه درست است", addonOrder.payable === 45_000, addonOrder.payable);

  const afterAddon = await fulfillOrder(addonOrder.id);
  check("حجم اضافه روی سرویس نشست", afterAddon.totalBytes === 35 * GB, afterAddon.totalBytes);
  check("تاریخ انقضا با حجم اضافه عوض نشد", (afterAddon.expiresAt?.getTime() ?? 0) === beforeExpiry);
  check("لینک اشتراک بعد از حجم اضافه عوض نشد", afterAddon.subId === service.subId);
  check(
    "سفارش حجم اضافه تأیید شد",
    (await db.order.findUniqueOrThrow({ where: { id: addonOrder.id } })).status === "approved",
  );
  check("عنوان سفارش حجم اضافه خوانا است", orderTitle("fa", { kind: "addon", addonGb: 15 }).includes("۱۵"));

  // مسیر پرداخت آنلاین: completePaidOrder هم باید همین کار را بکند
  const secondAddon = await db.order.create({
    data: {
      code: "FD-ADDON2",
      userId: user.id,
      kind: "addon",
      payMethod: "online",
      renewServiceId: service.id,
      addonGb: 5,
      amount: 15_000,
      payable: 15_000,
      status: "awaiting_payment",
    },
  });
  const completed = await completePaidOrder(secondAddon.id, { gateway: "test", ref: "ref-addon" });
  const afterSecond = await db.service.findUniqueOrThrow({ where: { id: service.id } });
  check("پرداخت آنلاین حجم اضافه تکمیل شد", completed.ok && completed.kind === "addon", completed);
  check("حجم دوم هم اضافه شد", afterSecond.totalBytes === 40 * GB, afterSecond.totalBytes);

  const addonNotice = await db.notification.findFirst({
    where: { userId: user.id, kind: "order_approved" },
    orderBy: { createdAt: "desc" },
  });
  check("به کاربر اعلان حجم اضافه داده شد", Boolean(addonNotice?.title.includes("حجم اضافه")), addonNotice?.title);

  // سفارش حجم اضافه بدون سرویس باید خطا بدهد
  const orphan = await db.order.create({
    data: { code: "FD-ADDON3", userId: user.id, kind: "addon", addonGb: 10, amount: 1, payable: 1 },
  });
  let orphanError = "";
  try {
    await fulfillOrder(orphan.id);
  } catch (err) {
    orphanError = (err as Error).message;
  }
  check("سفارش حجم اضافهٔ بی‌سرویس رد شد", orphanError.includes("سرویس"), orphanError);

  /* --------------------------- فروش دلخواه نماینده --------------------------- */
  const reseller = await db.user.create({
    data: {
      email: "custom-reseller@test.local",
      passwordHash: "scrypt:x:y",
      isReseller: true,
      resellerOff: 20,
      balance: 500_000,
    },
  });

  const quote = customQuote(rates, 50, 30, 20);
  check("قیمت دلخواه نماینده با تخفیف حساب شد", quote.listPrice === 180_000 && quote.price === 144_000, quote);

  const customService = await resellerCreateCustomService({
    resellerId: reseller.id,
    gb: 50,
    days: 30,
    panelId: panel.id,
    customerName: "مشتری دلخواه",
  });
  const resellerAfterSale = await db.user.findUniqueOrThrow({ where: { id: reseller.id } });
  check("سرویس دلخواه با حجم درخواستی ساخته شد", customService.totalBytes === 50 * GB, customService.totalBytes);
  check("سرویس دلخواه پلن ندارد", customService.planId === null);
  check("تعداد کاربر همزمان از تنظیمات آمد", customService.deviceLimit === 2, customService.deviceLimit);
  check("مبلغ دلخواه از اعتبار نماینده کم شد", resellerAfterSale.balance === 356_000, resellerAfterSale.balance);

  const customExpiry = customService.expiresAt?.getTime() ?? 0;
  const days30 = Math.round((customExpiry - Date.now()) / 86_400_000);
  check("مدت دلخواه روی سرویس نشست", days30 === 30, days30);

  // شارژ دلخواه: فقط حجم
  const onlyVolume = await resellerRenewCustom({
    resellerId: reseller.id,
    serviceId: customService.id,
    gb: 10,
    days: 0,
  });
  check("شارژ فقط‌حجم، حجم را زیاد کرد", onlyVolume.totalBytes === 60 * GB, onlyVolume.totalBytes);
  check(
    "شارژ فقط‌حجم، تاریخ انقضا را دست نزد",
    Math.abs((onlyVolume.expiresAt?.getTime() ?? 0) - customExpiry) < 1000,
  );

  // شارژ دلخواه: حجم و زمان
  const withDays = await resellerRenewCustom({
    resellerId: reseller.id,
    serviceId: customService.id,
    gb: 10,
    days: 30,
  });
  const extended = Math.round(((withDays.expiresAt?.getTime() ?? 0) - customExpiry) / 86_400_000);
  check("شارژ با روز، اعتبار را تمدید کرد", extended === 30, extended);
  check("حجم شارژ دوم هم اضافه شد", withDays.totalBytes === 70 * GB, withDays.totalBytes);

  const renewTx = await db.walletTx.findFirst({
    where: { userId: reseller.id, kind: "reseller_renew" },
    orderBy: { createdAt: "desc" },
  });
  check("تراکنش شارژ دلخواه ثبت شد", (renewTx?.amount ?? 0) < 0, renewTx?.amount);

  // ورودی نامعتبر: نه پولی کم می‌شود نه سرویسی ساخته
  const balanceBefore = (await db.user.findUniqueOrThrow({ where: { id: reseller.id } })).balance;
  let badInput = "";
  try {
    await resellerCreateCustomService({ resellerId: reseller.id, gb: 1, days: 30, customerName: "" });
  } catch (err) {
    badInput = (err as Error).message;
  }
  check("حجم خارج از محدوده رد شد", badInput.includes("کمترین حجم"), badInput);
  check(
    "بعد از ورودی نامعتبر، اعتبار دست‌نخورده ماند",
    (await db.user.findUniqueOrThrow({ where: { id: reseller.id } })).balance === balanceBefore,
  );

  /* ------------------------- کلیدهای روشن/خاموش مدیر ------------------------- */
  await saveSettings({ reseller_plans_visible: "0" });
  const hiddenPlans = await resellerOptions();
  check("با خاموش‌کردن پلن‌ها، نمایش پلن قطع شد", !hiddenPlans.showPlans);
  let planBlocked = "";
  try {
    await resellerCreateService({ resellerId: reseller.id, planId: plan.id, customerName: "x" });
  } catch (err) {
    planBlocked = (err as Error).message;
  }
  check("فروش با پلن آماده در این حالت رد می‌شود", planBlocked.includes("پلن آماده"), planBlocked);

  await saveSettings({ reseller_plans_visible: "1", reseller_custom_enabled: "0" });
  let customBlocked = "";
  try {
    await resellerCreateCustomService({ resellerId: reseller.id, gb: 10, days: 30, customerName: "x" });
  } catch (err) {
    customBlocked = (err as Error).message;
  }
  check("با خاموش‌بودن فروش دلخواه، ساخت رد می‌شود", customBlocked.includes("حجم دلخواه"), customBlocked);
  await saveSettings({ reseller_custom_enabled: "1" });

  /* ---------------------------- پیوست فایل تیکت ---------------------------- */
  const uploads = path.resolve("data/e2e-uploads");
  process.env.UPLOAD_DIR = uploads;

  const png = await saveUpload(new File([new Uint8Array([1, 2, 3, 4])], "shot.png", { type: "image/png" }));
  check("فایل تصویری ذخیره شد", png.ok && png.fileName.endsWith(".png"), png);
  check("پسوند فایل از نوع اعلام‌شده می‌آید", png.ok && !png.fileName.includes("shot"), png);

  const badType = await saveUpload(new File([new Uint8Array([1])], "app.exe", { type: "application/x-msdownload" }));
  check("فایل غیرمجاز رد شد", !badType.ok && badType.error.includes("PDF"), badType);

  const tooBig = await saveUpload(
    new File([new Uint8Array(7 * 1024 * 1024)], "big.png", { type: "image/png" }),
  );
  check("فایل بزرگ‌تر از ۶ مگابایت رد شد", !tooBig.ok && tooBig.error.includes("مگابایت"), tooBig);

  const empty = await saveUpload(new File([], "empty.png", { type: "image/png" }));
  check("فایل خالی ذخیره نمی‌شود", !empty.ok, empty);

  check("نام نمایشی مسیر را حذف می‌کند", displayName("../../etc/passwd") === "passwd");
  check("نام نمایشی کاراکتر خطرناک را پاک می‌کند", !displayName('a<b>"c.png').includes("<"));
  check("نام خالی به برچسب پیش‌فرض می‌رسد", displayName("   ") === "پیوست");
  check("تصویر بودن فایل تشخیص داده می‌شود", isImageFile("a.png") && !isImageFile("a.pdf"));

  if (png.ok) {
    const ticket = await db.ticket.create({
      data: {
        userId: user.id,
        subject: "پیوست تست",
        messages: {
          create: { body: "این هم عکس", attachment: png.fileName, attachmentName: "shot.png" },
        },
      },
      include: { messages: true },
    });
    const stored = ticket.messages[0];
    check("پیوست روی پیام تیکت ذخیره شد", stored.attachment === png.fileName, stored.attachment);
    check("نام اصلی فایل برای نمایش ماند", stored.attachmentName === "shot.png", stored.attachmentName);
  }

  await rm(uploads, { recursive: true, force: true });
  delete process.env.UPLOAD_DIR;
}

/* ---------------------------------- تم سایت --------------------------------- */

async function themeScenario() {
  console.log("\n══════ تم رنگی سایت ══════");
  await reset();

  check("چند تم در دسترس است", THEMES.length >= 4, THEMES.length);
  check("شناسهٔ تم‌ها تکراری نیست", new Set(THEMES.map((t) => t.id)).size === THEMES.length);
  check(
    "همهٔ تم‌ها برچسب فارسی و انگلیسی دارند",
    THEMES.every((t) => t.label.trim() && t.labelEn.trim() && t.hint.trim()),
  );
  check(
    "رنگ نوار مرورگر هر تم معتبر است",
    THEMES.every((t) => /^#[0-9a-f]{6}$/i.test(t.themeColor)),
    THEMES.map((t) => t.themeColor),
  );

  // هیچ تمی نباید متغیر جاافتاده داشته باشد، وگرنه بخشی از سایت رنگ تم قبلی را می‌گیرد
  const keys = Object.keys(themeVars(THEMES[0]));
  const complete = THEMES.every((theme) => {
    const vars = themeVars(theme);
    return keys.every((key) => (vars[key] ?? "").trim().length > 0);
  });
  check("همهٔ تم‌ها همهٔ متغیرها را دارند", complete, keys.length);

  check("تم پیش‌فرض فندق است", themeById(undefined).id === DEFAULT_THEME_ID);
  check("تم ناشناخته به پیش‌فرض برمی‌گردد", themeById("hacker-theme").id === DEFAULT_THEME_ID);
  check("مقدار خالی به پیش‌فرض برمی‌گردد", themeById("").id === DEFAULT_THEME_ID);
  check("تم معتبر همان تم برگردانده می‌شود", themeById("emerald").id === "emerald");

  const css = themeCss(themeById("midnight"));
  check("بلوک CSS تم ساخته شد", css.startsWith(":root{") && css.endsWith("}"), css.slice(0, 40));
  check("رنگ اصلی در بلوک CSS هست", css.includes("--gold:#60a5fa"), css.slice(0, 120));
  check("متغیر ذرات پس‌زمینه هم در بلوک هست", css.includes("--particle-line:"));
  // اگر روزی مقداری از بیرون به تم راه پیدا کند، نباید بتواند از بلوک style بیرون بزند
  const hostile = themeCss({
    ...THEMES[0],
    vars: { ...THEMES[0].vars, accent: "red;} </style><script>x</script>" },
  });
  check(
    "مقدار دستکاری‌شده از بلوک CSS بیرون نمی‌زند",
    !hostile.includes("<") && hostile.split("}").length === 2,
    hostile.slice(0, 80),
  );

  // ذخیره و خواندن از تنظیمات
  const defaults = await getSettings();
  check("تنظیمات پیش‌فرض تم فندق است", defaults.site_theme === DEFAULT_THEME_ID, defaults.site_theme);

  await saveSettings({ site_theme: "royal" });
  const saved = await getSettings();
  check("تم ذخیره‌شده خوانده می‌شود", saved.site_theme === "royal", saved.site_theme);
  check("تم ذخیره‌شده به متغیر درست تبدیل می‌شود", themeVars(themeById(saved.site_theme))["--gold"] === "#a78bfa");

  await saveSettings({ site_theme: DEFAULT_THEME_ID });
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
  await resellerScenario();
  await customPricingScenario();
  await themeScenario();
  await pushScenario();
  await announceScenario();
  await resetScenario();
  await trialPanelScenario();
  await migrateScenario();
  await backupScenario();
  securityScenario();
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
