import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { faDate, faNum, toman } from "@/lib/format";
import { TICKET_STATUS } from "@/lib/status";
import TicketReplyForm from "@/components/TicketReplyForm";

export const dynamic = "force-dynamic";

export default async function AdminTicketDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await db.ticket.findUnique({
    where: { id },
    include: { user: true, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) notFound();

  const [services, orders, spent] = await Promise.all([
    db.service.count({ where: { userId: ticket.userId } }),
    db.order.count({ where: { userId: ticket.userId, status: "approved" } }),
    db.order.aggregate({
      where: { userId: ticket.userId, status: "approved" },
      _sum: { payable: true },
    }),
  ]);

  const status = TICKET_STATUS[ticket.status] ?? TICKET_STATUS.open;
  const initial = (ticket.user.name || ticket.user.email).trim().charAt(0).toUpperCase();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>پاسخ به تیکت</h1>
          <p className="ltr mono">{ticket.user.email}</p>
        </div>
        <Link className="btn btn-sm" href="/admin/tickets">
          ← همه تیکت‌ها
        </Link>
      </div>

      <div className="thread-head">
        <span className={`tc-icon ${ticket.status === "open" ? "is-open" : ""}`}>{initial}</span>
        <div className="th-main">
          <h2>{ticket.subject}</h2>
          <div className="th-meta">
            <span>🕒 ثبت: {faDate(ticket.createdAt, true)}</span>
            <span>💬 {faNum(ticket.messages.length)} پیام</span>
            <span>🌐 {faNum(services)} سرویس</span>
            <span>🛒 {faNum(orders)} خرید · {toman(spent._sum.payable ?? 0)}</span>
          </div>
        </div>
        <span className={`badge ${status.badge}`}>{status.label}</span>
      </div>

      <div className="card">
        <div className="chat">
          {ticket.messages.map((msg) => (
            <div className={`chat-row${msg.fromAdmin ? " is-admin" : ""}`} key={msg.id}>
              <span className={`avatar avatar-sm${msg.fromAdmin ? "" : " avatar-muted"}`}>
                {msg.fromAdmin ? "🎧" : initial}
              </span>
              <div className="bubble">
                <div className="meta">
                  <b>{msg.fromAdmin ? "پشتیبانی (شما)" : "کاربر"}</b>
                  <span>{faDate(msg.createdAt, true)}</span>
                </div>
                <div className="body">{msg.body}</div>
              </div>
            </div>
          ))}
        </div>
        <TicketReplyForm
          ticketId={ticket.id}
          closed={ticket.status === "closed"}
          initial="🎧"
          placeholder="پاسخ پشتیبانی…"
        />
      </div>
    </div>
  );
}
