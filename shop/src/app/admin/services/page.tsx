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
  const services = await db.service.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: true, panel: true, plan: true },
    take: 200,
  });

  return (
    <div>
      <div className="card-title">
        <h1 style={{ fontSize: "1.5rem" }}>سرویس‌ها</h1>
        <span className="badge">{faNum(services.length)} سرویس</span>
      </div>

      <Flash msg={msg} type={type} />

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کاربر</th>
                <th>سرور</th>
                <th>پلن</th>
                <th>مصرف</th>
                <th>انقضا</th>
                <th>وضعیت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => {
                const days = remainingDays(service.expiresAt);
                return (
                  <tr key={service.id}>
                    <td className="ltr">{service.user.email}</td>
                    <td className="nowrap">
                      {service.panel.flag} {service.panel.location}
                    </td>
                    <td className="nowrap">
                      {service.plan?.title ?? (service.isTrial ? "تست رایگان" : "—")}
                      <div className="mono" style={{ fontSize: 11 }}>{service.clientEmail}</div>
                    </td>
                    <td className="nowrap">
                      {formatBytes(service.usedBytes, "۰")}
                      {service.totalBytes > 0 ? ` از ${formatBytes(service.totalBytes)}` : " (نامحدود)"}
                    </td>
                    <td className="nowrap">
                      {faDate(service.expiresAt)}
                      {days !== null ? <div style={{ fontSize: 11 }} className="dim">{days > 0 ? `${faNum(days)} روز مانده` : "منقضی"}</div> : null}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          service.status === "active" ? "badge-success" : service.status === "expired" ? "badge-danger" : "badge-warn"
                        }`}
                      >
                        {service.status === "active" ? "فعال" : service.status === "expired" ? "منقضی" : "غیرفعال"}
                      </span>
                    </td>
                    <td>
                      <div className="btn-row">
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
