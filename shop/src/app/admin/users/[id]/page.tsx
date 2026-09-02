import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { describeDevice } from "@/lib/auth";
import { faDate, faNum, formatBytes, relativeTime, toman } from "@/lib/format";
import { ORDER_STATUS, TICKET_STATUS } from "@/lib/status";
import {
  adjustWalletAction,
  createServiceForUserAction,
  extendServiceAction,
  resetServiceTrafficAction,
  rotateServiceAdminAction,
  resetTrialFlagAction,
  toggleUserBlockAction,
  toggleServiceAction,
} from "@/app/actions/admin";
import ActionForm from "@/components/ActionForm";
import Flash from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function AdminUserDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; type?: string }>;
}) {
  const { id } = await params;
  const { msg, type } = await searchParams;

  const user = await db.user.findUnique({
    where: { id },
    include: {
      services: { include: { panel: true, plan: true }, orderBy: { createdAt: "desc" } },
      orders: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 20 },
      tickets: { orderBy: { updatedAt: "desc" }, take: 10 },
      sessions: { where: { expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!user) notFound();

  const [plans, panels, spent, walletTxs] = await Promise.all([
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { panels: true } }),
    db.panel.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.order.aggregate({
      where: { userId: user.id, status: "approved" },
      _sum: { payable: true },
      _count: { _all: true },
    }),
    db.walletTx.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  const initial = (user.name || user.email).charAt(0).toUpperCase();
  const activeServices = user.services.filter((s) => s.status === "active").length;
  const totalUsed = user.services.reduce((sum, s) => sum + s.usedBytes, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>پروندهٔ مشتری</h1>
          <p className="ltr mono">{user.email}</p>
        </div>
        <div className="btn-row">
          {user.isBlocked ? <span className="badge badge-danger">مسدود</span> : null}
          {user.role === "admin" ? <span className="badge badge-info">مدیر</span> : null}
          <Link className="btn btn-sm" href="/admin/users">
            ← همه کاربران
          </Link>
        </div>
      </div>

      <Flash msg={msg} type={type} />

      <div className="card">
        <div className="svc-head" style={{ marginBottom: 0 }}>
          <div className="svc-title">
            <span className="avatar">{initial}</span>
            <div>
              <h3>{user.name || user.email.split("@")[0]}</h3>
              <small>عضو از {faDate(user.createdAt)}</small>
            </div>
          </div>
          <div className="btn-row">
            {user.role !== "admin" ? (
              <ActionForm
                action={toggleUserBlockAction}
                submitLabel={user.isBlocked ? "آزادسازی حساب" : "مسدود کردن حساب"}
                buttonClass={`btn btn-sm ${user.isBlocked ? "" : "btn-danger"}`}
                inline
              >
                <input type="hidden" name="id" value={user.id} />
              </ActionForm>
            ) : null}
            {user.trialUsedAt ? (
              <ActionForm action={resetTrialFlagAction} submitLabel="آزادسازی تست رایگان" buttonClass="btn btn-sm" inline>
                <input type="hidden" name="id" value={user.id} />
              </ActionForm>
            ) : null}
          </div>
        </div>
      </div>

      <div className="summary-strip">
        <div className="summary-tile">
          <span>🌐 سرویس فعال</span>
          <b>{faNum(activeServices)}</b>
        </div>
        <div className="summary-tile">
          <span>🛒 خرید موفق</span>
          <b>{faNum(spent._count._all)}</b>
        </div>
        <div className="summary-tile">
          <span>💰 مجموع پرداختی</span>
          <b>{toman(spent._sum.payable ?? 0, false)}</b>
        </div>
        <div className="summary-tile">
          <span>📊 مجموع مصرف</span>
          <b>{formatBytes(totalUsed, "۰")}</b>
        </div>
        <div className="summary-tile">
          <span>💰 موجودی کیف پول</span>
          <b>{toman(user.balance, false)}</b>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        {/* سرویس‌ها */}
        <div className="card">
          <div className="card-title">
            <h3>سرویس‌ها</h3>
            <span className="badge">{faNum(user.services.length)}</span>
          </div>
          {user.services.length ? (
            user.services.map((service) => {
              const percent =
                service.totalBytes > 0
                  ? Math.min(100, Math.round((service.usedBytes / service.totalBytes) * 100))
                  : 0;
              return (
                <div className="cc-service" key={service.id}>
                  <div className="cc-service-head">
                    <b>
                      {service.panel.flag} {service.plan?.title ?? (service.isTrial ? "تست رایگان" : "سرویس")}
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
                      {service.status === "active" ? "فعال" : service.status === "expired" ? "منقضی" : "غیرفعال"}
                    </span>
                  </div>
                  {service.totalBytes > 0 ? (
                    <>
                      <div className={`progress ${percent >= 90 ? "danger" : percent >= 70 ? "warn" : ""}`}>
                        <span style={{ width: `${percent}%` }} />
                      </div>
                      <small>
                        {formatBytes(service.usedBytes, "۰")} از {formatBytes(service.totalBytes)} · انقضا{" "}
                        {faDate(service.expiresAt)}
                      </small>
                    </>
                  ) : (
                    <small>حجم نامحدود · انقضا {faDate(service.expiresAt)}</small>
                  )}
                  <small className="mono">{service.clientEmail}</small>

                  <div className="btn-row" style={{ marginTop: 10 }}>
                    <ActionForm
                      action={extendServiceAction}
                      submitLabel="افزودن"
                      buttonClass="btn btn-sm btn-primary"
                      className="form"
                    >
                      <input type="hidden" name="id" value={service.id} />
                      <div className="grid grid-2" style={{ gap: 8 }}>
                        <input name="gb" type="number" min={0} placeholder="حجم (گیگ)" />
                        <input name="days" type="number" min={0} placeholder="روز" />
                      </div>
                    </ActionForm>
                    <ActionForm
                      action={resetServiceTrafficAction}
                      submitLabel="صفر کردن مصرف"
                      buttonClass="btn btn-sm"
                      confirm="مصرف این سرویس صفر شود؟"
                      inline
                    >
                      <input type="hidden" name="id" value={service.id} />
                    </ActionForm>
                    <ActionForm
                      action={toggleServiceAction}
                      submitLabel={service.status === "active" ? "غیرفعال" : "فعال"}
                      buttonClass="btn btn-sm"
                      inline
                    >
                      <input type="hidden" name="id" value={service.id} />
                    </ActionForm>
                    <ActionForm
                      action={rotateServiceAdminAction}
                      submitLabel="بازتولید کانفیگ"
                      buttonClass="btn btn-sm"
                      confirm="کانفیگ تازه ساخته شود؟ UUID و لینک اشتراک عوض می‌شود و دستگاه‌های فعلی قطع می‌شوند."
                      inline
                    >
                      <input type="hidden" name="id" value={service.id} />
                    </ActionForm>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="dim">این کاربر سرویسی ندارد.</p>
          )}

          <hr />
          <div className="card-title">
            <h3>ساخت سرویس دستی</h3>
          </div>
          <p className="field-hint">
            برای هدیه، جبران خسارت یا فروش آفلاین؛ سرویس بدون نیاز به سفارش ساخته و روی پنل تحویل می‌شود.
          </p>
          <ActionForm action={createServiceForUserAction} submitLabel="ساخت سرویس">
            <input type="hidden" name="userId" value={user.id} />
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="planId">پلن</label>
                <select id="planId" name="planId" required>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.title}
                      {plan.panels.length ? ` (${plan.panels.map((p) => p.location).join("، ")})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="panelId">سرور</label>
                <select id="panelId" name="panelId" defaultValue="">
                  <option value="">انتخاب خودکار</option>
                  {panels.map((panel) => (
                    <option key={panel.id} value={panel.id}>
                      {panel.flag} {panel.location}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="note">یادداشت (در گزارش ثبت می‌شود)</label>
              <input id="note" name="note" placeholder="مثلاً جبران قطعی سرور" />
            </div>
          </ActionForm>
        </div>

        {/* سفارش‌ها، تیکت‌ها و دستگاه‌ها */}
        <div>
          <div className="card">
            <div className="card-title">
              <h3>سفارش‌ها</h3>
            </div>
            {user.orders.length ? (
              <div className="table-wrap">
                <table>
                  <tbody>
                    {user.orders.map((order) => {
                      const status = ORDER_STATUS[order.status] ?? ORDER_STATUS.awaiting_receipt;
                      return (
                        <tr key={order.id}>
                          <td className="mono nowrap">{order.code}</td>
                          <td>{order.plan?.title ?? "شارژ کیف پول"}</td>
                          <td className="nowrap">{toman(order.payable)}</td>
                          <td>
                            <span className={`badge ${status.badge}`}>{status.label}</span>
                          </td>
                          <td className="nowrap">{relativeTime(order.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="dim">سفارشی ثبت نکرده است.</p>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              <h3>💰 کیف پول</h3>
              <span className="badge badge-info">{toman(user.balance)}</span>
            </div>
            <ActionForm action={adjustWalletAction} submitLabel="اعمال" buttonClass="btn btn-sm btn-primary">
              <input type="hidden" name="userId" value={user.id} />
              <div className="grid grid-2">
                <div className="field">
                  <label htmlFor="wallet-amount">مبلغ (منفی = کسر)</label>
                  <input id="wallet-amount" name="amount" type="number" step={10000} placeholder="مثلاً 100000" />
                </div>
                <div className="field">
                  <label htmlFor="wallet-note">علت</label>
                  <input id="wallet-note" name="note" placeholder="مثلاً هدیه تولد" />
                </div>
              </div>
            </ActionForm>
            {walletTxs.length ? (
              <div className="svc-meta" style={{ marginTop: 12 }}>
                {walletTxs.map((tx) => (
                  <div className="meta-row" key={tx.id}>
                    <span>{tx.note ?? tx.kind}</span>
                    <b style={{ color: tx.amount > 0 ? "var(--green)" : "var(--red)" }}>
                      {tx.amount > 0 ? "+" : "−"} {toman(Math.abs(tx.amount))}
                    </b>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="card">
            <div className="card-title">
              <h3>تیکت‌ها</h3>
            </div>
            {user.tickets.length ? (
              <div className="grid" style={{ gap: 8 }}>
                {user.tickets.map((ticket) => {
                  const status = TICKET_STATUS[ticket.status] ?? TICKET_STATUS.open;
                  return (
                    <Link className="meta-row" key={ticket.id} href={`/admin/tickets/${ticket.id}`}>
                      <span>💬 {ticket.subject}</span>
                      <b>
                        <span className={`badge ${status.badge}`}>{status.label}</span>
                      </b>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="dim">تیکتی ثبت نکرده است.</p>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              <h3>دستگاه‌های واردشده</h3>
              <span className="badge">{faNum(user.sessions.length)}</span>
            </div>
            {user.sessions.length ? (
              <div className="svc-meta">
                {user.sessions.map((session) => {
                  const device = describeDevice(session.userAgent);
                  return (
                    <div className="meta-row" key={session.id}>
                      <span>
                        {device.icon} {device.name}
                      </span>
                      <b className="dim" style={{ fontWeight: 500 }}>
                        {relativeTime(session.createdAt)}
                      </b>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="dim">نشست فعالی ندارد.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
