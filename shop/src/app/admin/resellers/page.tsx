import Link from "next/link";
import { db } from "@/lib/db";
import { saveResellerAction } from "@/app/actions/admin";
import { resellerPrice } from "@/lib/reseller";
import { faDate, faNum, toman } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import Flash from "@/components/Flash";

export const dynamic = "force-dynamic";
export const metadata = { title: "نمایندگان" };

export default async function AdminResellersPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; type?: string; q?: string }>;
}) {
  const { msg, type, q } = await searchParams;
  const search = (q ?? "").trim();

  const [resellers, sales, plans] = await Promise.all([
    db.user.findMany({
      where: { isReseller: true },
      orderBy: { createdAt: "desc" },
    }),
    db.walletTx.groupBy({
      by: ["userId"],
      where: { kind: { in: ["reseller_sale", "reseller_renew"] } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, take: 1 }),
  ]);

  const serviceCounts = await db.service.groupBy({
    by: ["resellerId"],
    where: { resellerId: { not: null } },
    _count: { _all: true },
  });

  const salesMap = new Map(sales.map((row) => [row.userId, row]));
  const countMap = new Map(serviceCounts.map((row) => [row.resellerId ?? "", row._count._all]));

  const candidates = search
    ? await db.user.findMany({
        where: {
          isReseller: false,
          role: "user",
          OR: [{ email: { contains: search } }, { name: { contains: search } }],
        },
        take: 10,
      })
    : [];

  const samplePlan = plans[0];
  const totalSales = sales.reduce((sum, row) => sum + Math.abs(row._sum.amount ?? 0), 0);
  const totalServices = serviceCounts.reduce((sum, row) => sum + row._count._all, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>نمایندگان</h1>
          <p>هر نماینده با اعتبار خودش و قیمت عمده می‌فروشد؛ پنل کاربری عادی‌اش هم سر جایش است.</p>
        </div>
        <span className="badge badge-info">{faNum(resellers.length)} نماینده</span>
      </div>

      <Flash msg={msg} type={type} />

      <div className="summary-strip">
        <div className="summary-tile">
          <span>🤝 نماینده فعال</span>
          <b>{faNum(resellers.length)}</b>
        </div>
        <div className="summary-tile">
          <span>🌐 سرویس فروخته‌شده</span>
          <b>{faNum(totalServices)}</b>
        </div>
        <div className="summary-tile">
          <span>💰 فروش عمده</span>
          <b>{toman(totalSales, false)}</b>
        </div>
        <div className="summary-tile">
          <span>💳 مجموع اعتبار</span>
          <b>{toman(resellers.reduce((sum, r) => sum + r.balance, 0), false)}</b>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>فهرست نمایندگان</h3>
        </div>
        {resellers.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>نماینده</th>
                  <th>تخفیف</th>
                  <th>اعتبار</th>
                  <th>فروش</th>
                  <th>مشتری‌ها</th>
                  <th>اقدام</th>
                </tr>
              </thead>
              <tbody>
                {resellers.map((row) => {
                  const stat = salesMap.get(row.id);
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link className="cell-main gold ltr" href={`/admin/users/${row.id}`}>
                          {row.email}
                        </Link>
                        <span className="cell-sub">
                          {row.resellerName || row.name || "—"} · عضو از {faDate(row.createdAt)}
                        </span>
                      </td>
                      <td className="nowrap">
                        <span className="cell-main">{faNum(row.resellerOff)}٪</span>
                        {samplePlan ? (
                          <span className="cell-sub">
                            {samplePlan.title}: {toman(resellerPrice(samplePlan.priceToman, row.resellerOff))}
                          </span>
                        ) : null}
                      </td>
                      <td className="nowrap">{toman(row.balance)}</td>
                      <td className="nowrap">
                        <span className="cell-main">{toman(Math.abs(stat?._sum.amount ?? 0))}</span>
                        <span className="cell-sub">{faNum(stat?._count._all ?? 0)} تراکنش</span>
                      </td>
                      <td className="nowrap">{faNum(countMap.get(row.id) ?? 0)}</td>
                      <td>
                        <div className="cell-actions">
                          <Link className="btn btn-sm" href={`/admin/users/${row.id}`}>
                            پرونده
                          </Link>
                          <ActionForm
                            action={saveResellerAction}
                            submitLabel="خاموش"
                            buttonClass="btn btn-sm btn-danger"
                            confirm="نمایندگی این کاربر خاموش شود؟ سرویس‌های فروخته‌شده دست‌نخورده می‌مانند."
                            inline
                          >
                            <input type="hidden" name="id" value={row.id} />
                            <input type="hidden" name="resellerOff" value={row.resellerOff} />
                            <input type="hidden" name="resellerName" value={row.resellerName ?? ""} />
                          </ActionForm>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dim">هنوز نماینده‌ای ندارید. از فرم پایین یک کاربر را نماینده کنید.</p>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h3>➕ نماینده کردن یک کاربر</h3>
        </div>
        <form style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input name="q" defaultValue={search} placeholder="ایمیل یا نام کاربر…" style={{ flex: 1, minWidth: 200 }} />
          <button className="btn btn-sm" type="submit">
            جستجو
          </button>
        </form>

        {search ? (
          candidates.length ? (
            <div className="grid" style={{ gap: 10, marginTop: 14 }}>
              {candidates.map((candidate) => (
                <div className="card" key={candidate.id} style={{ padding: 14 }}>
                  <div className="card-title">
                    <h3 className="ltr" style={{ fontSize: 14 }}>
                      {candidate.email}
                    </h3>
                    <span className="badge">{toman(candidate.balance)} اعتبار</span>
                  </div>
                  <ActionForm action={saveResellerAction} submitLabel="فعال‌سازی نمایندگی">
                    <input type="hidden" name="id" value={candidate.id} />
                    <div className="grid grid-2">
                      <div className="field">
                        <label htmlFor={`off-${candidate.id}`}>درصد تخفیف</label>
                        <input
                          id={`off-${candidate.id}`}
                          name="resellerOff"
                          type="number"
                          min={0}
                          max={90}
                          defaultValue={20}
                          className="ltr"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`name-${candidate.id}`}>نام فروشگاه</label>
                        <input id={`name-${candidate.id}`} name="resellerName" defaultValue={candidate.name ?? ""} />
                      </div>
                    </div>
                    <div className="checkbox">
                      <input id={`on-${candidate.id}`} name="isReseller" type="checkbox" defaultChecked />
                      <label htmlFor={`on-${candidate.id}`}>نمایندگی فعال باشد</label>
                    </div>
                  </ActionForm>
                </div>
              ))}
            </div>
          ) : (
            <p className="dim" style={{ marginTop: 12 }}>
              کاربری با این مشخصات پیدا نشد (کاربرانی که همین حالا نماینده‌اند در فهرست بالا هستند).
            </p>
          )
        ) : (
          <p className="field-hint" style={{ marginTop: 12 }}>
            ایمیل کاربر را جستجو کنید تا نمایندگی‌اش را با درصد تخفیف دلخواه فعال کنید.
          </p>
        )}
      </div>
    </div>
  );
}
