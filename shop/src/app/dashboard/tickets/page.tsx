import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { durationLabel, faNum, relativeTime } from "@/lib/format";
import { averageResponseMs } from "@/lib/tickets";
import { TICKET_STATUS } from "@/lib/status";
import NewTicketForm from "@/components/NewTicketForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "تیکت‌ها" };

export default async function TicketsPage() {
  const user = await requireUser("/dashboard/tickets");

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
      where: { userId: user.id },
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
          <h1>پشتیبانی</h1>
          <p>سوال یا مشکلی دارید؟ اینجا بنویسید؛ کل گفتگو و سابقه‌اش همین‌جا می‌ماند.</p>
        </div>
        <span className={`badge ${open ? "badge-warn" : "badge-success"}`}>
          {open ? `${faNum(open)} در انتظار پاسخ` : "همه پاسخ داده شده"}
        </span>
      </div>

      {/* وضعیت پاسخ‌گویی */}
      <div className="sla-card">
        <span className="sla-icon">🎧</span>
        <div className="sla-main">
          <b>پشتیبانی {settings.support_hours} در دسترس است</b>
          <span>
            {avgResponse
              ? `میانگین زمان پاسخ به شما تا امروز: ${durationLabel(avgResponse)}`
              : "اولین سوالتان را بپرسید؛ معمولاً کمتر از یک ساعت پاسخ می‌دهیم."}
          </span>
        </div>
        {tickets.length ? (
          <>
            <div className="sla-stat">
              <b>{faNum(tickets.length)}</b>
              <span>گفتگو</span>
            </div>
            <div className="sla-stat">
              <b>{faNum(answered)}</b>
              <span>پاسخ داده شده</span>
            </div>
            {avgResponse ? (
              <div className="sla-stat">
                <b>{durationLabel(avgResponse)}</b>
                <span>میانگین پاسخ</span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {tickets.length ? (
        <div className="card">
          <div className="card-title">
            <h3>گفتگوهای شما</h3>
          </div>
          <div className="grid" style={{ gap: 10 }}>
            {tickets.map((ticket) => {
              const status = TICKET_STATUS[ticket.status] ?? TICKET_STATUS.open;
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
                      {last ? `${last.fromAdmin ? "پشتیبانی: " : "شما: "}${last.body}` : "—"}
                    </span>
                    <span className="tc-meta">
                      <span>💬 {faNum(ticket.messages.length)} پیام</span>
                      <span>🕒 {relativeTime(ticket.updatedAt)}</span>
                      {ticket.service ? (
                        <span>
                          {ticket.service.panel.flag} {ticket.service.plan?.title ?? "سرویس"}
                        </span>
                      ) : null}
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
          <p>هنوز گفتگویی ندارید. اولین سوالتان را همین پایین بپرسید.</p>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <h3>✏️ گفتگوی جدید</h3>
          <span className="badge badge-info">پاسخ معمولاً زیر ۱ ساعت</span>
        </div>
        <NewTicketForm
          services={services.map((s) => ({
            id: s.id,
            label: `${s.panel.flag} ${s.plan?.title ?? (s.isTrial ? "اکانت تست" : s.remark)} — ${s.panel.location}`,
          }))}
        />
      </div>
    </div>
  );
}
