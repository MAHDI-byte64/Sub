import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { faDate } from "@/lib/format";
import { TICKET_STATUS } from "@/lib/status";
import NewTicketForm from "@/components/NewTicketForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "تیکت‌ها" };

export default async function TicketsPage() {
  const user = await requireUser("/dashboard/tickets");
  const tickets = await db.ticket.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { messages: { take: 1, orderBy: { createdAt: "desc" } } },
  });

  return (
    <div>
      <div className="card-title">
        <h1 style={{ fontSize: "1.5rem" }}>تیکت‌های پشتیبانی</h1>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>ثبت تیکت جدید</h3>
        </div>
        <NewTicketForm />
      </div>

      {tickets.length ? (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>موضوع</th>
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
                      <td>
                        <span className={`badge ${status.badge}`}>{status.label}</span>
                      </td>
                      <td className="nowrap">{faDate(ticket.updatedAt, true)}</td>
                      <td>
                        <Link className="btn btn-sm" href={`/dashboard/tickets/${ticket.id}`}>
                          مشاهده
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">🎫</div>
          هنوز تیکتی ثبت نکرده‌اید.
        </div>
      )}
    </div>
  );
}
