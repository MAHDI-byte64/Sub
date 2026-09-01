import Link from "next/link";
import { db } from "@/lib/db";
import { faDate } from "@/lib/format";
import { TICKET_STATUS } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function AdminTicketsPage() {
  const tickets = await db.ticket.findMany({
    orderBy: { updatedAt: "desc" },
    include: { user: true, _count: { select: { messages: true } } },
    take: 200,
  });

  return (
    <div>
      <div className="card-title">
        <h1 style={{ fontSize: "1.5rem" }}>تیکت‌ها</h1>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>موضوع</th>
                <th>کاربر</th>
                <th>پیام‌ها</th>
                <th>وضعیت</th>
                <th>آخرین به‌روزرسانی</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => {
                const status = TICKET_STATUS[ticket.status] ?? TICKET_STATUS.open;
                return (
                  <tr key={ticket.id}>
                    <td>{ticket.subject}</td>
                    <td className="ltr">{ticket.user.email}</td>
                    <td>{ticket._count.messages}</td>
                    <td>
                      <span className={`badge ${status.badge}`}>{status.label}</span>
                    </td>
                    <td className="nowrap">{faDate(ticket.updatedAt, true)}</td>
                    <td>
                      <Link className="btn btn-sm" href={`/admin/tickets/${ticket.id}`}>
                        پاسخ
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!tickets.length ? (
                <tr>
                  <td colSpan={6} className="center dim">
                    تیکتی ثبت نشده است.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
