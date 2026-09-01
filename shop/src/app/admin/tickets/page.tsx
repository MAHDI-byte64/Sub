import Link from "next/link";
import { db } from "@/lib/db";
import { faDate, faNum } from "@/lib/format";
import { TICKET_STATUS } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function AdminTicketsPage() {
  const tickets = await db.ticket.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      user: true,
      messages: { take: 1, orderBy: { createdAt: "desc" } },
      _count: { select: { messages: true } },
    },
    take: 200,
  });

  const open = tickets.filter((t) => t.status === "open").length;
  const answered = tickets.filter((t) => t.status === "answered").length;
  const closed = tickets.filter((t) => t.status === "closed").length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>تیکت‌ها</h1>
          <p>پیام‌های پشتیبانی کاربران؛ تیکت‌های در انتظار پاسخ بالاتر نشان داده می‌شوند.</p>
        </div>
        <span className={`badge ${open ? "badge-warn" : "badge-success"}`}>
          {open ? `${faNum(open)} در انتظار پاسخ` : "همه پاسخ داده شده"}
        </span>
      </div>

      <div className="summary-strip">
        <div className="summary-tile">
          <span>🎫 کل تیکت‌ها</span>
          <b>{faNum(tickets.length)}</b>
        </div>
        <div className="summary-tile">
          <span>⏳ در انتظار پاسخ</span>
          <b>{faNum(open)}</b>
        </div>
        <div className="summary-tile">
          <span>✅ پاسخ داده شده</span>
          <b>{faNum(answered)}</b>
        </div>
        <div className="summary-tile">
          <span>🔒 بسته‌شده</span>
          <b>{faNum(closed)}</b>
        </div>
      </div>

      {tickets.length ? (
        <div className="card">
          <div className="card-title">
            <h3>گفتگوها</h3>
          </div>
          <div className="grid" style={{ gap: 10 }}>
            {tickets.map((ticket) => {
              const status = TICKET_STATUS[ticket.status] ?? TICKET_STATUS.open;
              const last = ticket.messages[0];
              const iconState =
                ticket.status === "open" ? "is-open" : ticket.status === "answered" ? "is-answered" : "";
              return (
                <Link className="ticket-card" key={ticket.id} href={`/admin/tickets/${ticket.id}`}>
                  <span className={`tc-icon ${iconState}`}>
                    {(ticket.user.name || ticket.user.email).charAt(0).toUpperCase()}
                  </span>
                  <span className="tc-body">
                    <b>{ticket.subject}</b>
                    <span className="tc-preview">
                      {last ? `${last.fromAdmin ? "شما: " : "کاربر: "}${last.body}` : "—"}
                    </span>
                    <span className="tc-meta">
                      <span className="ltr">{ticket.user.email}</span>
                      <span>💬 {faNum(ticket._count.messages)} پیام</span>
                      <span>🕒 {faDate(ticket.updatedAt, true)}</span>
                    </span>
                  </span>
                  <span className="tc-side">
                    <span className={`badge ${status.badge}`}>{status.label}</span>
                    <span className="btn btn-sm">پاسخ</span>
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
