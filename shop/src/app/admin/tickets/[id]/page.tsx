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

  return (
    <div>
      <div className="card-title">
        <h1 style={{ fontSize: "1.4rem" }}>{ticket.subject}</h1>
        <span className={`badge ${status.badge}`}>{status.label}</span>
      </div>
      <div className="card">
        <p className="ltr mono">{ticket.user.email}</p>
        <div className="chat">
          {ticket.messages.map((msg) => (
            <div className={`msg${msg.fromAdmin ? " admin" : ""}`} key={msg.id}>
              <div className="msg-meta">
                {msg.fromAdmin ? "پشتیبانی" : "کاربر"} — {faDate(msg.createdAt, true)}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{msg.body}</div>
            </div>
          ))}
        </div>
        <TicketReplyForm ticketId={ticket.id} closed={ticket.status === "closed"} />
      </div>
    </div>
  );
}
