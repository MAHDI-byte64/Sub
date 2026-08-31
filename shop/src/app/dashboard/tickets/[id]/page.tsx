import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { faDate } from "@/lib/format";
import { TICKET_STATUS } from "@/lib/status";
import TicketReplyForm from "@/components/TicketReplyForm";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/tickets/${id}`);

  const ticket = await db.ticket.findFirst({
    where: { id, userId: user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
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
        <div className="chat">
          {ticket.messages.map((msg) => (
            <div className={`msg${msg.fromAdmin ? " admin" : ""}`} key={msg.id}>
              <div className="msg-meta">
                {msg.fromAdmin ? "پشتیبانی" : "شما"} — {faDate(msg.createdAt, true)}
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
