/**
 * تست رابط کاربری سرتاسری با مرورگر واقعی:
 * ثبت‌نام → افزودن سرور توسط ادمین → خرید → ارسال رسید → تأیید → دریافت کانفیگ
 * اجرا: bash scripts/ui-test.sh
 */
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3222";
const MOCK = process.env.MOCK_PANEL_URL || "http://127.0.0.1:8899";
const EXECUTABLE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const API_TOKEN = process.env.MOCK_API_TOKEN || "3xui-test-token";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin12345";
const GATEWAY = process.env.MOCK_GATEWAY_URL || "http://127.0.0.1:8896";
const GATEWAY_KEY = process.env.MOCK_GATEWAY_KEY || "gw-test-key";

let passed = 0;
let failed = 0;

function check(label, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`, extra ?? "");
  }
}

/** یک PNG کوچک به‌عنوان رسید پرداخت */
function makeReceipt() {
  const file = path.join(tmpdir(), "receipt-test.png");
  writeFileSync(
    file,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  return file;
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL(/dashboard|admin/, { timeout: 20000 }), page.click("button[type=submit]")]);
}

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ["--no-sandbox"] });

try {
  const adminCtx = await browser.newContext({ locale: "fa-IR" });
  const admin = await adminCtx.newPage();
  admin.on("dialog", (d) => d.accept());

  console.log("→ ورود مدیر و افزودن سرور 3x-ui");
  await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
  check("ورود مدیر انجام شد", admin.url().includes("/admin"), admin.url());

  // روی HTTP ساده کوکی نباید Secure باشد وگرنه مرورگر ذخیره‌اش نمی‌کند
  const cookies = await adminCtx.cookies();
  const session = cookies.find((c) => c.name === "fandogh_session");
  check("کوکی نشست ساخته شد", Boolean(session), cookies.map((c) => c.name));
  check(
    "کوکی روی HTTP فلگ Secure ندارد (باگ برگشت به صفحه لاگین)",
    session ? session.secure === false : false,
    session?.secure,
  );
  check("کوکی httpOnly است", session ? session.httpOnly === true : false, session?.httpOnly);

  await admin.goto(`${BASE}/admin/panels`, { waitUntil: "domcontentloaded" });
  await admin.fill("#name", "MOCK-UI");
  await admin.fill("#location", "آلمان - تست UI");
  await admin.fill("#url", MOCK);
  // فقط توکن API می‌دهیم (بدون نام کاربری) تا ثابت شود مسیر رسمی API کار می‌کند
  await admin.fill("#apiToken", API_TOKEN);
  await admin.fill("#inboundId", "1");
  await admin.fill("#subBase", "https://sub.test.local/sub");
  await admin.fill("#templateEmail", "template-vip");
  await admin.fill("#namePattern", "{template}-{code}");
  await admin.click("form:has(#name) button[type=submit]");
  await admin.waitForSelector("text=سرور ذخیره شد", { timeout: 20000 });
  check("سرور ذخیره شد", true);

  await admin.click("button:has-text('تست اتصال')");
  const testAlert = admin.locator("form:has(button:has-text('تست اتصال')) .alert").first();
  await testAlert.waitFor({ timeout: 20000 });
  const testMsg = (await testAlert.textContent()) ?? "";
  check("تست اتصال به پنل موفق بود", testMsg.includes("اتصال موفق بود"), testMsg);
  check("اتصال از طریق توکن API انجام شد", testMsg.includes("با توکن API"), testMsg);
  check("پنل نسخه ۳ تشخیص داده شد", testMsg.includes("API نسخه ۳"), testMsg);
  check("کلاینت الگو روی پنل پیدا شد", testMsg.includes("کلاینت الگو «template-vip» پیدا شد"), testMsg);
  check(
    "سرویس روی هر دو اینباند کلاینت الگو ساخته می‌شود",
    testMsg.includes("روی ۲ اینباند"),
    testMsg,
  );

  console.log("→ ثبت‌نام کاربر و خرید");
  const userCtx = await browser.newContext({ locale: "fa-IR" });
  const user = await userCtx.newPage();
  user.on("dialog", (d) => d.accept());
  const email = `buyer${Date.now()}@test.local`;

  await user.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await user.fill("#email", email);
  await user.fill("#password", "test12345");
  await user.fill("#confirm", "test12345");
  await Promise.all([user.waitForURL("**/dashboard", { timeout: 20000 }), user.click("button[type=submit]")]);
  check("ثبت‌نام کاربر انجام شد", user.url().includes("/dashboard"));

  await user.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  await Promise.all([
    user.waitForURL("**/checkout**", { timeout: 20000 }),
    user.click("a:has-text('خرید این پلن')"),
  ]);
  check("صفحه ثبت سفارش باز شد", user.url().includes("/checkout"));

  await Promise.all([
    user.waitForURL("**/dashboard/orders/**", { timeout: 20000 }),
    user.click("button:has-text('ثبت سفارش')"),
  ]);
  const orderUrl = user.url();
  check("سفارش ثبت و صفحه پرداخت باز شد", orderUrl.includes("/dashboard/orders/FD-"), orderUrl);
  check("شماره کارت نمایش داده شد", await user.isVisible("text=پرداخت کارت‌به‌کارت"));

  console.log("→ ارسال رسید پرداخت");
  await user.setInputFiles("#receipt", makeReceipt());
  await user.fill("#ref", "123456");
  await user.click("button:has-text('ارسال رسید')");
  await user.waitForSelector("text=رسید شما ثبت شد", { timeout: 20000 });
  check("رسید ثبت شد", true);

  console.log("→ تأیید سفارش توسط مدیر");
  await admin.goto(`${BASE}/admin/orders?status=pending_review`, { waitUntil: "domcontentloaded" });
  check("سفارش در صف بررسی دیده می‌شود", await admin.isVisible("text=در حال بررسی"));
  await admin.click("button:has-text('تأیید و تحویل سرویس')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 30000 });
  const approveMsg = (await admin.textContent(".alert-success, .alert-error")) ?? "";
  check("سفارش تأیید و سرویس ساخته شد", approveMsg.includes("تحویل شد"), approveMsg);
  await admin.goto(`${BASE}/admin/services`, { waitUntil: "domcontentloaded" });
  // در جدول سرویس‌ها بگرد (فیلترِ سرور هم همین نام را به‌عنوان option دارد)
  check(
    "سرویس در فهرست مدیریت ثبت شد",
    (await admin.locator("table td", { hasText: "آلمان - تست UI" }).count()) > 0,
  );
  const servicesText = (await admin.textContent("body")) ?? "";
  check("نام کلاینت از روی کلاینت الگو ساخته شد", /template-vip-FD-[0-9A-F]+/.test(servicesText), servicesText.match(/template-vip-\S*/)?.[0]);

  console.log("→ بررسی تحویل سرویس به کاربر");
  await user.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  check("سرویس در پنل کاربری نمایش داده شد", await user.isVisible("text=لینک اشتراک"));
  check("لینک اشتراک ساخته شد", (await user.textContent("body")).includes("https://sub.test.local/sub/"));

  await user.click("a:has-text('کانفیگ و QR')");
  await user.waitForSelector("text=کانفیگ مستقیم", { timeout: 20000 });
  const detail = await user.textContent("body");
  check("کانفیگ VLESS نمایش داده شد", detail.includes("vless://"), detail.slice(0, 200));
  check("QR کد رندر شد", (await user.locator(".qr-box img").count()) > 0);

  console.log("→ بازتولید کانفیگ از پنل کاربری");
  const subBefore = (await user.textContent(".copy-box code")) ?? "";
  const uuidBefore = (detail.match(/vless:\/\/([0-9a-f-]{36})/) ?? [])[1] ?? "";
  check("بخش امنیت سرویس نمایش داده شد", await user.isVisible("text=بازتولید کانفیگ"));

  await user.click("button:has-text('بازتولید کانفیگ و قطع دستگاه‌های قبلی')");
  check("پیام هشدار قبل از بازتولید نشان داده شد", await user.isVisible("text=مطمئنید؟ بعد از این کار"));
  await user.click("button:has-text('بله، کانفیگ تازه بساز')");
  await user.waitForSelector(".sec-panel .alert-success, .sec-panel .alert-error", { timeout: 30000 });
  const rotateMsg = (await user.textContent(".sec-panel .alert-success, .sec-panel .alert-error")) ?? "";
  check("کانفیگ تازه ساخته شد", rotateMsg.includes("کانفیگ تازه"), rotateMsg);

  await user.reload({ waitUntil: "domcontentloaded" });
  const afterRotate = (await user.textContent("body")) ?? "";
  const subAfter = (await user.textContent(".copy-box code")) ?? "";
  check("آدرس لینک اشتراک عوض شد", subAfter !== subBefore && subAfter.includes("/sub/"), [
    subBefore.slice(-12),
    subAfter.slice(-12),
  ]);
  check("UUID قدیمی دیگر در کانفیگ‌ها نیست", Boolean(uuidBefore) && !afterRotate.includes(uuidBefore), uuidBefore);
  check(
    "تاریخ و تعداد بازتولید ثبت شد",
    afterRotate.includes("آخرین بازتولید کانفیگ") && !afterRotate.includes("تا به حال انجام نشده"),
  );

  await user.click("button:has-text('بازتولید کانفیگ و قطع دستگاه‌های قبلی')");
  await user.click("button:has-text('بله، کانفیگ تازه بساز')");
  await user.waitForSelector(".sec-panel .alert-error", { timeout: 30000 });
  const cooldownMsg = (await user.textContent(".sec-panel .alert-error")) ?? "";
  check("بازتولید پیاپی با پیام فاصله مجاز رد شد", cooldownMsg.includes("دقیقه دیگر"), cooldownMsg);

  // یک بازدیدکنندهٔ بدون حساب برای صفحه وضعیت و حالت تعمیر
  const guestCtx = await browser.newContext({ locale: "fa-IR" });
  const guest = await guestCtx.newPage();

  console.log("→ خرید با درگاه پرداخت آنلاین");
  await admin.goto(`${BASE}/admin/payments`, { waitUntil: "domcontentloaded" });
  await admin.selectOption("#driver", "custom");
  await admin.fill("#label", "درگاه تست");
  await admin.fill("#apiKey", GATEWAY_KEY);
  await admin.fill("#minAmount", "1000");
  await admin.fill(
    "#custom",
    JSON.stringify({
      requestUrl: `${GATEWAY}/request`,
      verifyUrl: `${GATEWAY}/verify`,
      startUrl: `${GATEWAY}/pay/{ref}`,
      currency: "rial",
      auth: "none",
      keyField: "api_key",
      amountField: "amount",
      callbackField: "callback",
      orderField: "order_id",
      refPath: "data.token",
      successPath: "status",
      successValue: "100",
      callbackRefParam: "token",
      verifyRefPath: "data.ref_id",
    }),
  );
  await admin.click("button:has-text('افزودن درگاه')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 20000 });
  const gwMsg = (await admin.textContent(".alert-success, .alert-error")) ?? "";
  check("درگاه از پنل مدیریت ساخته شد", gwMsg.includes("آماده استفاده"), gwMsg);

  await user.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  await Promise.all([user.waitForURL("**/checkout**"), user.click("a:has-text('خرید این پلن')")]);
  check("نام درگاه در صفحه خرید دیده می‌شود", await user.isVisible("text=درگاه تست"));
  await user.click("button:has-text('درگاه تست')");
  await Promise.all([
    user.waitForURL(/dashboard\/orders\/FD-/, { timeout: 40000 }),
    user.click("button:has-text('پرداخت آنلاین و دریافت آنی')"),
  ]);

  const payUrl = user.url();
  const payBody = (await user.textContent("body")) ?? "";
  check("بعد از پرداخت به صفحه سفارش برگشت", payUrl.includes("paid=1"), payUrl);
  check("سفارش پرداخت آنلاین تأیید شد", payBody.includes("تأیید شده"), payBody.slice(0, 120));
  check("شماره پیگیری بانک نمایش داده شد", payBody.includes("BANK-"));

  await user.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const services = await user.locator(".svc").count();
  check("سرویس دوم با پرداخت آنلاین تحویل شد", services >= 2, services);

  console.log("→ پرداخت با تتر (TRC20)");
  await admin.goto(`${BASE}/admin/payments`, { waitUntil: "domcontentloaded" });
  await admin.fill("#address", "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE");
  await admin.fill("#wallet-label", "کیف پول تست");
  await admin.click("button:has-text('افزودن آدرس')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 20000 });
  check("آدرس کیف پول تتر ذخیره شد", true);

  await admin.goto(`${BASE}/admin/payments`, { waitUntil: "domcontentloaded" });
  await admin.check("#crypto_enabled");
  await admin.uncheck("#usdt_rate_auto");
  await admin.fill("#usdt_rate_manual", "60000");
  await admin.click("button:has-text('ذخیره تنظیمات ارز دیجیتال')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 20000 });
  await admin.reload({ waitUntil: "domcontentloaded" });
  check("نرخ تتر در پنل نمایش داده شد", (await admin.textContent("body")).includes("۶۱,۲۰۰"));

  await user.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  await Promise.all([user.waitForURL("**/checkout**"), user.click("a:has-text('خرید این پلن')")]);
  check("گزینه پرداخت تتری در صفحه خرید هست", await user.isVisible("text=تتر (TRC20)"));
  await user.click("button:has-text('تتر (TRC20)')");
  await Promise.all([
    user.waitForURL(/dashboard\/orders\/FD-/, { timeout: 30000 }),
    user.click("button:has-text('ثبت سفارش و پرداخت با تتر')"),
  ]);

  const cryptoBody = (await user.textContent("body")) ?? "";
  check("آدرس کیف پول به مشتری نشان داده شد", cryptoBody.includes("TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE"));
  check("مبلغ تتری محاسبه و نمایش داده شد", /\d+\.\d{2} USDT/.test(cryptoBody), cryptoBody.match(/[\d.]+ USDT/)?.[0]);
  check("هشدار شبکه TRC20 داده شد", cryptoBody.includes("فقط شبکهٔ TRC20"));

  const cryptoOrderUrl = user.url();
  await user.fill("#txHash", "e2e0000000000000000000000000000000000000000000000000000000000001");
  await user.click("button:has-text('ثبت هش تراکنش')");
  await user.waitForSelector(".alert-success, .alert-error", { timeout: 20000 });
  const txMsg = (await user.textContent(".alert-success, .alert-error")) ?? "";
  check("هش تراکنش ثبت شد", txMsg.includes("ثبت شد"), txMsg);

  await admin.goto(`${BASE}/admin/orders?status=pending_review`, { waitUntil: "domcontentloaded" });
  const adminCrypto = (await admin.textContent("body")) ?? "";
  check("هش تراکنش برای مدیر نمایش داده شد", adminCrypto.includes("e2e00000000000000"), adminCrypto.slice(0, 80));
  await admin.click("button:has-text('تأیید و تحویل سرویس')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 40000 });
  const cryptoApprove = (await admin.textContent(".alert-success, .alert-error")) ?? "";
  check("سفارش تتری توسط مدیر تأیید شد", cryptoApprove.includes("تحویل شد"), cryptoApprove);

  await user.goto(cryptoOrderUrl, { waitUntil: "domcontentloaded" });
  check("سفارش تتری تأیید شده است", (await user.textContent("body")).includes("تأیید شده"));

  console.log("→ پایش سرورها");
  await admin.goto(`${BASE}/admin/monitor`, { waitUntil: "domcontentloaded" });
  check("صفحه پایش باز شد", await admin.isVisible("text=پایش سرورها"));
  await admin.click("button:has-text('بررسی همه همین حالا')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 40000 });
  const monMsg = (await admin.textContent(".alert-success, .alert-error")) ?? "";
  check("بررسی سلامت سرور انجام شد", monMsg.includes("بررسی شد"), monMsg);
  await admin.reload({ waitUntil: "domcontentloaded" });
  const monBody = (await admin.textContent("body")) ?? "";
  check("وضعیت «در دسترس» برای سرور تست ثبت شد", monBody.includes("در دسترس"), monMsg);
  check("آپتایم محاسبه شد", /آپتایم ۲۴ ساعت/.test(monBody));

  await guest.goto(`${BASE}/status`, { waitUntil: "domcontentloaded" });
  const statusBody = (await guest.textContent("body")) ?? "";
  check("صفحه وضعیت عمومی کار می‌کند", statusBody.includes("وضعیت سرورها") && statusBody.includes("آلمان - تست UI"));

  console.log("→ اپ نصب‌شدنی و اعلان پوش");
  const manifestRes = await guest.request.get(`${BASE}/manifest.webmanifest`);
  const manifest = await manifestRes.json();
  check("مانیفست PWA سرو می‌شود", manifestRes.ok(), manifestRes.status());
  check("مانیفست نام و آیکون دارد", Boolean(manifest.name) && manifest.icons.length >= 2, manifest.icons?.length);
  check("حالت نمایش standalone است", manifest.display === "standalone", manifest.display);
  check("آیکون maskable دارد", manifest.icons.some((i) => i.purpose === "maskable"));

  const swRes = await guest.request.get(`${BASE}/sw.js`);
  check("سرویس‌ورکر سرو می‌شود", swRes.ok() && (await swRes.text()).includes("notificationclick"));
  const offlineRes = await guest.request.get(`${BASE}/offline.html`);
  check("صفحه آفلاین آماده است", offlineRes.ok() && (await offlineRes.text()).includes("اینترنت در دسترس نیست"));

  await user.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await user.waitForTimeout(1500);
  const swReady = await user.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(reg);
  });
  check("سرویس‌ورکر در مرورگر ثبت شد", swReady);

  await admin.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
  await admin.click("button:has-text('فعال‌سازی اعلان پوش')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 20000 });
  const pushMsg = (await admin.textContent(".alert-success, .alert-error")) ?? "";
  check("اعلان پوش با ساخت کلید فعال شد", pushMsg.includes("اعلان پوش فعال شد"), pushMsg);

  await user.goto(`${BASE}/dashboard/notifications`, { waitUntil: "domcontentloaded" });
  const notifBody = (await user.textContent("body")) ?? "";
  check("کلید روشن‌کردن اعلان به کاربر نشان داده شد", notifBody.includes("اعلان روی این دستگاه"), {
    url: user.url(),
    heading: await user.textContent("h1").catch(() => "-"),
    hasPushBox: await user.locator(".push-box").count(),
  });

  console.log("→ حالت تعمیر و نگهداری");
  await admin.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
  await admin.check("#maintenance_mode");
  await admin.click("button:has-text('ذخیره همه تنظیمات')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 20000 });

  await guest.waitForTimeout(3000); // کش کوتاه وضعیت در میان‌افزار
  await guest.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  check(
    "بازدیدکننده در حالت تعمیر صفحه به‌روزرسانی را می‌بیند",
    (await guest.textContent("body")).includes("در حال به‌روزرسانی"),
  );
  await guest.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  check(
    "صفحه ورود در حالت تعمیر باز می‌ماند",
    (await guest.locator("#email").count()) > 0 && (await guest.locator("#password").count()) > 0,
  );
  await admin.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  check(
    "مدیر در حالت تعمیر به پنل دسترسی دارد",
    (await admin.textContent("body")).includes("داشبورد مدیریت"),
  );

  await admin.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
  await admin.uncheck("#maintenance_mode");
  await admin.click("button:has-text('ذخیره همه تنظیمات')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 20000 });
  await guest.waitForTimeout(3000);
  await guest.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  check(
    "بعد از خاموش‌کردن، سایت برای همه باز شد",
    (await guest.textContent("body")).includes("تعرفه"),
  );

  console.log("→ کاربر ویژه و شماره کارت");
  await admin.goto(`${BASE}/admin/payments`, { waitUntil: "domcontentloaded" });
  await admin.check("#card_enabled");
  await admin.check("#card_vip_only");
  await admin.click("button:has-text('ذخیره کارت‌به‌کارت')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 20000 });

  await user.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  await Promise.all([user.waitForURL("**/checkout**"), user.click("a:has-text('خرید این پلن')")]);
  const beforeVip = (await user.textContent("body")) ?? "";
  check("کاربر عادی گزینه کارت‌به‌کارت را نمی‌بیند", !beforeVip.includes("💳 کارت‌به‌کارت"), {
    hasWord: beforeVip.includes("کارت‌به‌کارت"),
    around: beforeVip.slice(Math.max(0, beforeVip.indexOf("کارت‌به‌کارت") - 60), beforeVip.indexOf("کارت‌به‌کارت") + 60),
  });

  await admin.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
  await admin.click("a.cell-main:has-text('buyer')");
  await admin.waitForSelector("text=کاربر ویژه", { timeout: 20000 });
  await admin.click("button:has-text('⭐ کاربر ویژه')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 20000 });
  const vipMsg = (await admin.textContent(".alert-success, .alert-error")) ?? "";
  check("کاربر ویژه شد", vipMsg.includes("ویژه"), vipMsg);

  await user.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  await Promise.all([user.waitForURL("**/checkout**"), user.click("a:has-text('خرید این پلن')")]);
  check(
    "کاربر ویژه گزینه کارت‌به‌کارت را می‌بیند",
    (await user.textContent("body")).includes("💳 کارت‌به‌کارت"),
  );

  console.log("→ پنل نمایندگی");
  const adminUserUrl = admin.url();
  await admin.goto(adminUserUrl, { waitUntil: "domcontentloaded" });
  await admin.fill("#resellerOff", "25");
  await admin.fill("#resellerName", "فروشگاه تست");
  await admin.check("#isReseller");
  await admin.click("button:has-text('ذخیره نمایندگی')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 20000 });
  const rsMsg = (await admin.textContent(".alert-success, .alert-error")) ?? "";
  check("نمایندگی از پنل مدیریت فعال شد", rsMsg.includes("نمایندگی"), rsMsg);

  await admin.goto(`${BASE}/admin/resellers`, { waitUntil: "domcontentloaded" });
  check("نماینده در فهرست نمایندگان آمد", (await admin.textContent("body")).includes("فروشگاه تست"));

  // نماینده باید هم پنل نمایندگی داشته باشد هم پنل کاربری
  await user.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  check("لینک پنل نمایندگی در هدر ظاهر شد", await user.isVisible("a:has-text('پنل نمایندگی')"));
  check("پنل کاربری عادی هم سر جایش است", (await user.textContent("body")).includes("سرویس‌های من"));

  await user.goto(`${BASE}/reseller`, { waitUntil: "domcontentloaded" });
  const rsBody = (await user.textContent("body")) ?? "";
  check("پنل نمایندگی باز شد", rsBody.includes("فروشگاه تست"), rsBody.slice(0, 80));
  check("درصد تخفیف نماینده نمایش داده شد", rsBody.includes("۲۵٪ تخفیف نمایندگی"));

  await user.goto(`${BASE}/reseller/prices`, { waitUntil: "domcontentloaded" });
  check("لیست قیمت عمده نمایش داده شد", (await user.textContent("body")).includes("قیمت شما"));

  // شارژ اعتبار نماینده توسط مدیر تا بتواند بفروشد
  await admin.goto(adminUserUrl, { waitUntil: "domcontentloaded" });
  await admin.fill("#wallet-amount", "500000");
  await admin.fill("#wallet-note", "شارژ تست نمایندگی");
  await admin.click("button:has-text('اعمال')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 20000 });

  await user.goto(`${BASE}/reseller/sell`, { waitUntil: "domcontentloaded" });
  await user.fill("#customerName", "مشتری تست نماینده");
  await Promise.all([
    user.waitForURL(/reseller\/services\//, { timeout: 40000 }),
    user.click("button:has-text('ساخت و تحویل سرویس')"),
  ]);
  const soldBody = (await user.textContent("body")) ?? "";
  check("سرویس مشتری ساخته و تحویل شد", soldBody.includes("سرویس ساخته شد"), soldBody.slice(0, 100));
  check("لینک اشتراک مشتری نمایش داده شد", soldBody.includes("https://sub.test.local/sub/"));
  check("نام مشتری روی صفحه آمد", soldBody.includes("مشتری تست نماینده"));

  await user.goto(`${BASE}/reseller/services`, { waitUntil: "domcontentloaded" });
  check("مشتری در فهرست نمایندگی هست", (await user.textContent("body")).includes("مشتری تست نماینده"));

  await user.goto(`${BASE}/reseller/wallet`, { waitUntil: "domcontentloaded" });
  check("تراکنش فروش نمایندگی ثبت شد", (await user.textContent("body")).includes("فروش نمایندگی"));

  await user.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  check(
    "سرویس مشتری در پنل شخصی نماینده دیده نمی‌شود",
    !(await user.textContent("body")).includes("مشتری تست نماینده"),
  );

  console.log("→ نسخه انگلیسی سایت");
  await guest.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  check("سایت به‌صورت پیش‌فرض فارسی و راست‌چین است", (await guest.getAttribute("html", "dir")) === "rtl");

  await guest.click(".lang-switch button:has-text('EN')");
  await guest.waitForLoadState("domcontentloaded");
  await guest.waitForTimeout(600);
  check("بعد از تعویض زبان، جهت صفحه چپ‌چین شد", (await guest.getAttribute("html", "dir")) === "ltr");
  check("زبان صفحه انگلیسی شد", (await guest.getAttribute("html", "lang")) === "en");

  const homeEn = (await guest.textContent("body")) ?? "";
  check("منوی انگلیسی نمایش داده شد", homeEn.includes("Pricing") && homeEn.includes("Setup guide"), homeEn.slice(0, 80));
  check("متن فارسی هدر باقی نمانده", !homeEn.includes("تعرفه‌ها"));

  await guest.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  const plansEn = (await guest.textContent("body")) ?? "";
  check("صفحه تعرفه‌ها انگلیسی شد", plansEn.includes("Choose this plan") || plansEn.includes("Pricing"));
  check("قیمت‌ها با ارقام لاتین و واحد Toman", /\d,\d{3}\s*Toman/.test(plansEn), plansEn.match(/[\d,]+ Toman/)?.[0]);

  await guest.goto(`${BASE}/status`, { waitUntil: "domcontentloaded" });
  check("صفحه وضعیت انگلیسی شد", (await guest.textContent("body")).includes("Server status"));

  await guest.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  check("صفحه ورود انگلیسی شد", (await guest.textContent("body")).includes("Sign in"));

  // کاربر واردشده هم باید پنل انگلیسی ببیند
  await user.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await user.click(".lang-switch button:has-text('EN')");
  await user.waitForTimeout(600);
  await user.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const dashEn = (await user.textContent("body")) ?? "";
  check("پنل کاربری انگلیسی شد", dashEn.includes("My services") && dashEn.includes("Wallet"), dashEn.slice(0, 80));
  check("تاریخ‌ها میلادی شدند", !/۱۴۰\d/.test(dashEn));

  await user.goto(`${BASE}/dashboard/tickets`, { waitUntil: "domcontentloaded" });
  check("بخش تیکت‌ها انگلیسی شد", (await user.textContent("body")).includes("Support"));

  // برگشت به فارسی برای بقیه تست‌ها
  await user.click(".lang-switch button:has-text('فا')");
  await user.waitForTimeout(600);
  await user.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  check("بازگشت به فارسی کار می‌کند", (await user.textContent("body")).includes("سرویس‌های من"));

  console.log("→ تیکت پشتیبانی");
  await user.goto(`${BASE}/dashboard/tickets`, { waitUntil: "domcontentloaded" });
  await user.fill("#subject", "تست پشتیبانی");
  await user.fill("#body", "این یک تیکت تستی است.");
  await Promise.all([
    user.waitForURL("**/dashboard/tickets/**", { timeout: 20000 }),
    user.click("button:has-text('ارسال تیکت')"),
  ]);
  check("تیکت ثبت شد", user.url().includes("/dashboard/tickets/"));
} catch (err) {
  failed += 1;
  console.error("✗ خطای اجرای تست:", err.message);
} finally {
  await browser.close();
}

console.log(`\nنتیجه تست رابط کاربری: ${passed} موفق، ${failed} ناموفق`);
process.exit(failed ? 1 : 0);
