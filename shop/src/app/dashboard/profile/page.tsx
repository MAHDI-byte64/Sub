import Link from "next/link";
import { db } from "@/lib/db";
import { currentSessionId, describeDevice, requireUser } from "@/lib/auth";
import { faDate, faNum, formatBytes } from "@/lib/format";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import RevokeSessionsButton from "@/components/RevokeSessionsButton";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "پروفایل" };

export default async function ProfilePage() {
  const user = await requireUser("/dashboard/profile");
  const [row, orders, services, usage, tickets, sessions, sessionId] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id } }),
    db.order.count({ where: { userId: user.id, status: "approved" } }),
    db.service.count({ where: { userId: user.id } }),
    db.service.aggregate({ where: { userId: user.id }, _sum: { usedBytes: true } }),
    db.ticket.count({ where: { userId: user.id } }),
    db.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    currentSessionId(),
  ]);

  const initial = (row.name || row.email).trim().charAt(0).toUpperCase();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>پروفایل</h1>
          <p>اطلاعات حساب و امنیت آن.</p>
        </div>
      </div>

      <div className="card">
        <div className="svc-head" style={{ marginBottom: 0 }}>
          <div className="svc-title">
            <span className="avatar">{initial}</span>
            <div>
              <h3>{row.name || row.email.split("@")[0]}</h3>
              <small className="ltr mono">{row.email}</small>
            </div>
          </div>
          <span className="badge badge-success">عضو از {faDate(row.createdAt)}</span>
        </div>
      </div>

      <div className="summary-strip">
        <div className="summary-tile">
          <span>🛒 خریدهای موفق</span>
          <b>{faNum(orders)}</b>
        </div>
        <div className="summary-tile">
          <span>🌐 سرویس‌ها</span>
          <b>{faNum(services)}</b>
        </div>
        <div className="summary-tile">
          <span>📊 مجموع مصرف</span>
          <b>{formatBytes(usage._sum.usedBytes ?? 0, "۰")}</b>
        </div>
        <div className="summary-tile">
          <span>🎫 تیکت‌ها</span>
          <b>{faNum(tickets)}</b>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">
            <h3>اطلاعات حساب</h3>
          </div>
          <div className="svc-meta">
            <div className="meta-row">
              <span>📧 ایمیل</span>
              <b className="ltr mono">{row.email}</b>
            </div>
            <div className="meta-row">
              <span>👤 نام</span>
              <b>{row.name || "—"}</b>
            </div>
            <div className="meta-row">
              <span>📅 تاریخ عضویت</span>
              <b>{faDate(row.createdAt)}</b>
            </div>
            <div className="meta-row">
              <span>🎁 اکانت تست</span>
              <b>{row.trialUsedAt ? `دریافت شده در ${faDate(row.trialUsedAt)}` : "استفاده نشده"}</b>
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <Link className="btn btn-sm btn-primary" href="/plans">
              خرید سرویس جدید
            </Link>
            <Link className="btn btn-sm" href="/dashboard/tickets">
              تیکت پشتیبانی
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <h3>📱 دستگاه‌های واردشده</h3>
            <span className="badge badge-info">{faNum(sessions.length)} نشست فعال</span>
          </div>
          <p className="field-hint">
            اگر دستگاهی را نمی‌شناسید، از همه خارج شوید و رمز عبورتان را عوض کنید.
          </p>
          <div className="svc-meta" style={{ marginBottom: 14 }}>
            {sessions.map((session) => {
              const device = describeDevice(session.userAgent);
              const isCurrent = session.id === sessionId;
              return (
                <div className={`meta-row${isCurrent ? "" : ""}`} key={session.id}>
                  <span>
                    {device.icon} {device.name}
                  </span>
                  <b>
                    {isCurrent ? (
                      <span className="badge badge-success">همین دستگاه</span>
                    ) : (
                      <span className="dim" style={{ fontWeight: 500 }}>
                        ورود {relativeTime(session.createdAt)}
                      </span>
                    )}
                  </b>
                </div>
              );
            })}
          </div>
          <RevokeSessionsButton count={Math.max(0, sessions.length - 1)} />
        </div>

        <div className="card">
          <div className="card-title">
            <h3>🔒 تغییر رمز عبور</h3>
          </div>
          <p className="field-hint">
            رمز شما با الگوریتم scrypt ذخیره می‌شود و در هیچ‌جا قابل بازیابی نیست؛ رمزی انتخاب کنید که
            جای دیگری استفاده نکرده باشید.
          </p>
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
