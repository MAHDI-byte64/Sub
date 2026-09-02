import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NOTIFICATION_ICONS } from "@/lib/notify";
import { faDate, faNum, relativeTime } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import { markNotificationsReadAction } from "@/app/actions/shop";
import { pushPublicKey } from "@/lib/push";
import PushToggle from "@/components/PushToggle";

export const dynamic = "force-dynamic";
export const metadata = { title: "اعلان‌ها" };

export default async function NotificationsPage() {
  const user = await requireUser("/dashboard/notifications");
  const [items, unread, vapidKey] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 60 }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    pushPublicKey(),
  ]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>اعلان‌ها</h1>
          <p>یادآوری انقضا، هشدار حجم، تأیید سفارش و پاسخ پشتیبانی اینجا جمع می‌شوند.</p>
        </div>
        {unread ? (
          <ActionForm
            action={markNotificationsReadAction}
            submitLabel={`خوانده شد (${faNum(unread)})`}
            buttonClass="btn btn-sm"
            inline
          />
        ) : (
          <span className="badge badge-success">همه خوانده شده</span>
        )}
      </div>

      {vapidKey ? (
        <div className="card">
          <PushToggle publicKey={vapidKey} />
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
                      <span>🕒 {relativeTime(item.createdAt)}</span>
                      <span>{faDate(item.createdAt, true)}</span>
                    </span>
                  </span>
                  {!item.readAt ? <span className="badge badge-warn">جدید</span> : null}
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
          هنوز اعلانی ندارید.
        </div>
      )}
    </div>
  );
}
