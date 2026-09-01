import Link from "next/link";
import { db } from "@/lib/db";
import { faDate, faNum } from "@/lib/format";
import { TICKET_STATUS } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function AdminTicketsPage() {
  const [tickets, open] = await Promise.all([
    db.ticket.findMany({
      orderBy: { updatedAt: "desc" },
      include: { user: true, messages: { take: 1, orderBy: { createdAt: "desc" } } },
      take: 200,
    }),
    db.ticket.count({ where: { status: "open" } }),
  ]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>تیکت‌ها</h1>
          <p>پیام‌های پشتیبانی کاربران.</p>
        </div>
        <span className={`badge ${open ? "badge-warn" : "badge-success"}`}>
          {open ? `${faNum(open)} تیکت باز` : "همه پاسخ داده شده"}
        </span>
      </div>

      {tickets.length ? (
        <div className="grid" style={{ gap: 10 }}>
          {tickets.map((ticket) => {
            const status = TICKET_STATUS[ticket.status] ?? TICKET_STATUS.open;
            const last = ticket.messages[0];
            return (
              <Link className="ticket-item" key={ticket.id} href={`/admin/tickets/${ticket.id}`}>
                <span className="ti">{ticket.status === "closed" ? "🔒" : "💬"}</span>
                <span className="tm">
                  <b>{ticket.subject}</b>
                  <small className="ltr">{ticket.user.email}</small>
                  {last ? <small> · {last.body.slice(0, 50)}</small> : null}
                </span>
                <span className="oa">
                  <span className={`badge ${status.badge}`}>{status.label}</span>
                  <small className="dim" style={{ display: "block", marginTop: 4 }}>
                    {faDate(ticket.updatedAt, true)}
                  </small>
                </span>
              </Link>
            );
          })}
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
