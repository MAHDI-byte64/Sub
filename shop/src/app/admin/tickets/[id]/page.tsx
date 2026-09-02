import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { durationLabel, faDate, faNum, formatBytes, relativeTime, toman } from "@/lib/format";
import { averageResponseMs, awaitingReply, groupByDay } from "@/lib/tickets";
import { TICKET_STATUS } from "@/lib/status";
import TicketReplyForm from "@/components/TicketReplyForm";

export const dynamic = "force-dynamic";

export default async function AdminTicketDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ticket = await db.ticket.findUnique({
    where: { id },
    include: {
      user: true,
      messages: { orderBy: { createdAt: "asc" } },
      service: { include: { panel: true, plan: true } },
    },
  });
  if (!ticket) notFound();

  const [services, orderStats, ticketCount, settings] = await Promise.all([
    db.service.findMany({
      where: { userId: ticket.userId },
      include: { panel: true, plan: true },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    db.order.aggregate({
      where: { userId: ticket.userId, status: "approved" },
      _sum: { payable: true },
      _count: { _all: true },
    }),
    db.ticket.count({ where: { userId: ticket.userId } }),
    getSettings(),
  ]);

  const status = TICKET_STATUS[ticket.status] ?? TICKET_STATUS.open;
  const initial = (ticket.user.name || ticket.user.email).trim().charAt(0).toUpperCase();
  const avg = averageResponseMs(ticket.messages);
  const waiting = awaitingReply(ticket.messages) && ticket.status !== "closed";
  const groups = groupByDay(ticket.messages);
  const canned = (settings.canned_replies || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

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
            ← همه تیکت‌ها
          </Link>
        </div>
      </div>

      {waiting ? (
        <div className="alert alert-warn">
          ⏳ آخرین پیام از سمت کاربر است و منتظر پاسخ شماست
          {avg ? ` · میانگین پاسخ شما در این گفتگو: ${durationLabel(avg)}` : ""}.
        </div>
      ) : null}

      <div className="thread-layout">
        <div className="card">
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
                        <b>{msg.fromAdmin ? "پشتیبانی (شما)" : ticket.user.email.split("@")[0]}</b>
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
            initial="🎧"
            placeholder="پاسخ پشتیبانی…"
            cannedReplies={canned}
            hint="یک پاسخ آماده را بزنید یا خودتان بنویسید. متن‌ها در تنظیمات قابل ویرایش‌اند."
          />
        </div>

        {/* پروندهٔ مشتری */}
        <div className="card customer-card">
          <div className="cc-head">
            <span className="avatar">{initial}</span>
            <div style={{ minWidth: 0 }}>
              <b>{ticket.user.name || ticket.user.email.split("@")[0]}</b>
              <small className="ltr">{ticket.user.email}</small>
            </div>
          </div>

          <div className="svc-meta" style={{ marginBottom: 16 }}>
            <div className="meta-row">
              <span>📅 عضویت</span>
              <b>{faDate(ticket.user.createdAt)}</b>
            </div>
            <div className="meta-row">
              <span>🛒 خرید موفق</span>
              <b>{faNum(orderStats._count._all)}</b>
            </div>
            <div className="meta-row">
              <span>💰 مجموع پرداختی</span>
              <b className="gold">{toman(orderStats._sum.payable ?? 0)}</b>
            </div>
            <div className="meta-row">
              <span>🎫 تیکت‌ها</span>
              <b>{faNum(ticketCount)}</b>
            </div>
            {ticket.user.isBlocked ? (
              <div className="meta-row is-low">
                <span>⛔ وضعیت</span>
                <b>مسدود</b>
              </div>
            ) : null}
          </div>

          <div className="card-title">
            <h3>سرویس‌های مشتری</h3>
            {ticket.service ? <span className="badge badge-info">تیکت مرتبط</span> : null}
          </div>

          {services.length ? (
            services.map((service) => {
              const linked = ticket.serviceId === service.id;
              const percent =
                service.totalBytes > 0
                  ? Math.min(100, Math.round((service.usedBytes / service.totalBytes) * 100))
                  : 0;
              return (
                <div
                  className="cc-service"
                  key={service.id}
                  style={linked ? { borderColor: "rgba(244,183,64,0.45)" } : undefined}
                >
                  <div className="cc-service-head">
                    <b>
                      {service.panel.flag} {service.plan?.title ?? (service.isTrial ? "تست" : "سرویس")}
                    </b>
                    <span
                      className={`badge ${
                        service.status === "active"
                          ? "badge-success"
                          : service.status === "expired"
                            ? "badge-danger"
                            : "badge-warn"
                      }`}
                    >
                      {service.status === "active"
                        ? "فعال"
                        : service.status === "expired"
                          ? "منقضی"
                          : "غیرفعال"}
                    </span>
                  </div>
                  {service.totalBytes > 0 ? (
                    <>
                      <div className={`progress ${percent >= 90 ? "danger" : percent >= 70 ? "warn" : ""}`}>
                        <span style={{ width: `${percent}%` }} />
                      </div>
                      <small>
                        {formatBytes(service.usedBytes, "۰")} از {formatBytes(service.totalBytes)} مصرف شده
                      </small>
                    </>
                  ) : (
                    <small>حجم نامحدود</small>
                  )}
                  <small className="mono">{service.clientEmail}</small>
                  <small>انقضا: {faDate(service.expiresAt)}</small>
                </div>
              );
            })
          ) : (
            <p className="dim">این کاربر هنوز سرویسی ندارد.</p>
          )}

          <Link className="btn btn-sm btn-block" href={`/admin/services`}>
            مدیریت سرویس‌های این کاربر
          </Link>
        </div>
      </div>
    </div>
  );
}
