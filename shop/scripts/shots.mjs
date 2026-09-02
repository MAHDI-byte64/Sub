/**
 * اسکرین‌شات از همه صفحات در دو اندازه (موبایل و دسکتاپ) برای بررسی طراحی.
 * اجرا: bash scripts/shots.sh
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3333";
const MOCK = process.env.MOCK_PANEL_URL || "http://127.0.0.1:8897";
const OUT = process.env.SHOTS_DIR || "/tmp/shots";
const EXECUTABLE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const TOKEN = process.env.MOCK_API_TOKEN || "3xui-test-token";

mkdirSync(OUT, { recursive: true });

function receipt() {
  const file = path.join(tmpdir(), "shot-receipt.png");
  writeFileSync(
    file,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  return file;
}

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ["--no-sandbox"] });

/** هیچ درخواستی به بیرون از سرور محلی نرود تا تست سریع و قطعی باشد */
async function blockExternal(ctx) {
  await ctx.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) return route.continue();
    return route.abort();
  });
}

async function shoot(page, name, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log("  ▸", name);
}

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 860 };

try {
  const ctx = await browser.newContext({ locale: "fa-IR", viewport: DESKTOP });
  await blockExternal(ctx);
  const admin = await ctx.newPage();
  admin.on("dialog", (d) => d.accept());

  // ورود مدیر و آماده‌سازی داده نمونه
  await admin.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await admin.fill("#email", "admin@example.com");
  await admin.fill("#password", "admin12345");
  await Promise.all([admin.waitForURL(/admin|dashboard/), admin.click("button[type=submit]")]);

  await admin.goto(`${BASE}/admin/panels`, { waitUntil: "domcontentloaded" });
  await admin.fill("#name", "DE-1");
  await admin.fill("#location", "آلمان - فرانکفورت");
  await admin.fill("#url", MOCK);
  await admin.fill("#apiToken", TOKEN);
  await admin.fill("#templateEmail", "template-vip");
  await admin.fill("#subBase", "https://sub.example.com/sub");
  await admin.click("form:has(#name) button[type=submit]");
  await admin.waitForSelector("text=سرور ذخیره شد", { timeout: 20000 });

  const userCtx = await browser.newContext({ locale: "fa-IR", viewport: DESKTOP });
  await blockExternal(userCtx);
  const user = await userCtx.newPage();
  user.on("dialog", (d) => d.accept());
  await user.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await user.fill("#email", `shot${Date.now()}@test.local`);
  await user.fill("#password", "test12345");
  await user.fill("#confirm", "test12345");
  await Promise.all([user.waitForURL("**/dashboard"), user.click("button[type=submit]")]);

  await user.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  await Promise.all([user.waitForURL("**/checkout**"), user.click("a:has-text('خرید این پلن')")]);
  await Promise.all([user.waitForURL("**/dashboard/orders/**"), user.click("button:has-text('ثبت سفارش')")]);
  const orderUrl = user.url();
  await user.setInputFiles("#receipt", receipt());
  await user.click("button:has-text('ارسال رسید')");
  await user.waitForSelector("text=رسید شما ثبت شد", { timeout: 20000 });

  await admin.goto(`${BASE}/admin/orders?status=pending_review`, { waitUntil: "domcontentloaded" });
  await admin.click("button:has-text('تأیید و تحویل سرویس')");
  await admin.waitForSelector(".alert-success, .alert-error", { timeout: 30000 });

  await user.goto(`${BASE}/dashboard/tickets`, { waitUntil: "domcontentloaded" });
  await user.fill("#subject", "سرعت سرویس");
  await user.fill("#body", "سلام، سرعت سرویس امروز کم شده. لطفاً بررسی کنید.");
  await Promise.all([user.waitForURL("**/dashboard/tickets/**"), user.click("button:has-text('ارسال تیکت')")]);

  // آدرس صفحه جزئیات سرویس تحویل‌شده
  await user.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await user.click("a:has-text('کانفیگ و QR')");
  await user.waitForSelector("text=کانفیگ مستقیم", { timeout: 30000 });
  const serviceUrl = user.url();

  // یک سفارش پرداخت‌نشده برای نمایش کارت بانکی
  await user.goto(`${BASE}/plans`, { waitUntil: "domcontentloaded" });
  await Promise.all([user.waitForURL("**/checkout**"), user.click("a:has-text('خرید این پلن')")]);
  await Promise.all([user.waitForURL("**/dashboard/orders/**"), user.click("button:has-text('ثبت سفارش')")]);
  const payUrl = user.url();

  // صفحات عمومی را با کاربر مهمان (خارج‌شده) می‌گیریم
  const guestCtx = await browser.newContext({ locale: "fa-IR", viewport: DESKTOP });
  await blockExternal(guestCtx);
  const guest = await guestCtx.newPage();

  const publicPages = [
    ["home", "/"],
    ["plans", "/plans"],
    ["tutorial", "/tutorial"],
    ["faq", "/faq"],
    ["terms", "/terms"],
    ["contact", "/contact"],
    ["login", "/login"],
    ["register", "/register"],
  ];
  const userPages = [
    ["dashboard", "/dashboard"],
    ["service-detail", serviceUrl.replace(BASE, "")],
    ["orders", "/dashboard/orders"],
    ["order-detail", orderUrl.replace(BASE, "")],
    ["payment", payUrl.replace(BASE, "")],
    ["wallet", "/dashboard/wallet"],
    ["notifications", "/dashboard/notifications"],
    ["tickets", "/dashboard/tickets"],
    ["profile", "/dashboard/profile"],
  ];
  const adminPages = [
    ["admin-home", "/admin"],
    ["admin-orders", "/admin/orders?status=all"],
    ["admin-panels", "/admin/panels"],
    ["admin-plans", "/admin/plans"],
    ["admin-services", "/admin/services"],
    ["admin-settings", "/admin/settings"],
    ["admin-tickets", "/admin/tickets"],
    ["admin-users", "/admin/users"],
    ["admin-discounts", "/admin/discounts"],
    ["admin-logs", "/admin/logs"],
  ];

  // پروندهٔ یک کاربر واقعی
  await admin.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
  const userHref = await admin.getAttribute("a.cell-main", "href").catch(() => null);
  if (userHref) adminPages.push(["admin-user", userHref]);

  for (const [size, viewport] of [["m", MOBILE], ["d", DESKTOP]]) {
    console.log(`\n${size === "m" ? "موبایل" : "دسکتاپ"}:`);
    for (const [name, url] of publicPages) {
      await guest.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
      await shoot(guest, `${size}-${name}`, viewport);
    }
    for (const [name, url] of userPages) {
      await user.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
      await shoot(user, `${size}-${name}`, viewport);
    }
    for (const [name, url] of adminPages) {
      await admin.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
      await shoot(admin, `${size}-${name}`, viewport);
    }
  }

  // بررسی سرریز افقی در موبایل
  console.log("\nبررسی سرریز افقی (موبایل):");
  for (const [name, url] of [...publicPages, ...userPages, ...adminPages]) {
    const page = url.startsWith("/admin")
      ? admin
      : publicPages.some(([, u]) => u === url)
        ? guest
        : user;
    await page.setViewportSize(MOBILE);
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
    // مهلت تثبیت چیدمان تا اندازه‌گیری نوسان نکند
    await page.waitForTimeout(400);
    const result = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const overflow = document.documentElement.scrollWidth - window.innerWidth;

      // عنصری که واقعاً باعث سرریز صفحه است (نه چیزی که داخل اسکرولر افقی کلیپ شده)
      const clipped = (el) => {
        let p = el.parentElement;
        while (p && p !== document.documentElement) {
          const st = getComputedStyle(p);
          if (["auto", "scroll", "hidden"].includes(st.overflowX)) return true;
          p = p.parentElement;
        }
        return false;
      };

      const offenders = [];
      if (overflow > 2) {
        for (const el of document.querySelectorAll("body *")) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0) continue;
          if (Math.round(rect.right) <= vw + 1 && Math.round(rect.left) >= -1) continue;
          if (clipped(el)) continue;
          offenders.push(
            `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}` +
              ` (w=${Math.round(rect.width)}, left=${Math.round(rect.left)})`,
          );
          if (offenders.length >= 3) break;
        }
      }
      return { overflow, offenders };
    });
    console.log(
      `  ${result.overflow > 2 ? "✗" : "✓"} ${name}` +
        (result.overflow > 2
          ? ` سرریز ${result.overflow}px → ${result.offenders.join(" | ") || "نامشخص"}`
          : ""),
    );
  }
} catch (err) {
  console.error("خطا:", err.message);
} finally {
  await browser.close();
}
