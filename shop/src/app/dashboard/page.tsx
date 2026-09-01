import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { asBool, getSettings } from "@/lib/settings";
import { syncUserServices } from "@/lib/provision";
import { faDate, faNum, formatBytes, remainingDays } from "@/lib/format";
import ServiceCard from "@/components/ServiceCard";
import TrialCard from "@/components/TrialCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "پنل کاربری" };

export default async function DashboardPage() {
  const user = await requireUser();
  await syncUserServices(user.id);

  const [services, settings, panels, pendingOrders] = await Promise.all([
    db.service.findMany({
      where: { userId: user.id },
      include: { panel: true, plan: true },
      orderBy: { createdAt: "desc" },
    }),
    getSettings(),
    db.panel.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.order.count({ where: { userId: user.id, status: { in: ["awaiting_receipt", "pending_review"] } } }),
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
        <h1 style={{ fontSize: "1.35rem" }}>سلام {user.name || user.email.split("@")[0]} 👋</h1>
        <Link className="btn btn-sm btn-primary" href="/plans">
          خرید سرویس جدید
        </Link>
      </div>

      {pendingOrders > 0 ? (
        <div className="alert alert-warn">
          شما {pendingOrders} سفارش در انتظار پرداخت یا بررسی دارید.{" "}
          <Link href="/dashboard/orders">مشاهده سفارش‌ها</Link>
        </div>
      ) : null}

      {services.length ? (
        <div className="summary-strip">
          <div className="summary-tile">
            <span>🌐 سرویس فعال</span>
            <b>{faNum(activeServices.length)}</b>
          </div>
          <div className="summary-tile">
            <span>📦 حجم باقی‌مانده</span>
            <b>{hasUnlimited && remainingBytes === 0 ? "نامحدود" : formatBytes(remainingBytes, "۰")}</b>
          </div>
          <div className="summary-tile">
            <span>📊 مجموع مصرف</span>
            <b>{formatBytes(usedBytes, "۰")}</b>
          </div>
          <div className="summary-tile">
            <span>⏳ نزدیک‌ترین انقضا</span>
            <b>
              {nextExpiry
                ? nextExpiryDays !== null && nextExpiryDays > 0
                  ? `${faNum(nextExpiryDays)} روز`
                  : "منقضی"
                : "—"}
            </b>
            {nextExpiry ? <small className="dim">{faDate(nextExpiry)}</small> : null}
          </div>
        </div>
      ) : null}

      {trialAvailable ? (
        <TrialCard
          panels={panels.map((p) => ({ id: p.id, flag: p.flag, location: p.location }))}
          volume={settings.trial_volume_gb}
          days={settings.trial_days}
        />
      ) : null}

      {services.length ? (
        <div className="grid" style={{ marginTop: 16 }}>
          {services.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">🌐</div>
          <p>هنوز سرویسی ندارید.</p>
          <Link className="btn btn-primary" href="/plans">
            مشاهده تعرفه‌ها
          </Link>
        </div>
      )}
    </div>
  );
}
