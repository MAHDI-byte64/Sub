import { db } from "@/lib/db";
import { deleteServiceAction, syncServiceAction, toggleServiceAction } from "@/app/actions/admin";
import { faDate, faNum, formatBytes, remainingDays } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import Flash from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function AdminServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; type?: string }>;
}) {
  const { msg, type } = await searchParams;
  const [services, active] = await Promise.all([
    db.service.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: true, panel: true, plan: true },
      take: 200,
    }),
    db.service.count({ where: { status: "active" } }),
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

      <div className="card data-card">
        <div className="data-head">
          <h3>فهرست سرویس‌ها</h3>
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
                      <span className="cell-main ltr">{service.user.email}</span>
                      <span className="cell-sub mono">{service.clientEmail}</span>
                    </td>
                    <td className="nowrap">
                      {service.panel.flag} {service.panel.location}
                    </td>
                    <td className="nowrap">
                      {service.plan?.title ?? (service.isTrial ? "تست رایگان" : "—")}
                    </td>
                    <td className="nowrap">
                      <span className="cell-main">{formatBytes(service.usedBytes, "۰")}</span>
                      <span className="cell-sub">
                        {service.totalBytes > 0 ? `از ${formatBytes(service.totalBytes)}` : "نامحدود"}
                      </span>
                    </td>
                    <td className="nowrap">
                      <span className="cell-main">{faDate(service.expiresAt)}</span>
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
                        <ActionForm action={syncServiceAction} submitLabel="↻" buttonClass="btn btn-sm" inline>
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
                          action={deleteServiceAction}
                          submitLabel="حذف"
                          buttonClass="btn btn-sm btn-danger"
                          confirm="سرویس از پنل و سایت حذف شود؟"
                          inline
                        >
                          <input type="hidden" name="id" value={service.id} />
                        </ActionForm>
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
