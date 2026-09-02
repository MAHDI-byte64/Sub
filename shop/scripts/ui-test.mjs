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
  check("QR کد رندر شد", (await user.locator("img[alt='QR لینک اشتراک']").count()) > 0);

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
