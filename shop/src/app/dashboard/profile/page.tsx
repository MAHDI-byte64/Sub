import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { faDate, faNum } from "@/lib/format";
import ChangePasswordForm from "@/components/ChangePasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "پروفایل" };

export default async function ProfilePage() {
  const user = await requireUser("/dashboard/profile");
  const [row, orders, services] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id } }),
    db.order.count({ where: { userId: user.id, status: "approved" } }),
    db.service.count({ where: { userId: user.id } }),
  ]);

  return (
    <div>
      <div className="card-title">
        <h1 style={{ fontSize: "1.5rem" }}>پروفایل</h1>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">
            <h3>اطلاعات حساب</h3>
          </div>
          <table>
            <tbody>
              <tr>
                <th>ایمیل</th>
                <td className="ltr mono">{row.email}</td>
              </tr>
              <tr>
                <th>نام</th>
                <td>{row.name || "—"}</td>
              </tr>
              <tr>
                <th>تاریخ عضویت</th>
                <td>{faDate(row.createdAt)}</td>
              </tr>
              <tr>
                <th>خریدهای موفق</th>
                <td>{faNum(orders)}</td>
              </tr>
              <tr>
                <th>سرویس‌ها</th>
                <td>{faNum(services)}</td>
              </tr>
              <tr>
                <th>اکانت تست</th>
                <td>{row.trialUsedAt ? `دریافت شده در ${faDate(row.trialUsedAt)}` : "استفاده نشده"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">
            <h3>تغییر رمز عبور</h3>
          </div>
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
