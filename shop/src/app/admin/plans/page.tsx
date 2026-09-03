import Link from "next/link";
import { db } from "@/lib/db";
import { deletePlanAction, savePlanAction } from "@/app/actions/admin";
import { deviceLabel, faNum, planDaysLabel, planVolumeLabel, toman } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import Flash from "@/components/Flash";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; msg?: string; type?: string }>;
}) {
  await requireAdmin();

  const { edit, msg, type } = await searchParams;
  const [plans, editing, panels] = await Promise.all([
    db.plan.findMany({ orderBy: { sortOrder: "asc" }, include: { panels: true } }),
    edit ? db.plan.findUnique({ where: { id: edit }, include: { panels: true } }) : Promise.resolve(null),
    db.panel.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ]);
  const editingPanelIds = new Set((editing?.panels ?? []).map((p) => p.id));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>پلن‌ها</h1>
          <p>قیمت، حجم، مدت و تعداد کاربر همزمان هر پلن.</p>
        </div>
        {editing ? (
          <Link className="btn btn-sm" href="/admin/plans">
            + پلن جدید
          </Link>
        ) : null}
      </div>

      <Flash msg={msg} type={type} />

      <div className="card">
        <div className="card-title">
          <h3>{editing ? `ویرایش «${editing.title}»` : "افزودن پلن جدید"}</h3>
        </div>
        <ActionForm action={savePlanAction} submitLabel={editing ? "ذخیره تغییرات" : "افزودن پلن"}>
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="title">عنوان پلن</label>
              <input id="title" name="title" defaultValue={editing?.title} required placeholder="نقره‌ای" />
            </div>
            <div className="field">
              <label htmlFor="subtitle">توضیح کوتاه</label>
              <input id="subtitle" name="subtitle" defaultValue={editing?.subtitle ?? ""} placeholder="مناسب خانواده" />
            </div>
          </div>
          <div className="grid grid-4">
            <div className="field">
              <label htmlFor="volumeGb">حجم (گیگابایت، ۰ = نامحدود)</label>
              <input id="volumeGb" name="volumeGb" type="number" min={0} defaultValue={editing?.volumeGb ?? 30} />
            </div>
            <div className="field">
              <label htmlFor="days">مدت (روز، ۰ = بدون انقضا)</label>
              <input id="days" name="days" type="number" min={0} defaultValue={editing?.days ?? 30} />
            </div>
            <div className="field">
              <label htmlFor="deviceLimit">کاربر همزمان (۰ = نامحدود)</label>
              <input id="deviceLimit" name="deviceLimit" type="number" min={0} defaultValue={editing?.deviceLimit ?? 1} />
            </div>
            <div className="field">
              <label htmlFor="priceToman">قیمت (تومان)</label>
              <input id="priceToman" name="priceToman" type="number" min={0} step={1000} defaultValue={editing?.priceToman ?? 0} required />
            </div>
          </div>
          {panels.length ? (
            <div className="form-section">
              <h4>این پلن روی کدام سرورها فروخته شود؟</h4>
              <div className="grid grid-2">
                {panels.map((panel) => (
                  <div className="checkbox" key={panel.id}>
                    <input
                      id={`panel-${panel.id}`}
                      name="panelIds"
                      type="checkbox"
                      value={panel.id}
                      defaultChecked={editingPanelIds.has(panel.id)}
                    />
                    <label htmlFor={`panel-${panel.id}`}>
                      {panel.flag} {panel.location}
                      {!panel.isActive ? <span className="badge badge-warn">غیرفعال</span> : null}
                    </label>
                  </div>
                ))}
              </div>
              <span className="field-hint">
                اگر هیچ‌کدام را انتخاب نکنید، این پلن روی <b>همهٔ سرورهای فعال</b> ارائه می‌شود و کاربر
                هنگام خرید لوکیشن را انتخاب می‌کند.
              </span>
            </div>
          ) : null}

          <div className="grid grid-3">
            <div className="field">
              <label htmlFor="sortOrder">ترتیب نمایش</label>
              <input id="sortOrder" name="sortOrder" type="number" defaultValue={editing?.sortOrder ?? 0} />
            </div>
            <div className="checkbox">
              <input id="isActive" name="isActive" type="checkbox" defaultChecked={editing ? editing.isActive : true} />
              <label htmlFor="isActive">فعال</label>
            </div>
            <div className="checkbox">
              <input id="isPopular" name="isPopular" type="checkbox" defaultChecked={editing?.isPopular ?? false} />
              <label htmlFor="isPopular">برچسب «پرفروش‌ترین»</label>
            </div>
          </div>
        </ActionForm>
      </div>

      <div className="card data-card">
        <div className="data-head">
          <h3>فهرست پلن‌ها</h3>
          <span className="badge badge-info">{faNum(plans.length)} پلن</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>عنوان</th>
                <th>حجم</th>
                <th>مدت</th>
                <th>کاربر</th>
                <th>قیمت</th>
                <th>سرورها</th>
                <th>وضعیت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td>
                    {plan.title}
                    {plan.isPopular ? <span className="badge badge-info" style={{ marginInlineStart: 6 }}>پرفروش</span> : null}
                  </td>
                  <td className="nowrap">{planVolumeLabel(plan.volumeGb)}</td>
                  <td className="nowrap">{planDaysLabel(plan.days)}</td>
                  <td className="nowrap">{deviceLabel(plan.deviceLimit)}</td>
                  <td className="nowrap">{toman(plan.priceToman)}</td>
                  <td>
                    {plan.panels.length ? (
                      <span className="cell-sub">
                        {plan.panels.map((p) => `${p.flag} ${p.location}`).join("، ")}
                      </span>
                    ) : (
                      <span className="badge">همه سرورها</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${plan.isActive ? "badge-success" : "badge-warn"}`}>
                      {plan.isActive ? "فعال" : "غیرفعال"}
                    </span>
                  </td>
                  <td>
                    <div className="btn-row">
                      <Link className="btn btn-sm" href={`/admin/plans?edit=${plan.id}`}>
                        ویرایش
                      </Link>
                      <ActionForm
                        action={deletePlanAction}
                        submitLabel="حذف"
                        buttonClass="btn btn-sm btn-danger"
                        confirm={`پلن «${plan.title}» حذف شود؟`}
                        inline
                      >
                        <input type="hidden" name="id" value={plan.id} />
                      </ActionForm>
                    </div>
                  </td>
                </tr>
              ))}
              {!plans.length ? (
                <tr>
                  <td colSpan={8} className="center dim">
                    هنوز پلنی ساخته نشده است.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="data-foot">پلن‌های غیرفعال در سایت نمایش داده نمی‌شوند.</div>
      </div>
    </div>
  );
}
