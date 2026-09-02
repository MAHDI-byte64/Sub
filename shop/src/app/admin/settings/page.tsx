import { getSettings, SETTING_DEFS } from "@/lib/settings";
import { saveSettingsAction, setupTelegramWebhookAction, testTelegramAction } from "@/app/actions/admin";
import ActionForm from "@/components/ActionForm";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const values = await getSettings();
  const groups = [...new Set(SETTING_DEFS.map((d) => d.group))];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>تنظیمات سایت</h1>
          <p>نام و متن‌های سایت، اطلاعات پرداخت، اکانت تست و اطلاع‌رسانی تلگرام.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>ابزارهای سریع</h3>
        </div>
        <div className="btn-row">
          <ActionForm
            action={testTelegramAction}
            submitLabel="✈️ ارسال پیام آزمایشی تلگرام"
            buttonClass="btn btn-sm"
            inline
          />
          <ActionForm
            action={setupTelegramWebhookAction}
            submitLabel="🤖 فعال‌سازی پاسخ به تیکت از تلگرام"
            buttonClass="btn btn-sm"
            inline
          />
          <a className="btn btn-sm" href="/api/admin/backup">
            💾 دانلود پشتیبان دیتابیس
          </a>
          <a className="btn btn-sm" href="/api/admin/export/orders">
            ⬇ خروجی سفارش‌ها
          </a>
          <a className="btn btn-sm" href="/api/admin/export/users">
            ⬇ خروجی کاربران
          </a>
        </div>
        <p className="field-hint" style={{ marginTop: 10 }}>
          با فعال‌سازی ربات، اعلان هر تیکت در تلگرام قابل «ریپلای» می‌شود و پاسخ شما مستقیم برای مشتری
          ثبت می‌شود (نیازمند دامنه و HTTPS). دستور <code>/stats</code> هم خلاصهٔ فروش را می‌دهد.
        </p>
        <p className="field-hint">
          فایل پشتیبان شامل کل دیتابیس (کاربران، سفارش‌ها، سرویس‌ها و تنظیمات) است؛ جای امنی نگه دارید.
        </p>
      </div>

      <ActionForm action={saveSettingsAction} submitLabel="ذخیره همه تنظیمات">
        {groups.map((group) => (
          <div className="card" key={group}>
            <div className="card-title">
              <h3>{group}</h3>
            </div>
            <div className="grid grid-2">
              {SETTING_DEFS.filter((d) => d.group === group).map((def) => (
                <div className={def.type === "bool" ? "checkbox" : "field"} key={def.key}>
                  {def.type === "bool" ? (
                    <>
                      <input
                        id={def.key}
                        name={def.key}
                        type="checkbox"
                        defaultChecked={values[def.key] === "1"}
                      />
                      <label htmlFor={def.key}>{def.label}</label>
                    </>
                  ) : (
                    <>
                      <label htmlFor={def.key}>{def.label}</label>
                      {def.type === "textarea" ? (
                        <textarea id={def.key} name={def.key} defaultValue={values[def.key]} />
                      ) : (
                        <input
                          id={def.key}
                          name={def.key}
                          type={def.type === "number" ? "number" : def.type === "password" ? "password" : "text"}
                          defaultValue={values[def.key]}
                        />
                      )}
                      {def.hint ? <span className="field-hint">{def.hint}</span> : null}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </ActionForm>
    </div>
  );
}
