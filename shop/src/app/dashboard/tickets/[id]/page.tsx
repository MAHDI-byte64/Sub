import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { durationLabel, faDate, faNum, formatBytes, relativeTime } from "@/lib/format";
import { averageResponseMs, awaitingReply, groupByDay } from "@/lib/tickets";
import { TICKET_STATUS } from "@/lib/status";
import TicketReplyForm from "@/components/TicketReplyForm";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/tickets/${id}`);

  const [ticket, settings] = await Promise.all([
    db.ticket.findFirst({
      where: { id, userId: user.id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        service: { include: { panel: true, plan: true } },
      },
    }),
    getSettings(),
  ]);
  if (!ticket) notFound();

  const status = TICKET_STATUS[ticket.status] ?? TICKET_STATUS.open;
  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();
  const avg = averageResponseMs(ticket.messages);
  const waiting = awaitingReply(ticket.messages) && ticket.status !== "closed";
  const groups = groupByDay(ticket.messages);
  const service = ticket.service;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>گفتگوی پشتیبانی</h1>
          <p>{ticket.subject}</p>
        </div>
        <div className="btn-row">
          <span className={`badge ${status.badge}`}>{status.label}</span>
          <Link className="btn btn-sm" href="/dashboard/tickets">
            ← همه گفتگوها
          </Link>
        </div>
      </div>

      {waiting ? (
        <div className="sla-card">
          <span className="sla-icon">⏳</span>
          <div className="sla-main">
            <b>پیام شما دریافت شد و در نوبت پاسخ است</b>
            <span>
              پشتیبانی {settings.support_hours} فعال است
              {avg ? ` · میانگین زمان پاسخ در این گفتگو: ${durationLabel(avg)}` : ""}
            </span>
          </div>
        </div>
      ) : null}

      <div className={service ? "thread-layout" : ""}>
        <div className="card">
          <div className="thread-head" style={{ marginBottom: 18 }}>
            <span className={`tc-icon ${ticket.status === "open" ? "is-open" : ""}`}>
              {ticket.status === "closed" ? "🔒" : "💬"}
            </span>
            <div className="th-main">
              <h2>{ticket.subject}</h2>
              <div className="th-meta">
                <span>🕒 شروع {relativeTime(ticket.createdAt)}</span>
                <span>💬 {faNum(ticket.messages.length)} پیام</span>
                {avg ? <span>⚡ میانگین پاسخ {durationLabel(avg)}</span> : null}
              </div>
            </div>
          </div>

          <div className="chat">
            {groups.map((group) => (
              <div key={group.day.toISOString()}>
                <div className="chat-day">{faDate(group.day)}</div>
                {group.items.map((msg) => (
                  <div className={`chat-row${msg.fromAdmin ? " is-admin" : ""}`} key={msg.id}>
                    <span className={`avatar avatar-sm${msg.fromAdmin ? "" : " avatar-muted"}`}>
                      {msg.fromAdmin ? "🎧" : initial}
                    </span>
                    <div className="bubble">
                      <div className="meta">
                        <b>{msg.fromAdmin ? "پشتیبانی" : "شما"}</b>
                        <span>{relativeTime(msg.createdAt)}</span>
                      </div>
                      <div className="body">{msg.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <TicketReplyForm
            ticketId={ticket.id}
            closed={ticket.status === "closed"}
            initial={initial}
            hint={`پشتیبانی ${settings.support_hours} پاسخ می‌دهد.`}
          />
        </div>

        {service ? (
          <div className="card customer-card">
            <div className="card-title">
              <h3>سرویس مرتبط</h3>
            </div>
            <div className="cc-service">
              <div className="cc-service-head">
                <b>
                  {service.panel.flag} {service.plan?.title ?? "سرویس"}
                </b>
                <span
                  className={`badge ${service.status === "active" ? "badge-success" : "badge-warn"}`}
                >
                  {service.status === "active" ? "فعال" : "غیرفعال"}
                </span>
              </div>
              {service.totalBytes > 0 ? (
                <>
                  <div className="progress">
                    <span
                      style={{
                        width: `${Math.min(100, Math.round((service.usedBytes / service.totalBytes) * 100))}%`,
                      }}
                    />
                  </div>
                  <small>
                    {formatBytes(Math.max(0, service.totalBytes - service.usedBytes), "۰")} باقی‌مانده از{" "}
                    {formatBytes(service.totalBytes)}
                  </small>
                </>
              ) : (
                <small>حجم نامحدود</small>
              )}
              <small>انقضا: {faDate(service.expiresAt)}</small>
            </div>
            <div className="btn-row">
              <Link className="btn btn-sm btn-primary btn-block" href={`/dashboard/services/${service.id}`}>
                مشاهده سرویس و کانفیگ
              </Link>
              <Link className="btn btn-sm btn-block" href={`/plans?renew=${service.id}`}>
                تمدید سرویس
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
