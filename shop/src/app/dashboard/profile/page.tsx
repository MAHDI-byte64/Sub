import Link from "next/link";
import { db } from "@/lib/db";
import { currentSessionId, describeDevice, requireUser } from "@/lib/auth";
import { fmt } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import RevokeSessionsButton from "@/components/RevokeSessionsButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "پروفایل" };

export default async function ProfilePage() {
  const user = await requireUser("/dashboard/profile");
  const locale = await getLocale();
  const tr = translator(locale);
  const f = fmt(locale);
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
          <h1>{tr("profile.title")}</h1>
          <p>{tr("profile.subtitle")}</p>
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
          <span className="badge badge-success">
            {tr("profile.memberSince", { date: f.date(row.createdAt) })}
          </span>
        </div>
      </div>

      <div className="summary-strip">
        <div className="summary-tile">
          <span>{tr("profile.purchases")}</span>
          <b>{f.num(orders)}</b>
        </div>
        <div className="summary-tile">
          <span>{tr("profile.services")}</span>
          <b>{f.num(services)}</b>
        </div>
        <div className="summary-tile">
          <span>{tr("profile.usage")}</span>
          <b>{f.bytes(usage._sum.usedBytes ?? 0, f.num(0))}</b>
        </div>
        <div className="summary-tile">
          <span>{tr("profile.tickets")}</span>
          <b>{f.num(tickets)}</b>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">
            <h3>{tr("profile.account")}</h3>
          </div>
          <div className="svc-meta">
            <div className="meta-row">
              <span>{tr("profile.email")}</span>
              <b className="ltr mono">{row.email}</b>
            </div>
            <div className="meta-row">
              <span>{tr("profile.name")}</span>
              <b>{row.name || "—"}</b>
            </div>
            <div className="meta-row">
              <span>{tr("profile.joined")}</span>
              <b>{f.date(row.createdAt)}</b>
            </div>
            <div className="meta-row">
              <span>{tr("profile.trial")}</span>
              <b>
                {row.trialUsedAt
                  ? tr("profile.trialUsed", { date: f.date(row.trialUsedAt) })
                  : tr("profile.trialUnused")}
              </b>
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <Link className="btn btn-sm btn-primary" href="/plans">
              {tr("dash.newService")}
            </Link>
            <Link className="btn btn-sm" href="/dashboard/tickets">
              {tr("footer.ticket")}
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <h3>{tr("profile.devices")}</h3>
            <span className="badge badge-info">
              {tr("profile.sessions", { count: f.num(sessions.length) })}
            </span>
          </div>
          <p className="field-hint">
            {tr("profile.devicesHint")}
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
                      <span className="badge badge-success">{tr("profile.thisDevice")}</span>
                    ) : (
                      <span className="dim" style={{ fontWeight: 500 }}>
                        {tr("profile.loggedIn", { time: f.relative(session.createdAt) })}
                      </span>
                    )}
                  </b>
                </div>
              );
            })}
          </div>
          <RevokeSessionsButton locale={locale} count={Math.max(0, sessions.length - 1)} />
        </div>

        <div className="card">
          <div className="card-title">
            <h3>{tr("profile.changePassword")}</h3>
          </div>
          <p className="field-hint">
            {tr("profile.passwordHint")}
          </p>
          <ChangePasswordForm locale={locale} />
        </div>
      </div>
    </div>
  );
}
