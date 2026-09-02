import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NOTIFICATION_ICONS } from "@/lib/notify";
import { fmt } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";
import ActionForm from "@/components/ActionForm";
import { markNotificationsReadAction } from "@/app/actions/shop";
import { pushPublicKey } from "@/lib/push";
import PushToggle from "@/components/PushToggle";

export const dynamic = "force-dynamic";
export const metadata = { title: "اعلان‌ها" };

export default async function NotificationsPage() {
  const user = await requireUser("/dashboard/notifications");
  const locale = await getLocale();
  const tr = translator(locale);
  const f = fmt(locale);
  const [items, unread, vapidKey] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 60 }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    pushPublicKey(),
  ]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{tr("dashPages.notifTitle")}</h1>
          <p>{tr("dashPages.notifSubtitle")}</p>
        </div>
        {unread ? (
          <ActionForm
            action={markNotificationsReadAction}
            submitLabel={tr("dashPages.markRead", { count: f.num(unread) })}
            buttonClass="btn btn-sm"
            inline
          />
        ) : (
          <span className="badge badge-success">{tr("dashPages.allRead")}</span>
        )}
      </div>

      {vapidKey ? (
        <div className="card">
          <PushToggle publicKey={vapidKey} locale={locale} />
        </div>
      ) : null}

      {items.length ? (
        <div className="card">
          <div className="grid" style={{ gap: 10 }}>
            {items.map((item) => {
              const icon = NOTIFICATION_ICONS[item.kind] ?? "🔔";
              const body = (
                <>
                  <span className="tc-icon">{icon}</span>
                  <span className="tc-body">
                    <b>{item.title}</b>
                    {item.body ? <span className="tc-preview">{item.body}</span> : null}
                    <span className="tc-meta">
                      <span>🕒 {f.relative(item.createdAt)}</span>
                      <span>{f.date(item.createdAt, true)}</span>
                    </span>
                  </span>
                  {!item.readAt ? <span className="badge badge-warn">{tr("common.new")}</span> : null}
                </>
              );
              return item.href ? (
                <Link className="ticket-card" key={item.id} href={item.href}>
                  {body}
                </Link>
              ) : (
                <div className="ticket-card" key={item.id}>
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">🔔</div>
          {tr("dashPages.noNotif")}
        </div>
      )}
    </div>
  );
}
