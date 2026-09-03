import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { durationLabel, fmt } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";
import { averageResponseMs } from "@/lib/tickets";
import { ticketStatus } from "@/lib/status";
import NewTicketForm from "@/components/NewTicketForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "تیکت‌ها" };

export default async function TicketsPage() {
  const user = await requireUser("/dashboard/tickets");
  const locale = await getLocale();
  const tr = translator(locale);
  const f = fmt(locale);

  const [tickets, services, settings] = await Promise.all([
    db.ticket.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        service: { include: { panel: true, plan: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    }),
    db.service.findMany({
      where: { userId: user.id, resellerId: null },
      include: { panel: true, plan: true },
      orderBy: { createdAt: "desc" },
    }),
    getSettings(),
  ]);

  const open = tickets.filter((t) => t.status === "open").length;
  const answered = tickets.filter((t) => t.status === "answered").length;

  // میانگین زمان پاسخ روی همهٔ گفتگوهای این کاربر
  const allGaps = tickets
    .map((t) => averageResponseMs(t.messages))
    .filter((v): v is number => v !== null);
  const avgResponse = allGaps.length
    ? Math.round(allGaps.reduce((a, b) => a + b, 0) / allGaps.length)
    : null;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{tr("ticket.title")}</h1>
          <p>{tr("ticket.subtitle")}</p>
        </div>
        <span className={`badge ${open ? "badge-warn" : "badge-success"}`}>
          {open ? tr("ticket.waiting", { count: f.num(open) }) : tr("ticket.allAnswered")}
        </span>
      </div>

      {/* وضعیت پاسخ‌گویی */}
      <div className="sla-card">
        <span className="sla-icon">🎧</span>
        <div className="sla-main">
          <b>{tr("ticket.slaTitle", { hours: settings.support_hours })}</b>
          <span>
            {avgResponse
              ? tr("ticket.slaAvg", { time: durationLabel(avgResponse) })
              : tr("ticket.slaFirst")}
          </span>
        </div>
        {tickets.length ? (
          <>
            <div className="sla-stat">
              <b>{f.num(tickets.length)}</b>
              <span>{tr("ticket.conversations")}</span>
            </div>
            <div className="sla-stat">
              <b>{f.num(answered)}</b>
              <span>{tr("ticket.answered")}</span>
            </div>
            {avgResponse ? (
              <div className="sla-stat">
                <b>{durationLabel(avgResponse)}</b>
                <span>{tr("ticket.avgResponse")}</span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {tickets.length ? (
        <div className="card">
          <div className="card-title">
            <h3>{tr("ticket.yours")}</h3>
          </div>
          <div className="grid" style={{ gap: 10 }}>
            {tickets.map((ticket) => {
              const status = ticketStatus(locale, ticket.status);
              const last = ticket.messages[ticket.messages.length - 1];
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
                      {last
                        ? `${last.fromAdmin ? tr("ticket.fromSupport") : tr("ticket.fromYou")}${last.body}`
                        : "—"}
                    </span>
                    <span className="tc-meta">
                      <span>
                        💬 {f.num(ticket.messages.length)} {tr("ticket.messages")}
                      </span>
                      <span>🕒 {f.relative(ticket.updatedAt)}</span>
                      {ticket.service ? (
                        <span>
                          {ticket.service.panel.flag}{" "}
                          {ticket.service.plan?.title ?? tr("ticket.service")}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="tc-side">
                    <span className={`badge ${status.badge}`}>{status.label}</span>
                    <span className="btn btn-sm">{tr("ticket.open")}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">🎫</div>
          <p>{tr("ticket.empty")}</p>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <h3>{tr("ticket.newTitle")}</h3>
          <span className="badge badge-info">{tr("ticket.newBadge")}</span>
        </div>
        <NewTicketForm
          locale={locale}
          services={services.map((s) => ({
            id: s.id,
            label: `${s.panel.flag} ${s.plan?.title ?? (s.isTrial ? tr("service.trial") : s.remark)} — ${s.panel.location}`,
          }))}
        />
      </div>
    </div>
  );
}
