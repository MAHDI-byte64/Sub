import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { faDate, faNum, toman } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [revenue, approvedCount, pending, users, activeServices, panels, plans, settings, recent, openTickets] =
    await Promise.all([
      db.order.aggregate({ where: { status: "approved" }, _sum: { payable: true } }),
      db.order.count({ where: { status: "approved" } }),
      db.order.count({ where: { status: "pending_review" } }),
      db.user.count(),
      db.service.count({ where: { status: "active" } }),
      db.panel.count({ where: { isActive: true } }),
      db.plan.count({ where: { isActive: true } }),
      getSettings(),
      db.order.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: { user: true, plan: true },
      }),
      db.ticket.count({ where: { status: "open" } }),
    ]);

  const todo = [
    panels === 0 ? { text: "هنوز هیچ سرور 3x-ui اضافه نکرده‌اید.", href: "/admin/panels" } : null,
    plans === 0 ? { text: "هیچ پلن فعالی وجود ندارد.", href: "/admin/plans" } : null,
    settings.card_number.includes("0000")
      ? { text: "شماره کارت پیش‌فرض را با شماره واقعی جایگزین کنید.", href: "/admin/settings" }
      : null,
    !settings.telegram_bot_token
      ? { text: "برای اطلاع‌رسانی سفارش‌ها، توکن ربات تلگرام را وارد کنید.", href: "/admin/settings" }
      : null,
  ].filter(Boolean) as { text: string; href: string }[];

  return (
    <div>
      <div className="card-title">
        <h1 style={{ fontSize: "1.5rem" }}>داشبورد مدیریت</h1>
        <Link className="btn btn-sm" href="/">
          مشاهده سایت
        </Link>
      </div>

      <div className="grid grid-4">
        <div className="stat">
          <b>{toman(revenue._sum.payable ?? 0, false)}</b>
          <span>درآمد تأییدشده (تومان)</span>
        </div>
        <div className="stat">
          <b>{faNum(approvedCount)}</b>
          <span>سفارش موفق</span>
        </div>
        <div className="stat">
          <b>{faNum(pending)}</b>
          <span>در انتظار بررسی</span>
        </div>
        <div className="stat">
          <b>{faNum(activeServices)}</b>
          <span>سرویس فعال</span>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginTop: 16 }}>
        <div className="stat">
          <b>{faNum(users)}</b>
          <span>کاربر</span>
        </div>
        <div className="stat">
          <b>{faNum(panels)}</b>
          <span>سرور فعال</span>
        </div>
        <div className="stat">
          <b>{faNum(plans)}</b>
          <span>پلن فعال</span>
        </div>
        <div className="stat">
          <b>{faNum(openTickets)}</b>
          <span>تیکت باز</span>
        </div>
      </div>

      {todo.length ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            <h3>کارهای باقی‌مانده برای راه‌اندازی</h3>
          </div>
          <ul>
            {todo.map((item) => (
              <li key={item.text}>
                <Link href={item.href}>{item.text}</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          <h3>آخرین سفارش‌ها</h3>
          <Link className="btn btn-sm" href="/admin/orders">
            همه سفارش‌ها
          </Link>
        </div>
        {recent.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>کد</th>
                  <th>کاربر</th>
                  <th>پلن</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((order) => {
                  const status = ORDER_STATUS[order.status] ?? ORDER_STATUS.awaiting_receipt;
                  return (
                    <tr key={order.id}>
                      <td className="mono">{order.code}</td>
                      <td className="ltr">{order.user.email}</td>
                      <td>{order.plan.title}</td>
                      <td className="nowrap">{toman(order.payable)}</td>
                      <td>
                        <span className={`badge ${status.badge}`}>{status.label}</span>
                      </td>
                      <td className="nowrap">{faDate(order.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dim">هنوز سفارشی ثبت نشده است.</p>
        )}
      </div>
    </div>
  );
}
