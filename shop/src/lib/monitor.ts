import "server-only";
import type { Panel } from "@prisma/client";
import { db } from "./db";
import { panelClient } from "./provision";
import { asNum, getSettings } from "./settings";
import { notifyAdmin } from "./telegram";

export type PanelHealth = {
  ok: boolean;
  latencyMs: number;
  message: string;
  inbounds: number;
};

/** یک بررسی سلامت روی پنل: ورود + گرفتن فهرست اینباندها با اندازه‌گیری زمان پاسخ */
export async function probePanel(panel: Panel): Promise<PanelHealth> {
  const started = Date.now();
  try {
    const client = panelClient(panel);
    const inbounds = await client.listInbounds();
    const latencyMs = Date.now() - started;
    return {
      ok: true,
      latencyMs,
      message: `${inbounds.length} اینباند پاسخ داد`,
      inbounds: inbounds.length,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      message: (err as Error).message,
      inbounds: 0,
    };
  }
}

/**
 * بررسی یک سرور، ثبت نتیجه در تاریخچه و تصمیم‌گیری دربارهٔ توقف/ازسرگیری فروش.
 *
 * بعد از چند خرابی پیاپی (پیش‌فرض ۳ بار) فروش روی سرور خودکار متوقف می‌شود تا
 * سفارش تازه روی سرور خراب نرود؛ با اولین پاسخ درست، دوباره وارد چرخهٔ فروش می‌شود.
 */
export async function checkPanel(panel: Panel): Promise<PanelHealth & { autoDisabled: boolean }> {
  const settings = await getSettings();
  const threshold = Math.max(1, asNum(settings.monitor_fail_threshold, 3));
  const health = await probePanel(panel);

  const failCount = health.ok ? 0 : panel.failCount + 1;
  const autoDisabled = health.ok ? false : failCount >= threshold;

  await db.$transaction([
    db.panelCheck.create({
      data: {
        panelId: panel.id,
        ok: health.ok,
        latencyMs: health.latencyMs,
        message: health.message.slice(0, 300),
      },
    }),
    db.panel.update({
      where: { id: panel.id },
      data: {
        healthOk: health.ok,
        latencyMs: health.latencyMs,
        failCount,
        autoDisabled,
        lastCheckAt: new Date(),
        lastError: health.ok ? null : health.message.slice(0, 300),
      },
    }),
  ]);

  // فقط در لحظهٔ تغییر وضعیت به مدیر خبر می‌دهیم، نه در هر بررسی
  if (!health.ok && autoDisabled && !panel.autoDisabled) {
    await notifyAdmin(
      `🔴 <b>سرور از دسترس خارج شد</b>\n\n` +
        `سرور: ${panel.flag} ${panel.name} (${panel.location})\n` +
        `خطا: ${health.message}\n\n` +
        `فروش روی این سرور تا بازگشت، خودکار متوقف شد.`,
    );
  } else if (health.ok && panel.autoDisabled) {
    await notifyAdmin(
      `🟢 <b>سرور برگشت</b>\n\n` +
        `سرور: ${panel.flag} ${panel.name} (${panel.location})\n` +
        `زمان پاسخ: ${health.latencyMs} میلی‌ثانیه\n\n` +
        `فروش روی این سرور دوباره فعال شد.`,
    );
  }

  return { ...health, autoDisabled };
}

/** بررسی همهٔ سرورهای فعال */
export async function runPanelChecks(): Promise<{ checked: number; down: number }> {
  const panels = await db.panel.findMany({ where: { isActive: true } });
  let down = 0;
  for (const panel of panels) {
    const result = await checkPanel(panel).catch(() => null);
    if (result && !result.ok) down += 1;
  }
  return { checked: panels.length, down };
}

export type UptimeStat = {
  panelId: string;
  total: number;
  ok: number;
  uptime: number;
  avgLatency: number;
};

/** درصد آپتایم و میانگین پینگ هر سرور در بازهٔ داده‌شده */
export async function uptimeStats(hours = 24): Promise<Map<string, UptimeStat>> {
  const since = new Date(Date.now() - hours * 3_600_000);
  const checks = await db.panelCheck.findMany({
    where: { createdAt: { gte: since } },
    select: { panelId: true, ok: true, latencyMs: true },
  });

  const stats = new Map<string, UptimeStat>();
  for (const check of checks) {
    const entry =
      stats.get(check.panelId) ??
      { panelId: check.panelId, total: 0, ok: 0, uptime: 100, avgLatency: 0 };
    entry.total += 1;
    if (check.ok) {
      entry.ok += 1;
      entry.avgLatency += check.latencyMs;
    }
    stats.set(check.panelId, entry);
  }
  for (const entry of stats.values()) {
    entry.uptime = entry.total ? Math.round((entry.ok / entry.total) * 1000) / 10 : 100;
    entry.avgLatency = entry.ok ? Math.round(entry.avgLatency / entry.ok) : 0;
  }
  return stats;
}

/** آخرین بررسی‌های یک سرور برای نمودار پینگ (قدیمی → جدید) */
export async function latencyHistory(
  panelId: string,
  take = 40,
): Promise<{ label: string; value: number; ok: boolean }[]> {
  const rows = await db.panelCheck.findMany({
    where: { panelId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.reverse().map((row) => ({
    label: row.createdAt.toISOString(),
    value: row.ok ? row.latencyMs : 0,
    ok: row.ok,
  }));
}

/** پاک‌سازی تاریخچهٔ قدیمی‌تر از چند روز */
export async function pruneChecks(days = 7): Promise<number> {
  const { count } = await db.panelCheck.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) } },
  });
  return count;
}
