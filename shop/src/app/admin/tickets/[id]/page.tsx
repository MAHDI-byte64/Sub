import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { faDate } from "@/lib/format";
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

  const status = TICKET_STATUS[ticket.status] ?? TICKET_STATUS.open;
  const initial = (ticket.user.name || ticket.user.email).trim().charAt(0).toUpperCase();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{ticket.subject}</h1>
          <p className="ltr mono">{ticket.user.email}</p>
        </div>
        <div className="btn-row">
          <span className={`badge ${status.badge}`}>{status.label}</span>
          <Link className="btn btn-sm" href="/admin/tickets">
            بازگشت
          </Link>
        </div>
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
        <TicketReplyForm ticketId={ticket.id} closed={ticket.status === "closed"} />
      </div>
    </div>
  );
}
