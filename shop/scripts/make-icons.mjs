/**
 * ساخت آیکون‌های PWA از روی لوگوی SVG سایت.
 *
 * از همان Chromium تست‌ها استفاده می‌کند تا وابستگی تازه‌ای اضافه نشود.
 * اجرا: node scripts/make-icons.mjs
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "icons");
const EXECUTABLE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const BG = "#04060d";

const svg = readFileSync(path.join(ROOT, "public", "fandogh.svg"), "utf8");
mkdirSync(OUT, { recursive: true });

/** آیکون ساده (شفاف) و آیکون maskable (با حاشیهٔ امن) */
function page(size, maskable) {
  const pad = maskable ? Math.round(size * 0.14) : Math.round(size * 0.06);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${size}px;height:${size}px}
    body{background:${maskable ? BG : "transparent"};display:grid;place-items:center}
    .wrap{width:${size - pad * 2}px;height:${size - pad * 2}px}
    svg{width:100%;height:100%}
  </style></head><body><div class="wrap">${svg}</div></body></html>`;
}

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const tab = await ctx.newPage();

const targets = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "icon-maskable-192.png", size: 192, maskable: true },
  { name: "icon-maskable-512.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180, maskable: true },
];

for (const target of targets) {
  await tab.setViewportSize({ width: target.size, height: target.size });
  await tab.setContent(page(target.size, target.maskable));
  const buffer = await tab.screenshot({ omitBackground: !target.maskable });
  writeFileSync(path.join(OUT, target.name), buffer);
  console.log("  ▸", target.name, `${target.size}×${target.size}`);
}

await browser.close();
console.log("آیکون‌ها در public/icons ساخته شدند.");
