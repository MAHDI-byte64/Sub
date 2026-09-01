import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { faDate } from "@/lib/format";
import { TICKET_STATUS } from "@/lib/status";
import NewTicketForm from "@/components/NewTicketForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "تیکت‌ها" };

export default async function TicketsPage() {
  const user = await requireUser("/dashboard/tickets");
  const tickets = await db.ticket.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { messages: { take: 1, orderBy: { createdAt: "desc" } } },
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>تیکت‌های پشتیبانی</h1>
          <p>سوال یا مشکلی دارید؟ اینجا بنویسید؛ معمولاً کمتر از یک ساعت پاسخ می‌دهیم.</p>
        </div>
      </div>

      {tickets.length ? (
        <div className="card">
          <div className="card-title">
            <h3>تیکت‌های شما</h3>
            <span className="badge">{tickets.length} تیکت</span>
          </div>
          <div className="grid" style={{ gap: 10 }}>
            {tickets.map((ticket) => {
              const status = TICKET_STATUS[ticket.status] ?? TICKET_STATUS.open;
              const last = ticket.messages[0];
              return (
                <Link className="ticket-item" key={ticket.id} href={`/dashboard/tickets/${ticket.id}`}>
                  <span className="ti">{ticket.status === "closed" ? "🔒" : "💬"}</span>
                  <span className="tm">
                    <b>{ticket.subject}</b>
                    <small>
                      {last ? `${last.fromAdmin ? "پشتیبانی: " : ""}${last.body.slice(0, 60)}` : ""}
                    </small>
                  </span>
                  <span className="oa">
                    <span className={`badge ${status.badge}`}>{status.label}</span>
                    <small className="dim" style={{ display: "block", marginTop: 4 }}>
                      {faDate(ticket.updatedAt)}
                    </small>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-title">
          <h3>ثبت تیکت جدید</h3>
        </div>
        <NewTicketForm />
      </div>

      {!tickets.length ? (
        <div className="card empty">
          <div className="empty-icon">🎫</div>
          هنوز تیکتی ثبت نکرده‌اید.
        </div>
      ) : null}
    </div>
  );
}
