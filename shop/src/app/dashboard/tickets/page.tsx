import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { faDate, faNum } from "@/lib/format";
import { TICKET_STATUS } from "@/lib/status";
import NewTicketForm from "@/components/NewTicketForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "تیکت‌ها" };

export default async function TicketsPage() {
  const user = await requireUser("/dashboard/tickets");
  const tickets = await db.ticket.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: { take: 1, orderBy: { createdAt: "desc" } },
      _count: { select: { messages: true } },
    },
  });

  const open = tickets.filter((t) => t.status === "open").length;
  const answered = tickets.filter((t) => t.status === "answered").length;
  const lastUpdate = tickets[0]?.updatedAt ?? null;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>تیکت‌های پشتیبانی</h1>
          <p>سوال یا مشکلی دارید؟ اینجا بنویسید؛ معمولاً کمتر از یک ساعت پاسخ می‌دهیم.</p>
        </div>
        <span className={`badge ${open ? "badge-warn" : "badge-success"}`}>
          {open ? `${faNum(open)} در انتظار پاسخ` : "همه پاسخ داده شده"}
        </span>
      </div>

      {tickets.length ? (
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
            <span>🕒 آخرین فعالیت</span>
            <b>{lastUpdate ? faDate(lastUpdate) : "—"}</b>
          </div>
        </div>
      ) : null}

      {tickets.length ? (
        <div className="card">
          <div className="card-title">
            <h3>گفتگوهای شما</h3>
          </div>
          <div className="grid" style={{ gap: 10 }}>
            {tickets.map((ticket) => {
              const status = TICKET_STATUS[ticket.status] ?? TICKET_STATUS.open;
              const last = ticket.messages[0];
              const iconState =
                ticket.status === "open" ? "is-open" : ticket.status === "answered" ? "is-answered" : "";
              return (
                <Link className="ticket-card" key={ticket.id} href={`/dashboard/tickets/${ticket.id}`}>
                  <span className={`tc-icon ${iconState}`}>
                    {ticket.status === "closed" ? "🔒" : "💬"}
                  </span>
                  <span className="tc-body">
                    <b>{ticket.subject}</b>
                    <span className="tc-preview">
                      {last ? `${last.fromAdmin ? "پشتیبانی: " : "شما: "}${last.body}` : "—"}
                    </span>
                    <span className="tc-meta">
                      <span>💬 {faNum(ticket._count.messages)} پیام</span>
                      <span>🕒 {faDate(ticket.updatedAt, true)}</span>
                    </span>
                  </span>
                  <span className="tc-side">
                    <span className={`badge ${status.badge}`}>{status.label}</span>
                    <span className="btn btn-sm">مشاهده گفتگو</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">🎫</div>
          <p>هنوز تیکتی ثبت نکرده‌اید. اولین سوالتان را همین‌جا بپرسید.</p>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <h3>✏️ ثبت تیکت جدید</h3>
          <span className="badge badge-info">پاسخ معمولاً زیر ۱ ساعت</span>
        </div>
        <NewTicketForm />
      </div>
    </div>
  );
}
