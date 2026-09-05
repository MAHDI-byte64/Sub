/**
 * تست رابط کاربری سرتاسری با مرورگر واقعی:
 * ثبت‌نام → افزودن سرور توسط ادمین → خرید → ارسال رسید → تأیید → دریافت کانفیگ
 * اجرا: bash scripts/ui-test.sh
 */
import { chromium } from "playwright-core";
import { createHmac } from "node:crypto";
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

/** «۴۰ گیگابایت» یا «۱۴۶,۲۵۰ تومان» → عدد (جداکننده و واحد نادیده گرفته می‌شود) */
function faDigits(text) {
  if (!text) return NaN;
  const digits = text.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
  return digits ? Number(digits) : NaN;
}

/** حجم کل سرویس از روی متن «از ۴۰ گیگابایت» */
function totalGbFrom(text) {
  return faDigits((text.match(/از ([۰-۹,٬.]+) گیگابایت/) ?? [])[1]);
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

/** TOTP مستقل از کد سایت، تا تست واقعاً چیزی را بسنجد (RFC 6238) */
function totpFromSecret(secret, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = secret.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  const counter = Math.floor(now / 1000 / 30);
  const message = Buffer.alloc(8);
  message.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  message.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac("sha1", Buffer.from(bytes)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
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
  let userPassword = "test12345";

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

  console.log("→ وب‌هوک هوش‌پی");
  const HP_SECRET = "hp-secret-uitest";
  await admin.goto(`${BASE}/admin/payments`, { waitUntil: "domcontentloaded" });
  await admin.selectOption("#driver", "hooshpay");
  await admin.fill("#label", "هوش‌پی تست");
  await admin.fill("#apiKey", GATEWAY_KEY);
  await admin.fill("#apiSecret", HP_SECRET);
  await admin.fill("#minAmount", "1000");
  await admin.fill("#sortOrder", "5");
  await admin.click("button:has-text('افزودن درگاه')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 20000 });
  check("درگاه هوش‌پی ساخته شد", true);

  const sign = (payload) => {
    const sorted = Object.keys(payload)
      .sort()
      .reduce((acc, key) => ({ ...acc, [key]: payload[key] }), {});
    return createHmac("sha256", HP_SECRET).update(JSON.stringify(sorted)).digest("hex");
  };

  // امضای غلط باید رد شود
  const forged = { event: "payment.success", invoice: "inv_fake", order_id: "FD-NOPE", amount: 1000 };
  const badRes = await guest.request.post(`${BASE}/api/pay/hooshpay/FD-NOPE`, {
    headers: { "X-HooshPay-Signature": "0".repeat(64), "Content-Type": "application/json" },
    data: forged,
  });
  check("وب‌هوک با سفارش ناموجود رد می‌شود", badRes.status() === 404, badRes.status());

  // خرید واقعی با هوش‌پی: مسیر بازگشت کاربر
  await user.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  await Promise.all([user.waitForURL("**/checkout**"), user.click("a:has-text('خرید این پلن')")]);
  check("درگاه هوش‌پی در صفحه خرید دیده می‌شود", await user.isVisible("text=هوش‌پی تست"));
  await user.click("button:has-text('هوش‌پی تست')");
  await Promise.all([
    user.waitForURL(/dashboard\/orders\/FD-/, { timeout: 40000 }),
    user.click("button:has-text('پرداخت آنلاین و دریافت آنی')"),
  ]);
  const hpBody = (await user.textContent("body")) ?? "";
  check("سفارش هوش‌پی تأیید شد", hpBody.includes("تأیید شده"), hpBody.slice(0, 100));
  check("کد رهگیری هوش‌پی ثبت شد", hpBody.includes("HP-FD-"), hpBody.match(/HP-FD-\w+/)?.[0]);

  // امضای درست روی سفارشی که همین حالا تکمیل شده: باید بدون خطا «قبلاً انجام شده» بگیرد
  const paidCode = (user.url().match(/FD-[A-Z0-9]+/) ?? [""])[0];
  const okPayload = { event: "payment.success", invoice: "inv_x", order_id: paidCode, status: "paid" };
  const okRes = await guest.request.post(`${BASE}/api/pay/hooshpay`, {
    headers: { "X-HooshPay-Signature": sign(okPayload), "Content-Type": "application/json" },
    data: okPayload,
  });
  const okJson = await okRes.json();
  check("وب‌هوک پیش‌فرض (بدون کد سفارش) سفارش را پیدا می‌کند", okRes.ok() && okJson.already === true, okJson);

  // امضای جعلی روی یک سفارش پرداخت‌نشده باید رد شود
  await user.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  await Promise.all([user.waitForURL("**/checkout**"), user.click("a:has-text('خرید این پلن')")]);
  await user.click("button:has-text('💳 کارت‌به‌کارت')");
  await Promise.all([
    user.waitForURL(/dashboard\/orders\/FD-/, { timeout: 30000 }),
    user.click("button:has-text('ثبت سفارش و رفتن به پرداخت')"),
  ]);
  const pendingCode = (user.url().match(/FD-[A-Z0-9]+/) ?? [""])[0];

  const forgedRes = await guest.request.post(`${BASE}/api/pay/hooshpay/${pendingCode}`, {
    headers: { "X-HooshPay-Signature": "1".repeat(64), "Content-Type": "application/json" },
    data: { event: "payment.success", invoice: "inv_forged", order_id: pendingCode, amount: 1 },
  });
  check("امضای جعلی روی سفارش پرداخت‌نشده رد می‌شود", forgedRes.status() === 401, forgedRes.status());

  await user.goto(`${BASE}/dashboard/orders/${pendingCode}`, { waitUntil: "domcontentloaded" });
  check(
    "سفارش با وب‌هوک جعلی تأیید نشد",
    !(await user.textContent("body")).includes("تأیید شده"),
  );

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

  console.log("→ فروش نماینده با حجم و زمان دلخواه");
  await user.goto(`${BASE}/reseller/sell`, { waitUntil: "domcontentloaded" });
  check("گزینهٔ حجم دلخواه در پنل نماینده هست", await user.isVisible("button:has-text('حجم و زمان دلخواه')"));
  await user.click("button:has-text('حجم و زمان دلخواه')");
  await user.fill("#custom-gb", "50");
  await user.fill("#custom-days", "30");
  await user.fill("#custom-customer", "مشتری دلخواه");
  const customPriceText = (await user.textContent("[data-testid=custom-price]")) ?? "";
  // ۵۰×۳۰۰۰ + ۳۰×۱۵۰۰ = ۱۹۵٬۰۰۰ و با ۲۵٪ تخفیف نمایندگی: ۱۴۶٬۲۵۰
  check("قیمت دلخواه با تخفیف نمایندگی نشان داده شد", faDigits(customPriceText) === 146250, customPriceText);

  await Promise.all([
    user.waitForURL(/reseller\/services\//, { timeout: 40000 }),
    user.click("button:has-text('ساخت و تحویل سرویس')"),
  ]);
  const customSoldUrl = user.url();
  const customBody = (await user.textContent("body")) ?? "";
  check("سرویس دلخواه ساخته شد", customBody.includes("سرویس ساخته شد"), customBody.slice(0, 80));
  check("حجم دلخواه روی سرویس نشست", totalGbFrom(customBody) === 50, totalGbFrom(customBody));

  console.log("→ شارژ دلخواه سرویس مشتری");
  check("کادر شارژ دلخواه در صفحهٔ مشتری هست", await user.isVisible("text=شارژ دلخواه"));
  await user.fill("#renew-gb", "10");
  await user.fill("#renew-days", "0");
  const renewPriceText = (await user.textContent("[data-testid=renew-custom-price]")) ?? "";
  // ۱۰×۳۰۰۰ = ۳۰٬۰۰۰ و با ۲۵٪ تخفیف: ۲۲٬۵۰۰
  check("قیمت شارژ دلخواه درست حساب شد", faDigits(renewPriceText) === 22500, renewPriceText);

  await user.click("button:has-text('شارژ و کسر از اعتبار')");
  await user.waitForSelector("form:has(#renew-gb) .alert-success, form:has(#renew-gb) .alert-error", {
    timeout: 40000,
  });
  const renewMsg = (await user.textContent("form:has(#renew-gb) .alert-success, form:has(#renew-gb) .alert-error")) ?? "";
  check("شارژ دلخواه انجام شد", renewMsg.includes("حجم دلخواه"), renewMsg);

  await user.goto(customSoldUrl, { waitUntil: "domcontentloaded" });
  const afterCharge = (await user.textContent("body")) ?? "";
  check("حجم بعد از شارژ دلخواه زیاد شد", totalGbFrom(afterCharge) === 60, totalGbFrom(afterCharge));

  await user.goto(`${BASE}/reseller/wallet`, { waitUntil: "domcontentloaded" });
  check("تراکنش فروش نمایندگی ثبت شد", (await user.textContent("body")).includes("فروش نمایندگی"));

  await user.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  check(
    "سرویس مشتری در پنل شخصی نماینده دیده نمی‌شود",
    !(await user.textContent("body")).includes("مشتری تست نماینده"),
  );

  console.log("→ خرید حجم اضافه توسط مشتری");
  // شارژ کیف پول کاربر تا خرید حجم اضافه در همان لحظه انجام شود
  await admin.goto(adminUserUrl, { waitUntil: "domcontentloaded" });
  await admin.fill("#wallet-amount", "300000");
  await admin.fill("#wallet-note", "شارژ تست حجم اضافه");
  await admin.click("button:has-text('اعمال')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 20000 });

  await user.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await user.click("a:has-text('کانفیگ و QR')");
  await user.waitForSelector("text=کانفیگ مستقیم", { timeout: 20000 });
  const serviceUrl = user.url();
  const beforeAddon = (await user.textContent("body")) ?? "";
  const gbBefore = totalGbFrom(beforeAddon);
  check("کادر خرید حجم اضافه در صفحهٔ سرویس هست", await user.isVisible("#addon-gb"), gbBefore);

  await user.fill("#addon-gb", "10");
  const addonPriceText = (await user.textContent("[data-testid=addon-price]")) ?? "";
  // ۱۰ گیگ × ۳٬۰۰۰ تومان
  check("قیمت حجم اضافه لحظه‌ای حساب شد", faDigits(addonPriceText) === 30000, addonPriceText);

  await Promise.all([
    user.waitForURL("**/checkout**", { timeout: 20000 }),
    user.click("button:has-text('خرید حجم اضافه')"),
  ]);
  const addonCheckout = (await user.textContent("body")) ?? "";
  check("صفحهٔ پرداخت حجم اضافه باز شد", user.url().includes("service="), user.url());
  check("حجم انتخابی در خلاصهٔ سفارش آمد", addonCheckout.includes("۱۰ گیگابایت"), addonCheckout.slice(0, 120));
  check("کد تخفیف روی حجم اضافه نمایش داده نمی‌شود", !(await user.isVisible("#discountCode")));

  await Promise.all([
    user.waitForURL(/dashboard\/services\/.*paid=/, { timeout: 40000 }),
    user.click("button[type=submit]"),
  ]);
  const afterAddon = (await user.textContent("body")) ?? "";
  check("پیام موفقیت حجم اضافه نشان داده شد", afterAddon.includes("حجم اضافه"), afterAddon.slice(0, 120));
  check("حجم سرویس زیاد شد", totalGbFrom(afterAddon) === gbBefore + 10, [gbBefore, totalGbFrom(afterAddon)]);

  await user.goto(`${BASE}/dashboard/orders`, { waitUntil: "domcontentloaded" });
  check(
    "سفارش حجم اضافه در فهرست سفارش‌ها آمد",
    ((await user.textContent("body")) ?? "").includes("حجم اضافه"),
  );

  await user.goto(`${BASE}/dashboard/wallet`, { waitUntil: "domcontentloaded" });
  check(
    "تراکنش خرید حجم اضافه در کیف پول ثبت شد",
    ((await user.textContent("body")) ?? "").includes("خرید حجم اضافه"),
  );
  await user.goto(serviceUrl, { waitUntil: "domcontentloaded" });

  console.log("→ تغییر تم سایت توسط مدیر");
  await admin.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
  check("کارت‌های انتخاب تم در تنظیمات هست", (await admin.locator(".theme-card").count()) >= 4);
  check(
    "تم پیش‌فرض فندق انتخاب شده است",
    await admin.isChecked("input[name=site_theme][value=fandogh]"),
  );

  // انتخاب تم تازه باید همان لحظه روی خود پنل هم دیده شود (پیش‌نمایش)
  await admin.click(".theme-card:has(input[value=emerald])");
  check(
    "پیش‌نمایش تم بدون ذخیره اعمال می‌شود",
    (await admin.getAttribute("html", "data-theme")) === "emerald",
    await admin.getAttribute("html", "data-theme"),
  );

  await admin.click("button:has-text('ذخیره همه تنظیمات')");
  await admin.waitForSelector(".alert-success", { timeout: 20000 });
  check("تنظیمات تم ذخیره شد", ((await admin.textContent(".alert-success")) ?? "").includes("ذخیره"));

  // تم برای همهٔ بازدیدکننده‌ها اعمال می‌شود، حتی بدون ورود
  await guest.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  check(
    "تم تازه روی صفحهٔ عمومی نشست",
    (await guest.getAttribute("html", "data-theme")) === "emerald",
    await guest.getAttribute("html", "data-theme"),
  );
  const guestAccent = await guest.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--gold").trim(),
  );
  check("رنگ اصلی تم روی متغیرهای CSS نشست", guestAccent === "#34d399", guestAccent);

  await user.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  check(
    "پنل کاربری هم با همان تم رندر می‌شود",
    (await user.getAttribute("html", "data-theme")) === "emerald",
  );
  check("کاربر عادی جایی برای تغییر تم ندارد", (await user.locator(".theme-card").count()) === 0);

  // کاربر عادی نباید بتواند تم را عوض کند: صفحهٔ تنظیمات برایش باز نمی‌شود
  await user.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
  check("صفحهٔ تنظیمات برای کاربر عادی باز نمی‌شود", !user.url().includes("/admin/settings"), user.url());

  // برگرداندن به تم پیش‌فرض تا بقیهٔ تست‌ها و اسکرین‌شات‌ها تغییر نکنند
  await admin.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
  await admin.click(".theme-card:has(input[value=fandogh])");
  await admin.click("button:has-text('ذخیره همه تنظیمات')");
  await admin.waitForSelector(".alert-success", { timeout: 20000 });
  await guest.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  check("بازگشت به تم پیش‌فرض انجام شد", (await guest.getAttribute("html", "data-theme")) === "fandogh");

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

  console.log("→ انتقال سرویس به سرور دیگر");
  // سرور دومی روی همان پنل شبیه‌سازی‌شده، با کلاینت الگوی دیگر
  await admin.goto(`${BASE}/admin/panels`, { waitUntil: "domcontentloaded" });
  await admin.fill("#name", "MOCK-UI-2");
  await admin.fill("#location", "هلند - تست UI");
  await admin.fill("#url", MOCK);
  await admin.fill("#apiToken", API_TOKEN);
  await admin.fill("#inboundId", "2");
  await admin.fill("#subBase", "https://sub2.test.local/sub");
  await admin.fill("#templateEmail", "template-alt");
  await admin.fill("#namePattern", "{template}-{code}");
  await admin.click("form:has(#name) button[type=submit]");
  await admin.waitForSelector("text=سرور ذخیره شد", { timeout: 20000 });
  check("سرور دوم برای انتقال ساخته شد", true);

  // سرویس شخصی خودِ کاربر (قدیمی‌ترین ردیف)، نه سرویسی که نماینده برای مشتری ساخته
  await admin.goto(`${BASE}/admin/services`, { waitUntil: "domcontentloaded" });
  const ownRow = admin.locator("table tbody tr").last();
  const beforeRow = (await ownRow.textContent()) ?? "";
  check("سرویس روی سرور اول است", beforeRow.includes("آلمان - تست UI"), beforeRow.slice(0, 140));

  const migrateForm = ownRow.locator("form.row-form").first();
  const targetOption = await migrateForm
    .locator("select[name=panelId] option")
    .filter({ hasText: "MOCK-UI-2" })
    .first()
    .getAttribute("value");
  await migrateForm.locator("select[name=panelId]").selectOption(targetOption ?? "");
  await migrateForm.locator("button[type=submit]").click();
  await migrateForm.locator(".alert").first().waitFor({ timeout: 60000 });
  const migrateMsg = (await migrateForm.locator(".alert").first().textContent()) ?? "";
  check("انتقال سرویس انجام شد", migrateMsg.includes("منتقل شد"), migrateMsg);
  check("حجم باقی‌مانده در پیام آمد", /باقی‌مانده/.test(migrateMsg), migrateMsg);

  await admin.goto(`${BASE}/admin/services`, { waitUntil: "domcontentloaded" });
  const afterRow = (await admin.locator("table tbody tr").last().textContent()) ?? "";
  check("سرویس روی سرور دوم نشست", afterRow.includes("هلند - تست UI"), afterRow.slice(0, 140));

  // کاربر باید اعلان بگیرد و از همان اعلان به سرویس منتقل‌شده برسد
  await user.goto(`${BASE}/dashboard/notifications`, { waitUntil: "domcontentloaded" });
  const movedCard = user.locator("a.ticket-card:has-text('منتقل شد')").first();
  check("به کاربر اعلان انتقال داده شد", (await movedCard.count()) > 0);

  const movedHref = await movedCard.getAttribute("href");
  await user.goto(`${BASE}${movedHref}`, { waitUntil: "domcontentloaded" });
  const movedDetail = (await user.textContent("body")) ?? "";
  check(
    "لینک اشتراک از سرور تازه ساخته شد",
    movedDetail.includes("sub2.test.local"),
    movedDetail.match(/https:\/\/[^\s]+/)?.[0],
  );

  console.log("→ پشتیبان‌گیری از پنل مدیر");
  await admin.goto(`${BASE}/admin/backup`, { waitUntil: "domcontentloaded" });
  const backupEmpty = await admin.textContent("body");
  check("صفحه پشتیبان‌گیری باز شد", backupEmpty.includes("پشتیبان‌گیری"));
  check("وقتی پشتیبانی نیست هشدار داده می‌شود", backupEmpty.includes("هنوز هیچ پشتیبانی ندارید"));

  await admin.click("button:has-text('ساخت پشتیبان تازه')");
  await admin.waitForSelector(".page-head .alert-success", { timeout: 60000 });
  const created = await admin.textContent(".page-head .alert-success");
  check("پشتیبان ساخته شد", created.includes("پشتیبان ساخته شد"), created);

  await admin.reload({ waitUntil: "domcontentloaded" });
  const rows = await admin.$$eval("table tbody tr", (list) => list.length);
  check("پشتیبان در جدول دیده می‌شود", rows === 1, rows);

  const fileName = (await admin.textContent("table tbody tr .cell-main")).trim();
  check("نام فایل درست است", /^fandogh-backup-.+\.tar\.gz$/.test(fileName), fileName);

  const download = await adminCtx.request.get(`${BASE}/api/admin/backup/${fileName}`);
  const downloaded = await download.body();
  check("دانلود پشتیبان کار می‌کند", download.status() === 200, download.status());
  check(
    "فایل دانلودشده واقعاً gzip است",
    downloaded[0] === 0x1f && downloaded[1] === 0x8b,
    downloaded.subarray(0, 4),
  );
  check(
    "هدر دانلود نام فایل را دارد",
    (download.headers()["content-disposition"] || "").includes(fileName),
    download.headers()["content-disposition"],
  );

  const badName = await adminCtx.request.get(`${BASE}/api/admin/backup/hack.tar.gz`);
  check("نام فایل بیرون از پشتیبان‌ها رد می‌شود", badName.status() === 400, badName.status());

  const userTry = await userCtx.request.get(`${BASE}/api/admin/backup/${fileName}`);
  check("کاربر عادی به فایل پشتیبان دسترسی ندارد", userTry.status() === 403, userTry.status());

  // تنظیمات خودکار: ذخیرهٔ این بخش نباید بقیهٔ تنظیمات سایت را پاک کند
  await admin.check("#backup_auto");
  await admin.fill("#backup_interval_hours", "6");
  await admin.fill("#backup_keep", "3");
  await admin.click("button:has-text('ذخیره تنظیمات پشتیبان‌گیری')");
  await admin.waitForSelector("form:has(#backup_auto) .alert-success", { timeout: 20000 });
  await admin.reload({ waitUntil: "domcontentloaded" });
  check("پشتیبان‌گیری خودکار روشن ماند", await admin.isChecked("#backup_auto"));
  check("فاصلهٔ پشتیبان‌گیری ذخیره شد", (await admin.inputValue("#backup_interval_hours")) === "6");
  check("تعداد نگه‌داری ذخیره شد", (await admin.inputValue("#backup_keep")) === "3");

  await admin.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
  check(
    "ذخیرهٔ تنظیمات پشتیبان، بقیه تنظیمات را پاک نکرد",
    (await admin.inputValue("#site_name")).length > 0,
    await admin.inputValue("#site_name"),
  );

  // بازیابی: بدون نوشتن کلمهٔ تأیید نباید انجام شود
  await admin.goto(`${BASE}/admin/backup`, { waitUntil: "domcontentloaded" });
  await admin.selectOption("#name", fileName);
  await admin.fill("#confirm", "بله");
  await admin.click("button:has-text('بازیابی')");
  await admin.waitForSelector("form:has(#confirm) .alert-error", { timeout: 20000 });
  check(
    "بدون کلمهٔ تأیید، بازیابی انجام نمی‌شود",
    (await admin.textContent("form:has(#confirm) .alert-error")).includes("بازیابی"),
  );

  await admin.selectOption("#name", fileName);
  await admin.fill("#confirm", "بازیابی");
  await admin.click("button:has-text('بازیابی')");
  await admin.waitForSelector("form:has(#confirm) .alert-success", { timeout: 60000 });
  const restored = await admin.textContent("form:has(#confirm) .alert-success");
  check("بازیابی انجام شد", restored.includes("بازیابی انجام شد"), restored);
  check("پشتیبان ایمنی هم ساخته شد", restored.includes("پشتیبان ایمنی"), restored);

  await admin.goto(`${BASE}/admin/backup`, { waitUntil: "domcontentloaded" });
  check(
    "تنظیماتِ بعد از پشتیبان با بازیابی برگشتند",
    (await admin.isChecked("#backup_auto")) === false,
  );
  const afterRestoreRows = await admin.$$eval("table tbody tr", (list) => list.length);
  check("پشتیبان ایمنی هم در فهرست هست", afterRestoreRows >= 2, afterRestoreRows);

  await admin.click("table tbody tr:first-child button:has-text('حذف')");
  await admin.waitForURL(/msg=/, { timeout: 20000 });
  const afterDelete = await admin.$$eval("table tbody tr", (list) => list.length);
  check("پشتیبان حذف شد", afterDelete === afterRestoreRows - 1, afterDelete);

  await admin.goto(`${BASE}/admin/backup`, { waitUntil: "domcontentloaded" });

  console.log("→ پشتیبان رمزگذاری‌شده");
  await admin.fill("#backup_password", "گذرواژه-تست-۱۲۳");
  await admin.click("button:has-text('ذخیره تنظیمات پشتیبان‌گیری')");
  await admin.waitForSelector("form:has(#backup_auto) .alert-success", { timeout: 20000 });
  await admin.reload({ waitUntil: "domcontentloaded" });
  check("هشدار گذرواژه نمایش داده می‌شود", (await admin.textContent("body")).includes("قابل بازیابی نیستند"));

  await admin.click("button:has-text('ساخت پشتیبان تازه')");
  await admin.waitForSelector(".page-head .alert-success", { timeout: 60000 });
  check(
    "پشتیبان تازه رمزگذاری شد",
    (await admin.textContent(".page-head .alert-success")).includes("رمزگذاری‌شده"),
    await admin.textContent(".page-head .alert-success"),
  );

  await admin.reload({ waitUntil: "domcontentloaded" });
  const encName = (await admin.textContent("table tbody tr:first-child .cell-main")).trim();
  check("نام فایل رمزشده پسوند enc دارد", encName.endsWith(".tar.gz.enc"), encName);
  check(
    "نشان قفل در جدول دیده می‌شود",
    (await admin.textContent("table tbody tr:first-child .cell-sub")).includes("🔒"),
  );

  const encFile = await adminCtx.request.get(`${BASE}/api/admin/backup/${encName}`);
  const encBody = await encFile.body();
  check("دانلود فایل رمزشده کار می‌کند", encFile.status() === 200, encFile.status());
  check(
    "فایل دانلودشده رمز است (نه gzip خام)",
    encBody.subarray(0, 8).toString("utf8") === "FNDGHENC",
    encBody.subarray(0, 8).toString("utf8"),
  );

  /** یک تلاش بازیابی از صفحهٔ تازه، تا پیام قبلی با پیام تازه قاطی نشود */
  const tryRestore = async (name, password) => {
    await admin.goto(`${BASE}/admin/backup`, { waitUntil: "domcontentloaded" });
    await admin.selectOption("#name", name);
    if (password) await admin.fill("#password", password);
    await admin.fill("#confirm", "بازیابی");
    await admin.click("button:has-text('بازیابی')");
    await admin.waitForSelector("form:has(#confirm) .alert-error, form:has(#confirm) .alert-success", {
      timeout: 60000,
    });
    return admin.textContent("form:has(#confirm) .alert-error, form:has(#confirm) .alert-success");
  };

  const noPass = await tryRestore(encName, "");
  check("بازیابی فایل رمزشده بدون گذرواژه رد می‌شود", noPass.includes("رمزگذاری شده"), noPass);

  const badPass = await tryRestore(encName, "گذرواژه-غلط");
  check("گذرواژهٔ غلط پذیرفته نمی‌شود", badPass.includes("گذرواژه درست نیست"), badPass);

  const goodPass = await tryRestore(encName, "گذرواژه-تست-۱۲۳");
  check("بازیابی با گذرواژهٔ درست انجام شد", goodPass.includes("بازیابی انجام شد"), goodPass);

  // گذرواژه را برای بقیهٔ تست‌ها برمی‌داریم
  await admin.goto(`${BASE}/admin/backup`, { waitUntil: "domcontentloaded" });
  await admin.fill("#backup_password", "");
  await admin.click("button:has-text('ذخیره تنظیمات پشتیبان‌گیری')");
  await admin.waitForSelector("form:has(#backup_auto) .alert-success", { timeout: 20000 });

  console.log("→ تیکت پشتیبانی و پیوست فایل");
  await user.goto(`${BASE}/dashboard/tickets`, { waitUntil: "domcontentloaded" });
  await user.fill("#subject", "تست پشتیبانی");
  await user.fill("#body", "این یک تیکت تستی است.");
  check("فیلد پیوست در فرم تیکت هست", await user.isVisible("#attachment"));
  await user.setInputFiles("#attachment", makeReceipt());
  await Promise.all([
    user.waitForURL("**/dashboard/tickets/**", { timeout: 20000 }),
    user.click("button:has-text('ارسال تیکت')"),
  ]);
  check("تیکت ثبت شد", user.url().includes("/dashboard/tickets/"));
  const ticketUrl = user.url();

  const attachLink = user.locator(".chat a.attach-thumb, .chat a.attach-chip").first();
  await attachLink.waitFor({ timeout: 20000 });
  const attachHref = (await attachLink.getAttribute("href")) ?? "";
  check("پیوست تیکت روی پیام نمایش داده شد", attachHref.startsWith("/api/attachment/"), attachHref);

  const attachResponse = await user.request.get(`${BASE}${attachHref}`);
  check("صاحب تیکت می‌تواند پیوست را باز کند", attachResponse.status() === 200, attachResponse.status());
  check(
    "پیوست با نوع درست سرو می‌شود",
    (attachResponse.headers()["content-type"] ?? "").includes("image/"),
    attachResponse.headers()["content-type"],
  );

  // کاربر دیگر (اینجا: بازدیدکنندهٔ بدون حساب) نباید به فایل برسد
  const guestAttach = await guest.request.get(`${BASE}${attachHref}`);
  check("بدون ورود، پیوست باز نمی‌شود", guestAttach.status() === 401, guestAttach.status());

  // پاسخ پشتیبانی با پیوست
  const ticketId = ticketUrl.split("/").pop();
  await admin.goto(`${BASE}/admin/tickets/${ticketId}`, { waitUntil: "domcontentloaded" });
  check("پیوست کاربر در پنل پشتیبانی هم دیده می‌شود", (await admin.locator("a.attach-thumb").count()) > 0);
  await admin.fill("textarea[name=body]", "این هم تصویر راهنما.");
  await admin.setInputFiles("input[name=attachment]", makeReceipt());
  await admin.click("button:has-text('ارسال پاسخ')");
  await admin.waitForFunction(() => document.querySelectorAll("a.attach-thumb").length >= 2, null, {
    timeout: 30000,
  });
  check("پاسخ پشتیبانی با پیوست ثبت شد", (await admin.locator("a.attach-thumb").count()) >= 2);

  await user.goto(ticketUrl, { waitUntil: "domcontentloaded" });
  check("کاربر پیوست پشتیبانی را می‌بیند", (await user.locator("a.attach-thumb").count()) >= 2);

  console.log("→ نوار بالا و منوی موبایل");
  const phone = await browser.newContext({ locale: "fa-IR", viewport: { width: 360, height: 780 } });
  const small = await phone.newPage();
  await small.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await small.fill("#email", email);
  await small.fill("#password", userPassword);
  await Promise.all([
    small.waitForURL(/dashboard|admin/, { timeout: 20000 }),
    small.click("button[type=submit]"),
  ]);

  const fits = async (page) =>
    page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      for (const el of document.querySelectorAll(".nav-inner *")) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0) continue;
        if (Math.round(rect.right) > vw + 1 || Math.round(rect.left) < -1) {
          return `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}`;
        }
      }
      return "";
    });

  check("هیچ دکمه‌ای از نوار بالا بیرون نمی‌زند", (await fits(small)) === "", await fits(small));
  check("دکمهٔ منوی موبایل هست", await small.isVisible(".menu-btn"));
  check("دکمهٔ خروج روی موبایل داخل نوار نیست", !(await small.isVisible(".nav-actions > .hide-sm")));

  await small.click(".menu-btn");
  await small.waitForSelector(".menu-sheet .menu-link", { timeout: 10000 });
  const sheet = (await small.textContent(".menu-sheet")) ?? "";
  check("منو لینک‌های سایت را دارد", sheet.includes("تعرفه‌ها") && sheet.includes("آموزش اتصال"), sheet.slice(0, 80));
  check("منو پنل کاربری را دارد", sheet.includes("پنل کاربری"));
  check("منو دکمهٔ خروج دارد", sheet.includes("خروج"));
  check("منو تعویض زبان دارد", await small.isVisible(".menu-sheet .lang-switch"));

  await small.click(".menu-sheet a:has-text('تعرفه‌ها')");
  await small.waitForURL("**/plans", { timeout: 20000 });
  check("لینک منو کار می‌کند و منو بسته می‌شود", !(await small.isVisible(".menu-sheet .menu-link")));

  // مهمان هم نباید سرریز داشته باشد
  const phoneGuest = await browser.newContext({ locale: "fa-IR", viewport: { width: 360, height: 780 } });
  const smallGuest = await phoneGuest.newPage();
  await smallGuest.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  check("نوار بالای مهمان هم جا می‌شود", (await fits(smallGuest)) === "", await fits(smallGuest));
  await phoneGuest.close();
  await phone.close();

  console.log("→ اطلاعیه به کاربران");
  await admin.goto(`${BASE}/admin/announce`, { waitUntil: "domcontentloaded" });
  check("صفحهٔ اطلاعیه باز شد", (await admin.textContent("body")).includes("نوشتن اطلاعیه"));
  check("گروه‌های مخاطب نمایش داده شدند", (await admin.textContent("#audience")).includes("نمایندگان"));

  await admin.fill("#title", "سرور آلمان ارتقا پیدا کرد");
  await admin.fill("#body", "سرعت بیشتر، بدون تغییر لینک اشتراک.");
  await admin.fill("#href", "/plans");
  await admin.click("button:has-text('ارسال اطلاعیه')");
  await admin.waitForSelector("form .alert-success, form .alert-error", { timeout: 30000 });
  const announceMsg = (await admin.textContent("form .alert-success, form .alert-error")) ?? "";
  check("اطلاعیه فرستاده شد", announceMsg.includes("ثبت شد"), announceMsg);

  await admin.reload({ waitUntil: "domcontentloaded" });
  check(
    "اطلاعیه در تاریخچه آمد",
    (await admin.textContent("body")).includes("سرور آلمان ارتقا پیدا کرد"),
  );

  // کاربر باید همان اطلاعیه را در زنگ اعلان ببیند
  await user.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  check("زنگ اعلان کاربر عدد گرفت", await user.isVisible(".bell-dot"));

  await user.goto(`${BASE}/dashboard/notifications`, { waitUntil: "domcontentloaded" });
  const inbox = (await user.textContent("body")) ?? "";
  check("اطلاعیه به کاربر رسید", inbox.includes("سرور آلمان ارتقا پیدا کرد"), inbox.slice(0, 120));
  check("متن اطلاعیه هم آمد", inbox.includes("سرعت بیشتر"));

  const noteLink = await user.getAttribute("a.ticket-card:has-text('سرور آلمان')", "href");
  check("لینک اطلاعیه همان است که مدیر داد", noteLink === "/plans", noteLink);

  // اطلاعیهٔ بدون عنوان نباید فرستاده شود
  await admin.goto(`${BASE}/admin/announce`, { waitUntil: "domcontentloaded" });
  await admin.fill("#title", "کم");
  await admin.click("button:has-text('ارسال اطلاعیه')");
  await admin.waitForSelector("form .alert-error", { timeout: 20000 });
  check("عنوان کوتاه رد می‌شود", (await admin.textContent("form .alert-error")).includes("حداقل"));

  console.log("→ دکمهٔ باز کردن صفحهٔ اشتراک");
  await user.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const cardSubLink = await user.getAttribute(".svc-actions a[target=_blank]", "href");
  check(
    "دکمهٔ کارت سرویس به لینک اشتراک می‌رود",
    (cardSubLink ?? "").includes("/sub/"),
    cardSubLink,
  );
  check(
    "دیگر لینک v2rayng:// در پنل نیست",
    !((await user.content()).includes("v2rayng://")),
  );

  await user.click("a:has-text('کانفیگ و QR')");
  await user.waitForURL("**/dashboard/services/**", { timeout: 20000 });
  const openSub = user.locator("a:has-text('باز کردن صفحهٔ اشتراک')").first();
  check("دکمهٔ باز کردن صفحهٔ اشتراک هست", (await openSub.count()) > 0);
  const openHref = await openSub.getAttribute("href");
  const shownSub = (await user.textContent(".copy-box code")) ?? "";
  check("آدرس دکمه همان لینک اشتراک است", openHref === shownSub.trim(), openHref);
  check("در تب تازه باز می‌شود", (await openSub.getAttribute("target")) === "_blank");

  console.log("→ بازیابی رمز عبور با ایمیل");
  // تست نسخهٔ انگلیسی، زبان این مرورگر را عوض کرده بود؛ برمی‌گردانیم به فارسی
  await guestCtx.addCookies([{ name: "fandogh_lang", value: "fa", url: BASE }]);
  const SMTP_PORT = Number(process.env.MOCK_SMTP_PORT || 8894);
  const INBOX = `http://127.0.0.1:${SMTP_PORT + 1}/_mail`;

  // بدون تنظیم SMTP نباید لینک «رمزم را فراموش کرده‌ام» دیده شود
  await guest.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  check(
    "بدون تنظیم ایمیل، لینک فراموشی رمز نیست",
    !(await guest.isVisible("a[href='/forgot']")),
  );

  await admin.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
  await admin.fill("#smtp_host", "127.0.0.1");
  await admin.fill("#smtp_port", String(SMTP_PORT));
  await admin.fill("#smtp_user", process.env.MOCK_SMTP_USER || "shop");
  await admin.fill("#smtp_pass", process.env.MOCK_SMTP_PASS || "smtp-pass");
  await admin.fill("#smtp_from", "فندق <no-reply@test.local>");
  await admin.check("#reset_enabled");
  await admin.click("button:has-text('ذخیره همه تنظیمات')");
  // پیام همین فرم، نه پیام موقتِ صفحه
  await admin.waitForSelector("form:has(#smtp_host) .alert-success", { timeout: 20000 });

  await fetch(`${INBOX}/clear`).catch(() => null);
  const mailForm = admin.locator("form:has(button:has-text('ارسال ایمیل آزمایشی'))");
  await mailForm.locator("button").click();
  await mailForm.locator(".alert").first().waitFor({ timeout: 30000 });
  const mailMsg = (await mailForm.locator(".alert").first().textContent()) ?? "";
  const testMail = await fetch(`${INBOX}/last`).then((r) => r.json());
  check("ایمیل آزمایشی از پنل فرستاده شد", Boolean(testMail), mailMsg);

  // حالا کاربر واقعی رمزش را فراموش می‌کند
  await fetch(`${INBOX}/clear`);
  await guest.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  check("لینک فراموشی رمز ظاهر شد", await guest.isVisible("a[href='/forgot']"));

  await Promise.all([
    guest.waitForURL("**/forgot", { timeout: 20000 }),
    guest.click("a[href='/forgot']"),
  ]);
  await guest.fill("#email", email);
  await guest.click("button:has-text('ارسال لینک بازیابی')");
  await guest.waitForSelector(".alert-success", { timeout: 30000 });
  check(
    "پیام یکسان بعد از درخواست نشان داده شد",
    (await guest.textContent(".alert-success")).includes("اگر این ایمیل"),
  );

  const resetMail = await fetch(`${INBOX}/last`).then((r) => r.json());
  check("ایمیل بازیابی رسید", Boolean(resetMail), resetMail?.subject);
  check("ایمیل به همان کاربر رفت", (resetMail?.to ?? []).includes(email), resetMail?.to);

  const linkMatch = (resetMail?.text ?? "").match(/https?:\/\/[^\s"'<]+\/reset\?token=[a-f0-9]+/i);
  check("لینک بازیابی داخل ایمیل هست", Boolean(linkMatch), (resetMail?.text ?? "").slice(0, 160));
  const resetPath = linkMatch ? linkMatch[0].replace(/^https?:\/\/[^/]+/, "") : "";

  // لینک دست‌کاری‌شده نباید کار کند
  await guest.goto(`${BASE}/reset?token=deadbeef`, { waitUntil: "domcontentloaded" });
  check("توکن الکی رد می‌شود", (await guest.textContent("body")).includes("معتبر نیست"));

  await guest.goto(`${BASE}${resetPath}`, { waitUntil: "domcontentloaded" });
  check("صفحهٔ ساخت رمز تازه باز شد", await guest.isVisible("#password"));

  await guest.fill("#password", "new-pass-12345");
  await guest.fill("#confirm", "different-pass");
  await guest.click("button:has-text('ثبت رمز تازه')");
  await guest.waitForSelector(".alert-error", { timeout: 20000 });
  check("رمز و تکرارش باید یکی باشند", (await guest.textContent(".alert-error")).includes("یکی نیستند"));

  await guest.fill("#password", "new-pass-12345");
  await guest.fill("#confirm", "new-pass-12345");
  await Promise.all([
    guest.waitForURL(/login\?reset=1/, { timeout: 30000 }),
    guest.click("button:has-text('ثبت رمز تازه')"),
  ]);
  userPassword = "new-pass-12345";
  check("بعد از ثبت رمز به صفحهٔ ورود برگشت", guest.url().includes("reset=1"));
  check("پیام موفقیت نمایش داده شد", (await guest.textContent("body")).includes("رمز عبور عوض شد"));

  // همان لینک دیگر کار نمی‌کند
  await guest.goto(`${BASE}${resetPath}`, { waitUntil: "domcontentloaded" });
  check("لینک بازیابی یک‌بارمصرف است", (await guest.textContent("body")).includes("معتبر نیست"));

  // رمز تازه واقعاً کار می‌کند و کاربر از دستگاه قبلی بیرون افتاده است
  await login(guest, email, "new-pass-12345");
  check("ورود با رمز تازه انجام شد", guest.url().includes("/dashboard"), guest.url());

  await user.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  check(
    "نشست قبلی بعد از تغییر رمز بسته شد",
    user.url().includes("/login"),
    user.url(),
  );

  console.log("→ انتخاب سرور اکانت تست");
  // سرور تست را روی سرور دوم ثابت می‌کنیم و با یک کاربر تازه تست می‌گیریم
  await admin.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
  const trialOption = await admin
    .locator("#trial_panel_id option")
    .filter({ hasText: "MOCK-UI-2" })
    .first()
    .getAttribute("value");
  check("سرور تست در تنظیمات قابل انتخاب است", Boolean(trialOption), trialOption);

  await admin.selectOption("#trial_panel_id", trialOption ?? "");
  await admin.check("#trial_enabled");
  await admin.click("button:has-text('ذخیره همه تنظیمات')");
  await admin.waitForSelector(".alert-success", { timeout: 20000 });

  await admin.reload({ waitUntil: "domcontentloaded" });
  check("انتخاب سرور تست ذخیره شد", (await admin.inputValue("#trial_panel_id")) === trialOption);

  const trialCtx = await browser.newContext({ locale: "fa-IR" });
  const trialUser = await trialCtx.newPage();
  trialUser.on("dialog", (d) => d.accept());
  const trialEmail = `trial${Date.now()}@test.local`;
  await trialUser.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await trialUser.fill("#email", trialEmail);
  await trialUser.fill("#password", "test12345");
  await trialUser.fill("#confirm", "test12345");
  await Promise.all([
    trialUser.waitForURL("**/dashboard", { timeout: 20000 }),
    trialUser.click("button[type=submit]"),
  ]);

  const trialBody = (await trialUser.textContent("body")) ?? "";
  check("کارت تست رایگان نمایش داده شد", trialBody.includes("تست رایگان"), trialBody.slice(0, 80));
  check(
    "با ثابت‌بودن سرور، انتخاب لوکیشن به مشتری نشان داده نمی‌شود",
    !(await trialUser.isVisible("#trialPanel")),
  );
  check("لوکیشن سرور تست به مشتری گفته می‌شود", trialBody.includes("هلند - تست UI"), trialBody.slice(0, 200));

  await Promise.all([
    trialUser.waitForURL("**/dashboard/services/**", { timeout: 40000 }),
    trialUser.click("button:has-text('ساخت اکانت تست')"),
  ]);
  const trialDetail = (await trialUser.textContent("body")) ?? "";
  check("بعد از ساخت تست، کانفیگ همان سرویس باز می‌شود", trialUser.url().includes("/dashboard/services/"));
  check("لینک اشتراک تست از سرور دوم است", trialDetail.includes("sub2.test.local"), trialDetail.slice(0, 120));

  await admin.goto(`${BASE}/admin/services?q=${encodeURIComponent(trialEmail)}`, {
    waitUntil: "domcontentloaded",
  });
  const trialRow = (await admin.textContent("table tbody tr:first-child")) ?? "";
  check("تست از سرور تعیین‌شده داده شد", trialRow.includes("هلند - تست UI"), trialRow.slice(0, 140));
  await trialCtx.close();

  // تنظیم را برمی‌گردانیم تا بقیهٔ تست‌ها دست‌نخورده بمانند
  await admin.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
  await admin.selectOption("#trial_panel_id", "");
  await admin.click("button:has-text('ذخیره همه تنظیمات')");
  await admin.waitForSelector(".alert-success", { timeout: 20000 });

  console.log("→ نقش پشتیبان");
  // کاربر فعلی را پشتیبان می‌کنیم و با یک مرورگر جدا واردش می‌شویم
  await admin.goto(adminUserUrl, { waitUntil: "domcontentloaded" });
  await admin.click("button:has-text('پشتیبان کن')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 20000 });
  const supportMsg = (await admin.textContent(".alert-success, .alert-error")) ?? "";
  check("نقش پشتیبان داده شد", supportMsg.includes("پشتیبان شد"), supportMsg);

  const supportCtx = await browser.newContext({ locale: "fa-IR" });
  const support = await supportCtx.newPage();
  support.on("dialog", (d) => d.accept());
  await login(support, email, userPassword);
  await support.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  const supportHome = (await support.textContent("body")) ?? "";
  check("پشتیبان وارد پنل می‌شود", support.url().includes("/admin"), support.url());
  check("منوی پشتیبان «سرورها» ندارد", !supportHome.includes("سرورها (3x-ui)"));
  check("منوی پشتیبان «تنظیمات» ندارد", !(await support.isVisible("aside.side a[href='/admin/settings']")));
  check("منوی پشتیبان «پشتیبان‌گیری» ندارد", !(await support.isVisible("aside.side a[href='/admin/backup']")));
  check("تیکت‌ها برای پشتیبان باز است", await support.isVisible("aside.side a[href='/admin/tickets']"));
  check("درآمد به پشتیبان نشان داده نمی‌شود", !supportHome.includes("درآمد کل"), supportHome.slice(0, 120));

  await support.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
  check("صفحهٔ تنظیمات برای پشتیبان باز نمی‌شود", !support.url().includes("/admin/settings"), support.url());

  await support.goto(`${BASE}/admin/backup`, { waitUntil: "domcontentloaded" });
  check("صفحهٔ پشتیبان‌گیری برای پشتیبان باز نمی‌شود", !support.url().includes("/backup"), support.url());

  await support.goto(`${BASE}/admin/panels`, { waitUntil: "domcontentloaded" });
  check("صفحهٔ سرورها برای پشتیبان باز نمی‌شود", !support.url().includes("/panels"), support.url());

  await support.goto(`${BASE}/admin/services`, { waitUntil: "domcontentloaded" });
  const supportServices = (await support.textContent("body")) ?? "";
  check("سرویس‌ها برای پشتیبان باز است", supportServices.includes("سرویس‌ها"));
  check("دکمهٔ حذف سرویس برای پشتیبان نیست", !(await support.isVisible("button:has-text('حذف')")));
  check("دکمهٔ همگام‌سازی برای پشتیبان هست", await support.isVisible("button:has-text('↻')"));

  await support.goto(`${BASE}/admin/tickets`, { waitUntil: "domcontentloaded" });
  const openTicket = support.locator("a[href^='/admin/tickets/']").first();
  if ((await openTicket.count()) > 0) {
    await openTicket.click();
    await support.waitForURL("**/admin/tickets/**", { timeout: 20000 });
    const replyText = "سلام، پشتیبانی هستم و پیگیر تیکت شما.";
    await support.fill("textarea[name=body]", replyText);
    await support.click("button:has-text('ارسال پاسخ')");
    await support.waitForSelector(`text=${replyText}`, { timeout: 20000 });
    check("پشتیبان می‌تواند به تیکت پاسخ دهد", (await support.textContent("body")).includes(replyText));
  }

  // نقش را برمی‌گردانیم تا بقیهٔ تست‌ها دست‌نخورده بمانند
  await admin.goto(adminUserUrl, { waitUntil: "domcontentloaded" });
  await admin.click("button:has-text('لغو نقش پشتیبان')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 20000 });
  await support.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  check("بعد از لغو نقش، پنل بسته می‌شود", !support.url().includes("/admin"), support.url());
  await supportCtx.close();

  console.log("→ ورود دومرحله‌ای مدیر");
  await admin.goto(`${BASE}/admin/security`, { waitUntil: "domcontentloaded" });
  check("صفحهٔ امنیت حساب باز شد", (await admin.textContent("body")).includes("ورود دومرحله‌ای"));

  await admin.click("button:has-text('شروع فعال‌سازی')");
  await admin.waitForSelector(".copy-box code", { timeout: 20000 });
  const shownKey = ((await admin.textContent(".copy-box code")) ?? "").replace(/\s/g, "");
  check("کلید دومرحله‌ای ساخته شد", /^[A-Z2-7]{32}$/.test(shownKey), shownKey);
  const qrImage = admin.locator("img[alt*='QR']").first();
  await qrImage.waitFor({ state: "visible", timeout: 20000 });
  check(
    "QR کلید نمایش داده شد",
    await qrImage.evaluate((img) => img.complete && img.naturalWidth > 0),
  );

  await admin.fill("#totp-code", "000000");
  await admin.click("button:has-text('تأیید و روشن‌کردن')");
  await admin.waitForSelector(".alert-error", { timeout: 20000 });
  check("کد غلط پذیرفته نمی‌شود", (await admin.textContent(".alert-error")).includes("درست نیست"));

  await admin.fill("#totp-code", totpFromSecret(shownKey));
  await admin.click("button:has-text('تأیید و روشن‌کردن')");
  await admin.waitForSelector(".backup-codes", { timeout: 20000 });
  const backupCodes = await admin.$$eval(".backup-codes span", (list) =>
    list.map((el) => el.textContent.trim()),
  );
  check("ورود دومرحله‌ای روشن شد", (await admin.textContent("body")).includes("روشن شد"));
  check("۸ کد پشتیبان نمایش داده شد", backupCodes.length === 8, backupCodes.length);

  // خروج و ورود دوباره: حالا باید کد بخواهد
  await admin.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await Promise.all([
    admin.waitForURL(`${BASE}/`, { timeout: 20000 }),
    admin.click("button:has-text('خروج')"),
  ]);

  await admin.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await admin.fill("#email", ADMIN_EMAIL);
  await admin.fill("#password", ADMIN_PASSWORD);
  await Promise.all([
    admin.waitForURL(/login\/verify/, { timeout: 20000 }),
    admin.click("button[type=submit]"),
  ]);
  check("بعد از رمز، مرحلهٔ دوم خواسته شد", admin.url().includes("/login/verify"), admin.url());

  await admin.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  check("با نشست نیمه‌کاره پنل باز نمی‌شود", !admin.url().includes("/admin"), admin.url());

  await admin.goto(`${BASE}/login/verify`, { waitUntil: "domcontentloaded" });
  await admin.fill("#code", "111111");
  await admin.click("button:has-text('تأیید و ورود')");
  await admin.waitForSelector(".alert-error", { timeout: 20000 });
  check("کد غلط در ورود رد می‌شود", (await admin.textContent(".alert-error")).includes("کد درست نیست"));

  await admin.fill("#code", totpFromSecret(shownKey));
  await Promise.all([
    admin.waitForURL(/\/admin/, { timeout: 20000 }),
    admin.click("button:has-text('تأیید و ورود')"),
  ]);
  check("با کد درست وارد پنل شد", admin.url().includes("/admin"), admin.url());

  // ورود با کد پشتیبان
  await admin.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await Promise.all([
    admin.waitForURL(`${BASE}/`, { timeout: 20000 }),
    admin.click("button:has-text('خروج')"),
  ]);
  await admin.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await admin.fill("#email", ADMIN_EMAIL);
  await admin.fill("#password", ADMIN_PASSWORD);
  await Promise.all([
    admin.waitForURL(/login\/verify/, { timeout: 20000 }),
    admin.click("button[type=submit]"),
  ]);
  await admin.fill("#code", backupCodes[0]);
  await Promise.all([
    admin.waitForURL(/\/admin/, { timeout: 20000 }),
    admin.click("button:has-text('تأیید و ورود')"),
  ]);
  check("ورود با کد پشتیبان کار می‌کند", admin.url().includes("/admin"), admin.url());

  await admin.goto(`${BASE}/admin/security`, { waitUntil: "domcontentloaded" });
  check(
    "کد پشتیبان مصرف‌شده کم شد",
    ((await admin.textContent("body")) ?? "").includes("۷ کد پشتیبان"),
  );

  // خاموش‌کردن دومرحله‌ای
  await admin.fill("#off-password", "wrong-password");
  await admin.click("button:has-text('خاموش کن')");
  await admin.waitForSelector(".alert-error", { timeout: 20000 });
  check("خاموش‌کردن با رمز غلط انجام نمی‌شود", (await admin.textContent(".alert-error")).includes("رمز عبور"));

  await admin.fill("#off-password", ADMIN_PASSWORD);
  await admin.click("button:has-text('خاموش کن')");
  await admin.waitForSelector("button:has-text('شروع فعال‌سازی')", { timeout: 20000 });
  check("ورود دومرحله‌ای خاموش شد", await admin.isVisible("button:has-text('شروع فعال‌سازی')"));
} catch (err) {
  failed += 1;
  console.error("✗ خطای اجرای تست:", err.message);
} finally {
  await browser.close();
}

console.log(`\nنتیجه تست رابط کاربری: ${passed} موفق، ${failed} ناموفق`);
process.exit(failed ? 1 : 0);
