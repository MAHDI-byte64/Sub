import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import Link from "next/link";
import {
  deleteServiceAction,
  migrateServiceAction,
  pruneExpiredServicesAction,
  resetServiceTrafficAction,
  rotateServiceAdminAction,
  syncAllServicesAction,
  syncServiceAction,
  toggleServiceAction,
} from "@/app/actions/admin";
import { faDate, faNum, formatBytes, remainingDays } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import Flash from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function AdminServicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    msg?: string;
    type?: string;
    q?: string;
    status?: string;
    panel?: string;
  }>;
}) {
  const isAdmin = (await requireStaff()).role === "admin";

  const { msg, type, q, status, panel } = await searchParams;
  const search = (q ?? "").trim();

  const [services, active, expired, usageAgg, panels] = await Promise.all([
    db.service.findMany({
      where: {
        ...(status && status !== "all" ? { status } : {}),
        ...(panel ? { panelId: panel } : {}),
        ...(search
          ? {
              OR: [
                { clientEmail: { contains: search } },
                { user: { email: { contains: search } } },
                { subId: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { user: true, panel: true, plan: true },
      take: 200,
    }),
    db.service.count({ where: { status: "active" } }),
    db.service.count({ where: { status: "expired" } }),
    db.service.aggregate({ _sum: { usedBytes: true } }),
    db.panel.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>سرویس‌ها</h1>
          <p>کلاینت‌های ساخته‌شده روی پنل‌ها و وضعیت مصرفشان.</p>
        </div>
        <div className="btn-row">
          <span className="badge badge-success">{faNum(active)} فعال</span>
          <span className="badge">{faNum(services.length)} کل</span>
        </div>
      </div>

      <Flash msg={msg} type={type} />

      <div className="summary-strip">
        <div className="summary-tile">
          <span>🌐 سرویس فعال</span>
          <b>{faNum(active)}</b>
        </div>
        <div className="summary-tile">
          <span>⌛ منقضی</span>
          <b>{faNum(expired)}</b>
        </div>
        <div className="summary-tile">
          <span>📦 کل سرویس‌ها</span>
          <b>{faNum(services.length)}</b>
        </div>
        <div className="summary-tile">
          <span>📊 مجموع مصرف</span>
          <b>{formatBytes(usageAgg._sum.usedBytes ?? 0, "۰")}</b>
        </div>
      </div>

      <div className="card">
        <form
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            name="q"
            defaultValue={search}
            placeholder="جستجوی ایمیل کاربر، نام کلاینت یا subId…"
            style={{ flex: 1, minWidth: 200 }}
          />
          <select
            name="status"
            defaultValue={status ?? "all"}
            style={{ width: "auto" }}
          >
            <option value="all">همه وضعیت‌ها</option>
            <option value="active">فعال</option>
            <option value="expired">منقضی</option>
            <option value="disabled">غیرفعال</option>
          </select>
          <select
            name="panel"
            defaultValue={panel ?? ""}
            style={{ width: "auto" }}
          >
            <option value="">همه سرورها</option>
            {panels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.flag} {p.location}
              </option>
            ))}
          </select>
          <button className="btn btn-sm btn-primary" type="submit">
            اعمال
          </button>
          <a className="btn btn-sm" href="/api/admin/export/services">
            ⬇ خروجی CSV
          </a>
        </form>

        <hr />

        <div className="btn-row">
          <ActionForm
            action={syncAllServicesAction}
            submitLabel="🔃 همگام‌سازی همه سرویس‌ها"
            buttonClass="btn btn-sm"
            inline
          />
          {isAdmin ? (
            <ActionForm
              action={pruneExpiredServicesAction}
              submitLabel="🧹 حذف سرویس‌های منقضی (بیش از ۷ روز)"
              buttonClass="btn btn-sm btn-danger"
              confirm="سرویس‌های منقضی‌شده از پنل و سایت حذف شوند؟"
              inline
            />
          ) : null}
        </div>
      </div>

      <div className="card data-card">
        <div className="data-head">
          <h3>فهرست سرویس‌ها</h3>
          <span className="badge">{faNum(services.length)} نتیجه</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کاربر / کلاینت</th>
                <th>سرور</th>
                <th>پلن</th>
                <th>مصرف</th>
                <th>انقضا</th>
                <th>وضعیت</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {services.map((service) => {
                const days = remainingDays(service.expiresAt);
                return (
                  <tr key={service.id}>
                    <td>
                      <Link
                        className="cell-main ltr gold"
                        href={`/admin/users/${service.userId}`}
                      >
                        {service.user.email}
                      </Link>
                      <span className="cell-sub mono">
                        {service.clientEmail}
                      </span>
                    </td>
                    <td className="nowrap">
                      {service.panel.flag} {service.panel.location}
                    </td>
                    <td className="nowrap">
                      {service.plan?.title ??
                        (service.isTrial ? "تست رایگان" : "—")}
                    </td>
                    <td className="nowrap">
                      <span className="cell-main">
                        {formatBytes(service.usedBytes, "۰")}
                      </span>
                      <span className="cell-sub">
                        {service.totalBytes > 0
                          ? `از ${formatBytes(service.totalBytes)}`
                          : "نامحدود"}
                      </span>
                    </td>
                    <td className="nowrap">
                      <span className="cell-main">
                        {faDate(service.expiresAt)}
                      </span>
                      {days !== null ? (
                        <span className="cell-sub">
                          {days > 0 ? `${faNum(days)} روز مانده` : "منقضی"}
                        </span>
                      ) : null}
                    </td>
                    <td>
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
                    </td>
                    <td>
                      <div className="cell-actions">
                        <ActionForm
                          action={syncServiceAction}
                          submitLabel="↻"
                          buttonClass="btn btn-sm"
                          inline
                        >
                          <input type="hidden" name="id" value={service.id} />
                        </ActionForm>
                        <ActionForm
                          action={toggleServiceAction}
                          submitLabel={
                            service.status === "active" ? "غیرفعال" : "فعال"
                          }
                          buttonClass="btn btn-sm"
                          inline
                        >
                          <input type="hidden" name="id" value={service.id} />
                        </ActionForm>
                        {isAdmin ? (
                          <ActionForm
                            action={resetServiceTrafficAction}
                            submitLabel="صفر"
                            buttonClass="btn btn-sm"
                            confirm="مصرف این سرویس صفر شود؟"
                            inline
                          >
                            <input type="hidden" name="id" value={service.id} />
                          </ActionForm>
                        ) : null}
                        <ActionForm
                          action={rotateServiceAdminAction}
                          submitLabel="کانفیگ تازه"
                          buttonClass="btn btn-sm"
                          confirm="کانفیگ تازه ساخته شود؟ UUID و لینک اشتراک عوض می‌شود و دستگاه‌های فعلی قطع می‌شوند."
                          inline
                        >
                          <input type="hidden" name="id" value={service.id} />
                        </ActionForm>
                        {isAdmin && panels.length > 1 ? (
                          <ActionForm
                            action={migrateServiceAction}
                            submitLabel="🚚 انتقال"
                            buttonClass="btn btn-sm"
                            className="row-form"
                            confirm="این سرویس به سرور انتخاب‌شده منتقل شود؟ حجم باقی‌مانده و انقضا حفظ می‌شود ولی لینک اشتراک کاربر عوض می‌شود."
                          >
                            <input type="hidden" name="id" value={service.id} />
                            <select
                              name="panelId"
                              defaultValue=""
                              className="select-sm"
                              aria-label="سرور مقصد"
                            >
                              <option value="">سرور مقصد…</option>
                              {panels
                                .filter((row) => row.id !== service.panelId)
                                .map((row) => (
                                  <option key={row.id} value={row.id}>
                                    {row.flag} {row.name}
                                  </option>
                                ))}
                            </select>
                          </ActionForm>
                        ) : null}
                        {isAdmin ? (
                          <ActionForm
                            action={deleteServiceAction}
                            submitLabel="حذف"
                            buttonClass="btn btn-sm btn-danger"
                            confirm="سرویس از پنل و سایت حذف شود؟"
                            inline
                          >
                            <input type="hidden" name="id" value={service.id} />
                          </ActionForm>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!services.length ? (
                <tr>
                  <td colSpan={7} className="center dim">
                    هنوز سرویسی تحویل داده نشده است.
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
