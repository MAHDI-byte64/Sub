/** پیدا کردن عنصری که باعث سرریز افقی می‌شود */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3333";
const PAGES = (process.env.PAGES || "/admin/services,/admin/users,/admin,/dashboard/orders").split(",");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fa-IR" });
await ctx.route("**/*", (r) =>
  r.request().url().startsWith("http://127.0.0.1") ? r.continue() : r.abort(),
);
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.fill("#email", process.env.ADMIN_EMAIL || "admin@example.com");
await page.fill("#password", process.env.ADMIN_PASSWORD || "admin12345");
await Promise.all([page.waitForURL(/admin|dashboard/), page.click("button[type=submit]")]);

for (const path of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  const result = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    for (const el of document.querySelectorAll("*")) {
      const rect = el.getBoundingClientRect();
      const right = Math.round(rect.right);
      const left = Math.round(rect.left);
      // در RTL سرریز معمولاً از سمت چپ (منفی) است
      if (right > vw + 1 || left < -1) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || "").toString().slice(0, 60),
          left,
          right,
          w: Math.round(rect.width),
        });
      }
    }
    return { vw, scrollW: document.documentElement.scrollWidth, offenders: offenders.slice(0, 8) };
  });
  console.log(`\n=== ${path} — viewport ${result.vw}, scrollWidth ${result.scrollW}`);
  for (const o of result.offenders) {
    console.log(`   ${o.tag}.${o.cls} | left=${o.left} right=${o.right} w=${o.w}`);
  }
}
await browser.close();
