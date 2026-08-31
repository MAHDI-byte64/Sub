import { db } from "@/lib/db";
import { resetTrialFlagAction, toggleUserBlockAction } from "@/app/actions/admin";
import { faDate, faNum } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import Flash from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; msg?: string; type?: string }>;
}) {
  const { q, msg, type } = await searchParams;
  const users = await db.user.findMany({
    where: q ? { email: { contains: q } } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { orders: true, services: true } } },
  });

  return (
    <div>
      <div className="card-title">
        <h1 style={{ fontSize: "1.5rem" }}>کاربران</h1>
      </div>

      <Flash msg={msg} type={type} />

      <div className="card">
        <form className="form" style={{ marginBottom: 14 }}>
          <div className="field">
            <label htmlFor="q">جستجوی ایمیل</label>
            <input id="q" name="q" defaultValue={q ?? ""} className="ltr" placeholder="example@mail.com" />
          </div>
          <button className="btn btn-sm" type="submit">
            جستجو
          </button>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ایمیل</th>
                <th>نقش</th>
                <th>سفارش</th>
                <th>سرویس</th>
                <th>تست رایگان</th>
                <th>عضویت</th>
                <th>وضعیت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="ltr">{user.email}</td>
                  <td>
                    <span className={`badge ${user.role === "admin" ? "badge-info" : ""}`}>
                      {user.role === "admin" ? "مدیر" : "کاربر"}
                    </span>
                  </td>
                  <td>{faNum(user._count.orders)}</td>
                  <td>{faNum(user._count.services)}</td>
                  <td className="nowrap">{user.trialUsedAt ? faDate(user.trialUsedAt) : "—"}</td>
                  <td className="nowrap">{faDate(user.createdAt)}</td>
                  <td>
                    <span className={`badge ${user.isBlocked ? "badge-danger" : "badge-success"}`}>
                      {user.isBlocked ? "مسدود" : "فعال"}
                    </span>
                  </td>
                  <td>
                    <div className="btn-row">
                      {user.role !== "admin" ? (
                        <ActionForm
                          action={toggleUserBlockAction}
                          submitLabel={user.isBlocked ? "آزادسازی" : "مسدود کردن"}
                          buttonClass={`btn btn-sm ${user.isBlocked ? "" : "btn-danger"}`}
                          inline
                        >
                          <input type="hidden" name="id" value={user.id} />
                        </ActionForm>
                      ) : null}
                      {user.trialUsedAt ? (
                        <ActionForm action={resetTrialFlagAction} submitLabel="آزادسازی تست" buttonClass="btn btn-sm" inline>
                          <input type="hidden" name="id" value={user.id} />
                        </ActionForm>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
