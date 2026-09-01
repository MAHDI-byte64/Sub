import Link from "next/link";
import { db } from "@/lib/db";
import { deleteDiscountAction, saveDiscountAction } from "@/app/actions/admin";
import { faDate, faNum, toman } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import Flash from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function AdminDiscountsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; msg?: string; type?: string }>;
}) {
  const { edit, msg, type } = await searchParams;
  const [discounts, editing] = await Promise.all([
    db.discount.findMany({ orderBy: { createdAt: "desc" } }),
    edit ? db.discount.findUnique({ where: { id: edit } }) : Promise.resolve(null),
  ]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>کدهای تخفیف</h1>
          <p>کدهای درصدی یا مبلغی با سقف مصرف و تاریخ انقضا.</p>
        </div>
        {editing ? (
          <Link className="btn btn-sm" href="/admin/discounts">
            + کد جدید
          </Link>
        ) : null}
      </div>

      <Flash msg={msg} type={type} />

      <div className="card">
        <div className="card-title">
          <h3>{editing ? `ویرایش «${editing.code}»` : "افزودن کد تخفیف"}</h3>
        </div>
        <ActionForm action={saveDiscountAction} submitLabel={editing ? "ذخیره تغییرات" : "افزودن کد"}>
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <div className="grid grid-3">
            <div className="field">
              <label htmlFor="code">کد</label>
              <input id="code" name="code" defaultValue={editing?.code} required className="ltr" placeholder="WELCOME10" />
            </div>
            <div className="field">
              <label htmlFor="type">نوع</label>
              <select id="type" name="type" defaultValue={editing?.type ?? "percent"}>
                <option value="percent">درصدی</option>
                <option value="amount">مبلغ ثابت (تومان)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="value">مقدار</label>
              <input id="value" name="value" type="number" min={0} defaultValue={editing?.value ?? 10} required />
            </div>
          </div>
          <div className="grid grid-3">
            <div className="field">
              <label htmlFor="maxUses">حداکثر دفعات استفاده (۰ = نامحدود)</label>
              <input id="maxUses" name="maxUses" type="number" min={0} defaultValue={editing?.maxUses ?? 0} />
            </div>
            <div className="field">
              <label htmlFor="minAmount">حداقل مبلغ سفارش (تومان)</label>
              <input id="minAmount" name="minAmount" type="number" min={0} defaultValue={editing?.minAmount ?? 0} />
            </div>
            <div className="field">
              <label htmlFor="expiresAt">تاریخ انقضا</label>
              <input
                id="expiresAt"
                name="expiresAt"
                type="date"
                defaultValue={editing?.expiresAt ? editing.expiresAt.toISOString().slice(0, 10) : ""}
              />
            </div>
          </div>
          <div className="checkbox">
            <input id="isActive" name="isActive" type="checkbox" defaultChecked={editing ? editing.isActive : true} />
            <label htmlFor="isActive">فعال</label>
          </div>
        </ActionForm>
      </div>

      <div className="card data-card">
        <div className="data-head">
          <h3>فهرست کدها</h3>
          <span className="badge badge-info">{faNum(discounts.length)} کد</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کد</th>
                <th>تخفیف</th>
                <th>استفاده</th>
                <th>حداقل سفارش</th>
                <th>انقضا</th>
                <th>وضعیت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {discounts.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.code}</td>
                  <td className="nowrap">{d.type === "percent" ? `${faNum(d.value)}٪` : toman(d.value)}</td>
                  <td className="nowrap">
                    {faNum(d.usedCount)}
                    {d.maxUses > 0 ? ` / ${faNum(d.maxUses)}` : ""}
                  </td>
                  <td className="nowrap">{d.minAmount > 0 ? toman(d.minAmount) : "—"}</td>
                  <td className="nowrap">{d.expiresAt ? faDate(d.expiresAt) : "—"}</td>
                  <td>
                    <span className={`badge ${d.isActive ? "badge-success" : "badge-warn"}`}>
                      {d.isActive ? "فعال" : "غیرفعال"}
                    </span>
                  </td>
                  <td>
                    <div className="btn-row">
                      <Link className="btn btn-sm" href={`/admin/discounts?edit=${d.id}`}>
                        ویرایش
                      </Link>
                      <ActionForm
                        action={deleteDiscountAction}
                        submitLabel="حذف"
                        buttonClass="btn btn-sm btn-danger"
                        confirm={`کد «${d.code}» حذف شود؟`}
                        inline
                      >
                        <input type="hidden" name="id" value={d.id} />
                      </ActionForm>
                    </div>
                  </td>
                </tr>
              ))}
              {!discounts.length ? (
                <tr>
                  <td colSpan={7} className="center dim">
                    کد تخفیفی ثبت نشده است.
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
