import Link from "next/link";
import { db } from "@/lib/db";
import { deletePanelAction, savePanelAction, testPanelAction } from "@/app/actions/admin";
import { faDate, faNum } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import Flash from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function AdminPanelsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; msg?: string; type?: string }>;
}) {
  const { edit, msg, type } = await searchParams;
  const [panels, editing, counts] = await Promise.all([
    db.panel.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    edit ? db.panel.findUnique({ where: { id: edit } }) : Promise.resolve(null),
    db.service.groupBy({ by: ["panelId"], _count: { _all: true } }),
  ]);
  const load = new Map(counts.map((c) => [c.panelId, c._count._all]));

  return (
    <div>
      <div className="card-title">
        <h1 style={{ fontSize: "1.5rem" }}>سرورها (پنل 3x-ui)</h1>
        {editing ? (
          <Link className="btn btn-sm" href="/admin/panels">
            + افزودن سرور جدید
          </Link>
        ) : null}
      </div>

      <Flash msg={msg} type={type} />

      <div className="card">
        <div className="card-title">
          <h3>{editing ? `ویرایش «${editing.name}»` : "افزودن سرور جدید"}</h3>
        </div>
        <ActionForm action={savePanelAction} submitLabel={editing ? "ذخیره تغییرات" : "افزودن سرور"}>
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="name">نام سرور (داخلی)</label>
              <input id="name" name="name" defaultValue={editing?.name} required placeholder="مثلاً DE-1" />
            </div>
            <div className="field">
              <label htmlFor="location">عنوان لوکیشن (نمایش به کاربر)</label>
              <input id="location" name="location" defaultValue={editing?.location} required placeholder="آلمان - فرانکفورت" />
            </div>
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="flag">ایموجی پرچم</label>
              <input id="flag" name="flag" defaultValue={editing?.flag ?? "🇩🇪"} />
            </div>
            <div className="field">
              <label htmlFor="url">آدرس پنل (با پورت و base path)</label>
              <input id="url" name="url" defaultValue={editing?.url} required className="ltr" placeholder="https://panel.example.com:2053/mypath" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="apiToken">توکن API پنل (روش پیشنهادی برای پنل نسخه ۳)</label>
            <input
              id="apiToken"
              name="apiToken"
              type="password"
              className="ltr"
              autoComplete="off"
              placeholder={editing?.apiToken ? "توکن ذخیره شده است؛ برای تغییر مقدار جدید بدهید" : "3xui_..."}
            />
            <span className="field-hint">
              در پنل 3x-ui به «تنظیمات → امنیت → API Token» بروید و یک توکن با دسترسی <b>admin</b> بسازید.
              با توکن، دیگر نیازی به نام کاربری و رمز نیست و اتصال پایدارتر است. پنل‌های نسخه ۲ توکن ندارند؛
              برای آن‌ها نام کاربری و رمز را پر کنید.
            </span>
            {editing?.apiToken ? (
              <span className="checkbox" style={{ marginTop: 6 }}>
                <input id="clearApiToken" name="clearApiToken" type="checkbox" />
                <label htmlFor="clearApiToken">توکن ذخیره‌شده حذف شود و از نام کاربری استفاده شود</label>
              </span>
            ) : null}
          </div>
          <div className="grid grid-3">
            <div className="field">
              <label htmlFor="username">نام کاربری پنل</label>
              <input id="username" name="username" defaultValue={editing?.username} className="ltr" />
            </div>
            <div className="field">
              <label htmlFor="password">رمز عبور پنل</label>
              <input
                id="password"
                name="password"
                type="password"
                className="ltr"
                placeholder={editing ? "برای تغییر، رمز جدید را وارد کنید" : ""}
              />
            </div>
            <div className="field">
              <label htmlFor="inboundId">شناسه اینباند (Inbound ID)</label>
              <input id="inboundId" name="inboundId" type="number" min={1} defaultValue={editing?.inboundId ?? 1} required />
            </div>
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="templateEmail">نام کلاینت الگو در پنل</label>
              <input
                id="templateEmail"
                name="templateEmail"
                defaultValue={editing?.templateEmail ?? ""}
                className="ltr"
                placeholder="مثلاً template-vip"
              />
              <span className="field-hint">
                یک کلاینت با تنظیمات دلخواه در پنل بسازید و نامش را اینجا بنویسید؛ هر سرویس فروخته‌شده
                کپی دقیق همان کلاینت خواهد بود و فقط نام، UUID، لینک اشتراک، حجم و تاریخ انقضایش فرق می‌کند.
              </span>
            </div>
            <div className="field">
              <label htmlFor="namePattern">الگوی نام‌گذاری کلاینت‌های جدید</label>
              <input
                id="namePattern"
                name="namePattern"
                defaultValue={editing?.namePattern ?? "{template}-{code}"}
                className="ltr"
                placeholder="{template}-{code}"
              />
              <span className="field-hint">
                متغیرها: {"{template}"} نام کلاینت الگو، {"{code}"} کد سفارش، {"{user}"} نام کاربر،
                {" "}{"{rand}"} حروف تصادفی. در صورت تکراری بودن، خودکار پسوند تصادفی اضافه می‌شود.
              </span>
            </div>
          </div>
          <div className="grid grid-3">
            <div className="field">
              <label htmlFor="subBase">آدرس پایه لینک اشتراک</label>
              <input id="subBase" name="subBase" defaultValue={editing?.subBase ?? ""} className="ltr" placeholder="https://sub.example.com:2096/sub" />
              <span className="field-hint">خالی بگذارید تا از روی آدرس پنل ساخته شود.</span>
            </div>
            <div className="field">
              <label htmlFor="hostOverride">دامنه اتصال کانفیگ</label>
              <input id="hostOverride" name="hostOverride" defaultValue={editing?.hostOverride ?? ""} className="ltr" placeholder="cdn.example.com" />
              <span className="field-hint">اگر خالی باشد، هاست پنل استفاده می‌شود.</span>
            </div>
            <div className="field">
              <label htmlFor="flow">Flow (برای Reality)</label>
              <input id="flow" name="flow" defaultValue={editing?.flow ?? ""} className="ltr" placeholder="xtls-rprx-vision" />
              <span className="field-hint">خالی بگذارید تا از کلاینت الگو برداشته شود.</span>
            </div>
          </div>
          <div className="grid grid-3">
            <div className="field">
              <label htmlFor="capacity">ظرفیت (تعداد سرویس، ۰ = نامحدود)</label>
              <input id="capacity" name="capacity" type="number" min={0} defaultValue={editing?.capacity ?? 0} />
            </div>
            <div className="field">
              <label htmlFor="sortOrder">ترتیب نمایش</label>
              <input id="sortOrder" name="sortOrder" type="number" defaultValue={editing?.sortOrder ?? 0} />
            </div>
            <div className="field">
              <label htmlFor="note">توضیح کوتاه</label>
              <input id="note" name="note" defaultValue={editing?.note ?? ""} placeholder="مناسب گیمینگ" />
            </div>
          </div>
          <div className="checkbox">
            <input id="isActive" name="isActive" type="checkbox" defaultChecked={editing ? editing.isActive : true} />
            <label htmlFor="isActive">این سرور فعال باشد و در فروش نمایش داده شود</label>
          </div>
        </ActionForm>
      </div>

      {panels.length ? (
        <div className="grid">
          {panels.map((panel) => (
            <div className="card" key={panel.id}>
              <div className="card-title">
                <h3>
                  {panel.flag} {panel.name} — {panel.location}
                </h3>
                <span className={`badge ${panel.isActive ? "badge-success" : "badge-warn"}`}>
                  {panel.isActive ? "فعال" : "غیرفعال"}
                </span>
              </div>
              <div className="table-wrap">
                <table>
                  <tbody>
                    <tr>
                      <th>آدرس پنل</th>
                      <td className="ltr mono">{panel.url}</td>
                    </tr>
                    <tr>
                      <th>اینباند</th>
                      <td>#{faNum(panel.inboundId)}</td>
                    </tr>
                    <tr>
                      <th>روش اتصال</th>
                      <td>
                        {panel.apiToken ? (
                          <span className="badge badge-success">توکن API</span>
                        ) : (
                          <span className="badge">نام کاربری و رمز</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <th>کلاینت الگو</th>
                      <td className="ltr mono">{panel.templateEmail || "—"}</td>
                    </tr>
                    <tr>
                      <th>الگوی نام‌گذاری</th>
                      <td className="ltr mono">{panel.namePattern}</td>
                    </tr>
                    <tr>
                      <th>سرویس‌های ساخته‌شده</th>
                      <td>
                        {faNum(load.get(panel.id) ?? 0)}
                        {panel.capacity > 0 ? ` از ${faNum(panel.capacity)}` : ""}
                      </td>
                    </tr>
                    <tr>
                      <th>آخرین بررسی</th>
                      <td>{panel.lastCheckAt ? faDate(panel.lastCheckAt, true) : "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {panel.lastError ? <div className="alert alert-error" style={{ marginTop: 10 }}>{panel.lastError}</div> : null}

              <div className="btn-row" style={{ marginTop: 12 }}>
                <ActionForm action={testPanelAction} submitLabel="🔌 تست اتصال" buttonClass="btn btn-sm" inline>
                  <input type="hidden" name="id" value={panel.id} />
                </ActionForm>
                <Link className="btn btn-sm" href={`/admin/panels?edit=${panel.id}`}>
                  ویرایش
                </Link>
                <ActionForm
                  action={deletePanelAction}
                  submitLabel="حذف"
                  buttonClass="btn btn-sm btn-danger"
                  confirm={`سرور «${panel.name}» حذف شود؟`}
                  inline
                >
                  <input type="hidden" name="id" value={panel.id} />
                </ActionForm>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">🖥️</div>
          هنوز سروری اضافه نشده است. اطلاعات پنل 3x-ui خود را در فرم بالا وارد کنید.
        </div>
      )}
    </div>
  );
}
