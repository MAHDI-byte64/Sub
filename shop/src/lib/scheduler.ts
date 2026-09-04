import "server-only";
import { db } from "./db";
import { asBool, asNum, getSettings } from "./settings";
import { renewServiceOnPanel, syncService } from "./provision";
import { alreadyNotified, notifyUser } from "./notify";
import { debitWallet } from "./wallet";
import { notifyAdmin } from "./telegram";
import { pruneChecks, runPanelChecks } from "./monitor";
import { runAutoBackup } from "./backup";
import { pruneResetTokens } from "./reset";
import { toman, faNum } from "./format";

const TICK_MS = 15 * 60_000;
const DAY = 86_400_000;

let started = false;
let running = false;

/** یک دور کامل کارهای پس‌زمینه؛ برای تست هم مستقیم قابل فراخوانی است */
export async function runMaintenance(): Promise<{
  synced: number;
  reminded: number;
  quotaWarned: number;
  renewed: number;
  expired: number;
  panelsChecked: number;
  panelsDown: number;
  backup?: string;
}> {
  const settings = await getSettings();
  const reminderDays = Math.max(0, asNum(settings.expiry_reminder_days, 3));
  const quotaPercent = Math.min(99, Math.max(50, asNum(settings.quota_warn_percent, 85)));
  const autoRenewOn = asBool(settings.auto_renew_enabled);

  const result = {
    synced: 0,
    reminded: 0,
    quotaWarned: 0,
    renewed: 0,
    expired: 0,
    panelsChecked: 0,
    panelsDown: 0,
    backup: undefined as string | undefined,
  };

  // توکن‌های بازیابی رمزِ منقضی یا مصرف‌شده تلنبار نشوند
  await pruneResetTokens().catch(() => 0);

  // ۰) پشتیبان خودکار (اگر وقتش رسیده باشد)
  try {
    const backup = await runAutoBackup();
    if (backup) result.backup = backup.file;
  } catch {
    /* پشتیبان‌گیری نباید بقیهٔ کارها را متوقف کند */
  }

  // ۰٫۵) بررسی سلامت سرورها (قبل از بقیه؛ سرور خراب از چرخهٔ فروش کنار می‌رود)
  if (asBool(settings.monitor_enabled)) {
    try {
      const health = await runPanelChecks();
      result.panelsChecked = health.checked;
      result.panelsDown = health.down;
      await pruneChecks(Math.max(1, asNum(settings.monitor_keep_days, 7)));
    } catch {
      /* بررسی سلامت نباید بقیهٔ کارها را متوقف کند */
    }
  }

  // ۱) همگام‌سازی سرویس‌هایی که مدتی به‌روز نشده‌اند
  const stale = await db.service.findMany({
    where: {
      status: { in: ["active", "disabled"] },
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - 30 * 60_000) } }],
    },
    select: { id: true },
    take: 200,
  });
  for (const service of stale) {
    try {
      await syncService(service.id, true);
      result.synced += 1;
    } catch {
      /* سرور در دسترس نیست؛ دور بعد */
    }
  }

  const services = await db.service.findMany({
    where: { isTrial: false },
    include: { user: true, plan: true },
  });

  for (const service of services) {
    const expiresAt = service.expiresAt?.getTime() ?? 0;
    const daysLeft = expiresAt ? Math.ceil((expiresAt - Date.now()) / DAY) : null;

    // ۲) تمدید خودکار از کیف پول
    if (
      autoRenewOn &&
      service.autoRenew &&
      service.plan &&
      service.status !== "disabled" &&
      daysLeft !== null &&
      daysLeft <= 1
    ) {
      const price = service.plan.priceToman;
      if (service.user.balance >= price && price > 0) {
        try {
          await debitWallet(
            service.user.id,
            price,
            "auto_renew",
            `تمدید خودکار ${service.plan.title}`,
          );
          await renewServiceOnPanel(service, service.plan);
          await notifyUser({
            userId: service.userId,
            kind: "auto_renew",
            title: "سرویس شما خودکار تمدید شد",
            body: `${service.plan.title} با ${toman(price)} از کیف پول تمدید شد.`,
            href: "/dashboard",
            serviceId: service.id,
          });
          result.renewed += 1;
          continue;
        } catch {
          /* اگر تمدید نشد، یادآوری عادی فرستاده می‌شود */
        }
      } else if (!(await alreadyNotified(service.userId, "expiry_soon", service.id, 2 * DAY))) {
        await notifyUser({
          userId: service.userId,
          kind: "expiry_soon",
          title: "موجودی برای تمدید خودکار کافی نیست",
          body: `برای تمدید ${service.plan.title} به ${toman(price)} اعتبار نیاز دارید.`,
          href: "/dashboard/wallet",
          serviceId: service.id,
        });
        result.reminded += 1;
        continue;
      }
    }

    // ۳) یادآوری انقضا
    if (
      reminderDays > 0 &&
      daysLeft !== null &&
      daysLeft > 0 &&
      daysLeft <= reminderDays &&
      service.status === "active" &&
      !(await alreadyNotified(service.userId, "expiry_soon", service.id, 2 * DAY))
    ) {
      await notifyUser({
        userId: service.userId,
        kind: "expiry_soon",
        title: `${faNum(daysLeft)} روز تا پایان سرویس`,
        body: `${service.plan?.title ?? service.remark} به‌زودی منقضی می‌شود. برای قطع‌نشدن اتصال، تمدید کنید.`,
        href: `/plans?renew=${service.id}`,
        serviceId: service.id,
      });
      result.reminded += 1;
    }

    // ۴) اعلام انقضا
    if (
      service.status === "expired" &&
      !(await alreadyNotified(service.userId, "expired", service.id, 7 * DAY))
    ) {
      await notifyUser({
        userId: service.userId,
        kind: "expired",
        title: "سرویس شما منقضی شد",
        body: `${service.plan?.title ?? service.remark} به پایان رسید. با تمدید، همان کانفیگ دوباره فعال می‌شود.`,
        href: `/plans?renew=${service.id}`,
        serviceId: service.id,
      });
      result.expired += 1;
    }

    // ۵) هشدار اتمام حجم
    if (
      service.totalBytes > 0 &&
      service.status === "active" &&
      (service.usedBytes / service.totalBytes) * 100 >= quotaPercent &&
      !(await alreadyNotified(service.userId, "quota_low", service.id, 3 * DAY))
    ) {
      const percent = Math.round((service.usedBytes / service.totalBytes) * 100);
      await notifyUser({
        userId: service.userId,
        kind: "quota_low",
        title: `${faNum(percent)}٪ از حجم سرویس مصرف شده`,
        body: "برای قطع‌نشدن اینترنت، سرویس را تمدید کنید یا حجم اضافه بخرید.",
        href: `/plans?renew=${service.id}`,
        serviceId: service.id,
      });
      result.quotaWarned += 1;
    }
  }

  if (result.renewed || result.expired) {
    await notifyAdmin(
      `🔄 کارهای خودکار: ${faNum(result.renewed)} تمدید خودکار، ${faNum(result.expired)} انقضا، ` +
        `${faNum(result.reminded)} یادآوری.`,
      "system",
    );
  }

  return result;
}

/** اجرای دوره‌ای در پس‌زمینه (هنگام بالا آمدن سرور) */
export function startScheduler(): void {
  if (started) return;
  started = true;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runMaintenance();
    } catch (err) {
      console.error("[scheduler]", (err as Error).message);
    } finally {
      running = false;
    }
  };

  // اولین اجرا با کمی تأخیر تا بالا آمدن سرور کند نشود
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, TICK_MS).unref?.();
  console.log("[scheduler] کارهای پس‌زمینه هر ۱۵ دقیقه اجرا می‌شوند");
}
