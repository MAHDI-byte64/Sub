import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { durationLabel, fmt } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";
import { averageResponseMs, awaitingReply, groupByDay } from "@/lib/tickets";
import { ticketStatus } from "@/lib/status";
import TicketReplyForm from "@/components/TicketReplyForm";
import TicketAttachment from "@/components/TicketAttachment";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/tickets/${id}`);
  const locale = await getLocale();
  const tr = translator(locale);
  const f = fmt(locale);

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

  const status = ticketStatus(locale, ticket.status);
  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();
  const avg = averageResponseMs(ticket.messages);
  const waiting = awaitingReply(ticket.messages) && ticket.status !== "closed";
  const groups = groupByDay(ticket.messages);
  const service = ticket.service;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{tr("ticket.threadTitle")}</h1>
          <p>{ticket.subject}</p>
        </div>
        <div className="btn-row">
          <span className={`badge ${status.badge}`}>{status.label}</span>
          <Link className="btn btn-sm" href="/dashboard/tickets">
            {tr("ticket.allThreads")}
          </Link>
        </div>
      </div>

      {waiting ? (
        <div className="sla-card">
          <span className="sla-icon">⏳</span>
          <div className="sla-main">
            <b>{tr("ticket.queued")}</b>
            <span>
              {tr("ticket.supportActive", { hours: settings.support_hours })}
              {avg ? tr("ticket.avgInThread", { time: durationLabel(avg) }) : ""}
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
                <span>{tr("ticket.started", { time: f.relative(ticket.createdAt) })}</span>
                <span>
                  💬 {f.num(ticket.messages.length)} {tr("ticket.messages")}
                </span>
                {avg ? <span>{tr("ticket.avgReply", { time: durationLabel(avg) })}</span> : null}
              </div>
            </div>
          </div>

          <div className="chat">
            {groups.map((group) => (
              <div key={group.day.toISOString()}>
                <div className="chat-day">{f.date(group.day)}</div>
                {group.items.map((msg) => (
                  <div className={`chat-row${msg.fromAdmin ? " is-admin" : ""}`} key={msg.id}>
                    <span className={`avatar avatar-sm${msg.fromAdmin ? "" : " avatar-muted"}`}>
                      {msg.fromAdmin ? "🎧" : initial}
                    </span>
                    <div className="bubble">
                      <div className="meta">
                        <b>{msg.fromAdmin ? tr("ticket.support") : tr("ticket.you")}</b>
                        <span>{f.relative(msg.createdAt)}</span>
                      </div>
                      <div className="body">{msg.body}</div>
                      {msg.attachment ? (
                        <TicketAttachment
                          file={msg.attachment}
                          name={msg.attachmentName}
                          label={tr("ticket.attachLabel")}
                          openLabel={tr("ticket.attachOpen")}
                        />
                      ) : null}
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
            locale={locale}
            hint={tr("ticket.replyHint", { hours: settings.support_hours })}
          />
        </div>

        {service ? (
          <div className="card customer-card">
            <div className="card-title">
              <h3>{tr("ticket.relatedService")}</h3>
            </div>
            <div className="cc-service">
              <div className="cc-service-head">
                <b>
                  {service.panel.flag} {service.plan?.title ?? tr("ticket.service")}
                </b>
                <span
                  className={`badge ${service.status === "active" ? "badge-success" : "badge-warn"}`}
                >
                  {service.status === "active" ? tr("common.active") : tr("common.disabled")}
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
                    {tr("ticket.remainingOf", {
                      left: f.bytes(Math.max(0, service.totalBytes - service.usedBytes), f.num(0)),
                      total: f.bytes(service.totalBytes),
                    })}
                  </small>
                </>
              ) : (
                <small>{tr("common.unlimitedVolume")}</small>
              )}
              <small>{tr("ticket.expiry", { date: f.date(service.expiresAt) })}</small>
            </div>
            <div className="btn-row">
              <Link className="btn btn-sm btn-primary btn-block" href={`/dashboard/services/${service.id}`}>
                {tr("ticket.viewService")}
              </Link>
              <Link className="btn btn-sm btn-block" href={`/plans?renew=${service.id}`}>
                {tr("card.renewLong")}
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
