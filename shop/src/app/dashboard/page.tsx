import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { asBool, getSettings } from "@/lib/settings";
import { syncUserServices } from "@/lib/provision";
import { fmt, remainingDays } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";
import ServiceCard from "@/components/ServiceCard";
import TrialCard from "@/components/TrialCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "پنل کاربری" };

export default async function DashboardPage() {
  const user = await requireUser();
  await syncUserServices(user.id);

  const locale = await getLocale();
  const tr = translator(locale);
  const f = fmt(locale);

  const [services, settings, panels, pendingOrders, wallet, unread] = await Promise.all([
    db.service.findMany({
      where: { userId: user.id },
      include: { panel: true, plan: true },
      orderBy: { createdAt: "desc" },
    }),
    getSettings(),
    db.panel.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.order.count({ where: { userId: user.id, status: { in: ["awaiting_receipt", "pending_review"] } } }),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { balance: true } }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  const trialAvailable = asBool(settings.trial_enabled) && !user.trialUsedAt && panels.length > 0;

  // خلاصهٔ وضعیت برای نوار بالای پنل
  const activeServices = services.filter((s) => s.status === "active");
  const hasUnlimited = activeServices.some((s) => s.totalBytes <= 0);
  const remainingBytes = activeServices.reduce(
    (sum, s) => sum + (s.totalBytes > 0 ? Math.max(0, s.totalBytes - s.usedBytes) : 0),
    0,
  );
  const usedBytes = services.reduce((sum, s) => sum + s.usedBytes, 0);
  const nextExpiry = activeServices
    .map((s) => s.expiresAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const nextExpiryDays = remainingDays(nextExpiry);

  return (
    <div>
      <div className="card-title">
        <h1 style={{ fontSize: "1.35rem" }}>
          {tr("dashPages.hello", { name: user.name || user.email.split("@")[0] })}
        </h1>
        <Link className="btn btn-sm btn-primary" href="/plans">
          {tr("dash.newService")}
        </Link>
      </div>

      {unread > 0 ? (
        <div className="alert alert-info">
          {tr("dashPages.unread", { count: f.num(unread) })}{" "}
          <Link href="/dashboard/notifications">{tr("dashPages.viewNotif")}</Link>
        </div>
      ) : null}

      {pendingOrders > 0 ? (
        <div className="alert alert-warn">
          {tr("dashPages.pendingOrders", { count: f.num(pendingOrders) })}{" "}
          <Link href="/dashboard/orders">{tr("dashPages.viewOrders")}</Link>
        </div>
      ) : null}

      {services.length ? (
        <div className="summary-strip">
          <div className="summary-tile">
            <span>{tr("dashPages.activeServices")}</span>
            <b>{f.num(activeServices.length)}</b>
          </div>
          <div className="summary-tile">
            <span>{tr("dashPages.volumeLeft")}</span>
            <b>
              {hasUnlimited && remainingBytes === 0
                ? tr("common.unlimited")
                : f.bytes(remainingBytes, f.num(0))}
            </b>
          </div>
          <div className="summary-tile">
            <span>{tr("dashPages.totalUsed")}</span>
            <b>{f.bytes(usedBytes, f.num(0))}</b>
          </div>
          <div className="summary-tile">
            <span>{tr("dashPages.walletTile")}</span>
            <b>{f.money(wallet.balance, false)}</b>
            <small className="dim">
              <Link href="/dashboard/wallet">{tr("dashPages.topupLink")}</Link>
            </small>
          </div>
          <div className="summary-tile">
            <span>{tr("dashPages.nextExpiry")}</span>
            <b>
              {nextExpiry
                ? nextExpiryDays !== null && nextExpiryDays > 0
                  ? f.daysLeft(nextExpiryDays)
                  : tr("common.expired")
                : "—"}
            </b>
            {nextExpiry ? <small className="dim">{f.date(nextExpiry)}</small> : null}
          </div>
        </div>
      ) : null}

      {trialAvailable ? (
        <TrialCard
          locale={locale}
          panels={panels.map((p) => ({ id: p.id, flag: p.flag, location: p.location }))}
          volume={settings.trial_volume_gb}
          days={settings.trial_days}
        />
      ) : null}

      {services.length ? (
        <div className="grid" style={{ marginTop: 16 }}>
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              locale={locale}
              autoRenewEnabled={asBool(settings.auto_renew_enabled) && asBool(settings.wallet_enabled)}
            />
          ))}
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">🌐</div>
          <p>{tr("dashPages.empty")}</p>
          <Link className="btn btn-primary" href="/plans">
            {tr("dashPages.seePlans")}
          </Link>
        </div>
      )}
    </div>
  );
}
