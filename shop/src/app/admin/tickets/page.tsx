import Link from "next/link";
import { db } from "@/lib/db";
import { durationLabel, faNum, relativeTime } from "@/lib/format";
import { averageResponseMs, awaitingReply } from "@/lib/tickets";
import { TICKET_STATUS } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function AdminTicketsPage() {
  const tickets = await db.ticket.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      user: true,
      service: { include: { panel: true, plan: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
    take: 200,
  });

  const withMeta = tickets.map((ticket) => ({
    ticket,
    waiting: awaitingReply(ticket.messages) && ticket.status !== "closed",
    avg: averageResponseMs(ticket.messages),
  }));

  // منتظر پاسخ‌ها اول، بعد بقیه بر اساس آخرین فعالیت
  withMeta.sort((a, b) => {
    if (a.waiting !== b.waiting) return a.waiting ? -1 : 1;
    return b.ticket.updatedAt.getTime() - a.ticket.updatedAt.getTime();
  });

  const waitingCount = withMeta.filter((t) => t.waiting).length;
  const closed = tickets.filter((t) => t.status === "closed").length;
  const gaps = withMeta.map((t) => t.avg).filter((v): v is number => v !== null);
  const avgAll = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
  const oldestWaiting = withMeta.find((t) => t.waiting)?.ticket.updatedAt ?? null;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>پشتیبانی</h1>
          <p>گفتگوهایی که منتظر پاسخ شما هستند بالاتر نمایش داده می‌شوند.</p>
        </div>
        <span className={`badge ${waitingCount ? "badge-warn" : "badge-success"}`}>
          {waitingCount ? `${faNum(waitingCount)} منتظر پاسخ` : "همه پاسخ داده شده"}
        </span>
      </div>

      <div className="sla-card" style={waitingCount ? { borderColor: "rgba(245,158,11,0.3)" } : undefined}>
        <span className="sla-icon">{waitingCount ? "⏳" : "✅"}</span>
        <div className="sla-main">
          <b>
            {waitingCount
              ? `${faNum(waitingCount)} گفتگو منتظر پاسخ شماست`
              : "هیچ گفتگویی بی‌پاسخ نمانده است"}
          </b>
          <span>
            {oldestWaiting
              ? `قدیمی‌ترین پیام بی‌پاسخ: ${relativeTime(oldestWaiting)}`
              : "وضعیت پشتیبانی سالم است."}
          </span>
        </div>
        <div className="sla-stat">
          <b>{faNum(tickets.length)}</b>
          <span>کل گفتگوها</span>
        </div>
        <div className="sla-stat">
          <b>{avgAll ? durationLabel(avgAll) : "—"}</b>
          <span>میانگین پاسخ</span>
        </div>
        <div className="sla-stat">
          <b>{faNum(closed)}</b>
          <span>بسته‌شده</span>
        </div>
      </div>

      {withMeta.length ? (
        <div className="card">
          <div className="card-title">
            <h3>گفتگوها</h3>
          </div>
          <div className="grid" style={{ gap: 10 }}>
            {withMeta.map(({ ticket, waiting, avg }) => {
              const status = TICKET_STATUS[ticket.status] ?? TICKET_STATUS.open;
              const last = ticket.messages[ticket.messages.length - 1];
              return (
                <Link
                  className="ticket-card"
                  key={ticket.id}
                  href={`/admin/tickets/${ticket.id}`}
                  style={waiting ? { borderColor: "rgba(245,158,11,0.35)" } : undefined}
                >
                  <span className={`tc-icon ${waiting ? "is-open" : "is-answered"}`}>
                    {(ticket.user.name || ticket.user.email).charAt(0).toUpperCase()}
                  </span>
                  <span className="tc-body">
                    <b>{ticket.subject}</b>
                    <span className="tc-preview">
                      {last ? `${last.fromAdmin ? "شما: " : "کاربر: "}${last.body}` : "—"}
                    </span>
                    <span className="tc-meta">
                      <span className="ltr">{ticket.user.email}</span>
                      <span>💬 {faNum(ticket.messages.length)}</span>
                      <span>🕒 {relativeTime(ticket.updatedAt)}</span>
                      {avg ? <span>⚡ {durationLabel(avg)}</span> : null}
                      {ticket.service ? (
                        <span>
                          {ticket.service.panel.flag} {ticket.service.plan?.title ?? "سرویس"}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="tc-side">
                    <span className={`badge ${waiting ? "badge-warn" : status.badge}`}>
                      {waiting ? "منتظر پاسخ" : status.label}
                    </span>
                    <span className="btn btn-sm btn-primary">پاسخ</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">🎫</div>
          تیکتی ثبت نشده است.
        </div>
      )}
    </div>
  );
}
