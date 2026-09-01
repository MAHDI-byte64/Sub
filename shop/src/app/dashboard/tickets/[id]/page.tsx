import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { faDate, faNum } from "@/lib/format";
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
  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();
  const answers = ticket.messages.filter((m) => m.fromAdmin).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>گفتگوی پشتیبانی</h1>
          <p>پاسخ‌ها همین‌جا نمایش داده می‌شوند؛ نیازی به ایمیل یا تلگرام نیست.</p>
        </div>
        <Link className="btn btn-sm" href="/dashboard/tickets">
          ← همه تیکت‌ها
        </Link>
      </div>

      <div className="thread-head">
        <span className={`tc-icon ${ticket.status === "open" ? "is-open" : ""}`}>
          {ticket.status === "closed" ? "🔒" : "💬"}
        </span>
        <div className="th-main">
          <h2>{ticket.subject}</h2>
          <div className="th-meta">
            <span>🕒 ثبت: {faDate(ticket.createdAt, true)}</span>
            <span>🔄 آخرین فعالیت: {faDate(ticket.updatedAt, true)}</span>
            <span>💬 {faNum(ticket.messages.length)} پیام</span>
            <span>🎧 {faNum(answers)} پاسخ پشتیبانی</span>
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
                  <b>{msg.fromAdmin ? "پشتیبانی" : "شما"}</b>
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
          initial={initial}
        />
      </div>
    </div>
  );
}
