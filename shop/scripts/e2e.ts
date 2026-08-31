/**
 * تست سرتاسری منطق فروش + اتصال به پنل 3x-ui (روی پنل شبیه‌سازی‌شده).
 *
 *   node scripts/mock-xui.mjs 8899 &
 *   DATABASE_URL="file:../data/e2e.db" npx prisma db push --skip-generate
 *   DATABASE_URL="file:../data/e2e.db" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e.ts
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

const MOCK = process.env.MOCK_PANEL_URL || "http://127.0.0.1:8899";

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

async function main() {
  console.log("→ آماده‌سازی دیتابیس تست");
  await reset();

  await saveSettings({ trial_enabled: "1", trial_volume_gb: "1", trial_days: "1", trial_device_limit: "1" });

  const panel = await db.panel.create({
    data: {
      name: "MOCK-1",
      location: "آلمان - تست",
      flag: "🇩🇪",
      url: MOCK,
      username: "admin",
      password: "admin",
      inboundId: 1,
      subBase: "https://sub.test.local/sub",
      flow: "xtls-rprx-vision",
      isActive: true,
    },
  });

  console.log("→ تست اتصال به پنل");
  const test = await panelClient(panel).testConnection();
  check("ورود به پنل و دریافت اینباندها", test.ok, test.message);
  check("اینباند شماره ۱ موجود است", test.inbounds.some((i) => i.id === 1));

  const plan = await db.plan.create({
    data: { title: "تست ۱۰ گیگ", volumeGb: 10, days: 30, deviceLimit: 2, priceToman: 100_000 },
  });
  const user = await db.user.create({
    data: { email: "buyer@test.local", passwordHash: "scrypt:x:y", name: "خریدار" },
  });

  console.log("→ ثبت سفارش و تحویل سرویس");
  const order = await db.order.create({
    data: {
      code: "FD-TEST01",
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
  check("تاریخ انقضا حدود ۳۰ روز بعد است", (() => {
    const days = ((service.expiresAt?.getTime() ?? 0) - Date.now()) / 86_400_000;
    return days > 29.9 && days < 30.1;
  })(), service.expiresAt);
  check("محدودیت کاربر همزمان ثبت شد", service.deviceLimit === 2);

  console.log("→ بررسی ساخته‌شدن کلاینت روی خود پنل");
  const stat = await panelClient(panel).getClientTraffics(service.clientEmail);
  check("کلاینت در پنل وجود دارد", Boolean(stat), stat);
  check("حجم کلاینت در پنل درست است", stat?.total === 10 * GB, stat?.total);

  console.log("→ همگام‌سازی مصرف");
  await fetch(`${MOCK}/_mock/usage?email=${encodeURIComponent(service.clientEmail)}&up=${GB}&down=${2 * GB}`);
  const synced = await syncService(service.id, true);
  check("مصرف از پنل خوانده شد (۳ گیگ)", synced.usedBytes === 3 * GB, synced.usedBytes);
  check("وضعیت سرویس فعال است", synced.status === "active");

  console.log("→ ساخت لینک اتصال");
  const links = await serviceLinks(service.id);
  check("لینک اشتراک درست ساخته شد", links.subscription === `https://sub.test.local/sub/${service.subId}`, links.subscription);
  const uri = links.configs[0]?.uri ?? "";
  check("کانفیگ VLESS ساخته شد", uri.startsWith(`vless://${service.uuid}@`), uri);
  check("پارامترهای Reality در لینک هست", uri.includes("security=reality") && uri.includes("pbk=PUBLICKEY123") && uri.includes("sid=a1b2c3"), uri);
  check("SNI و flow در لینک هست", uri.includes("sni=www.datadoghq.com") && uri.includes("flow=xtls-rprx-vision"), uri);

  console.log("→ تمدید سرویس");
  const renewOrder = await db.order.create({
    data: {
      code: "FD-TEST02",
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
  check("انقضا حدود ۶۰ روز شد", (() => {
    const days = ((renewed.expiresAt?.getTime() ?? 0) - Date.now()) / 86_400_000;
    return days > 59.5 && days < 60.5;
  })(), renewed.expiresAt);
  check("لینک اشتراک بعد از تمدید تغییر نکرد", renewed.subId === service.subId);

  console.log("→ اکانت تست رایگان");
  const trialUser = await db.user.create({ data: { email: "trial@test.local", passwordHash: "scrypt:x:y" } });
  const trial = await createTrialService(trialUser.id);
  check("اکانت تست ساخته شد", trial.isTrial && trial.totalBytes === 1 * GB, trial.totalBytes);
  let secondTrialBlocked = false;
  try {
    await createTrialService(trialUser.id);
  } catch {
    secondTrialBlocked = true;
  }
  check("تست رایگان دوم مسدود شد", secondTrialBlocked);

  console.log("→ حذف سرویس");
  await removeService(trial.id);
  const gone = await panelClient(panel).getClientTraffics(trial.clientEmail);
  check("کلاینت از پنل حذف شد", gone === null, gone);
  check("سرویس از دیتابیس حذف شد", (await db.service.findUnique({ where: { id: trial.id } })) === null);

  console.log(`\nنتیجه: ${passed} تست موفق، ${failed} تست ناموفق`);
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
