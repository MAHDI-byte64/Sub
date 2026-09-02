import { db } from "@/lib/db";
import { resetTrialFlagAction, toggleUserBlockAction } from "@/app/actions/admin";
import { faDate, faNum } from "@/lib/format";
import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import Flash from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; msg?: string; type?: string }>;
}) {
  const { q, msg, type } = await searchParams;
  const [users, total] = await Promise.all([
    db.user.findMany({
      where: q ? { email: { contains: q } } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { _count: { select: { orders: true, services: true } } },
    }),
    db.user.count(),
  ]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>کاربران</h1>
          <p>حساب‌های ثبت‌شده، سفارش‌ها و وضعیت دسترسی آن‌ها.</p>
        </div>
        <div className="btn-row">
          <a className="btn btn-sm" href="/api/admin/export/users">
            ⬇ خروجی CSV
          </a>
          <span className="badge badge-info">{faNum(total)} کاربر</span>
        </div>
      </div>

      <Flash msg={msg} type={type} />

      <div className="card data-card">
        <div className="data-head">
          <h3>فهرست کاربران</h3>
          <form style={{ display: "flex", gap: 8 }}>
            <input name="q" defaultValue={q ?? ""} className="ltr" placeholder="جستجوی ایمیل…" />
            <button className="btn btn-sm" type="submit">
              جستجو
            </button>
          </form>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کاربر</th>
                <th>سفارش</th>
                <th>سرویس</th>
                <th>تست رایگان</th>
                <th>وضعیت</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="avatar avatar-sm avatar-muted">
                        {(user.name || user.email).charAt(0).toUpperCase()}
                      </span>
                      <span>
                        <Link className="cell-main ltr gold" href={`/admin/users/${user.id}`}>
                          {user.email}
                        </Link>
                        <span className="cell-sub">
                          {user.role === "admin" ? "مدیر · " : ""}
                          عضویت {faDate(user.createdAt)}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td>{faNum(user._count.orders)}</td>
                  <td>{faNum(user._count.services)}</td>
                  <td className="nowrap">{user.trialUsedAt ? faDate(user.trialUsedAt) : "—"}</td>
                  <td>
                    <span className={`badge ${user.isBlocked ? "badge-danger" : "badge-success"}`}>
                      {user.isBlocked ? "مسدود" : "فعال"}
                    </span>
                  </td>
                  <td>
                    <div className="cell-actions">
                      <Link className="btn btn-sm" href={`/admin/users/${user.id}`}>
                        پرونده
                      </Link>
                      {user.role !== "admin" ? (
                        <ActionForm
                          action={toggleUserBlockAction}
                          submitLabel={user.isBlocked ? "آزادسازی" : "مسدود"}
                          buttonClass={`btn btn-sm ${user.isBlocked ? "" : "btn-danger"}`}
                          inline
                        >
                          <input type="hidden" name="id" value={user.id} />
                        </ActionForm>
                      ) : null}
                      {user.trialUsedAt ? (
                        <ActionForm
                          action={resetTrialFlagAction}
                          submitLabel="آزادسازی تست"
                          buttonClass="btn btn-sm"
                          inline
                        >
                          <input type="hidden" name="id" value={user.id} />
                        </ActionForm>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length ? (
                <tr>
                  <td colSpan={6} className="center dim">
                    کاربری یافت نشد.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="data-foot">نمایش {faNum(users.length)} کاربر از {faNum(total)}</div>
      </div>
    </div>
  );
}
