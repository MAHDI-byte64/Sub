import Link from "next/link";
import { getSettings, SETTING_DEFS } from "@/lib/settings";
import {
  broadcastPushAction,
  enablePushAction,
  saveSettingsAction,
  setupTelegramWebhookAction,
  testPushAction,
  testTelegramAction,
} from "@/app/actions/admin";
import ActionForm from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdmin();

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
          <Link className="btn btn-sm" href="/admin/backup">
            🗄️ پشتیبان‌گیری و بازیابی
          </Link>
          <a className="btn btn-sm" href="/api/admin/export/orders">
            ⬇ خروجی سفارش‌ها
          </a>
          <a className="btn btn-sm" href="/api/admin/export/users">
            ⬇ خروجی کاربران
          </a>
          <ActionForm
            action={enablePushAction}
            submitLabel="🔔 فعال‌سازی اعلان پوش"
            buttonClass="btn btn-sm"
            inline
          />
          <ActionForm
            action={testPushAction}
            submitLabel="📲 پوش آزمایشی"
            buttonClass="btn btn-sm"
            inline
          />
        </div>
        <p className="field-hint" style={{ marginTop: 10 }}>
          با فعال‌سازی ربات، اعلان هر تیکت در تلگرام قابل «ریپلای» می‌شود و پاسخ شما مستقیم برای مشتری
          ثبت می‌شود (نیازمند دامنه و HTTPS). دستور <code>/stats</code> هم خلاصهٔ فروش را می‌دهد.
        </p>
        <p className="field-hint">
          پشتیبان کامل (دیتابیس + رسیدها)، پشتیبان‌گیری خودکار و بازیابی در صفحهٔ{" "}
          <Link href="/admin/backup">پشتیبان‌گیری</Link> است.
        </p>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>📣 اطلاعیه پوش</h3>
          <span className="badge badge-info">به همهٔ کاربران</span>
        </div>
        <p className="field-hint">
          برای کاربرانی که اعلان را روی مرورگر/گوشی‌شان روشن کرده‌اند فرستاده می‌شود؛ مثلاً اعلام تخفیف
          یا اطلاع‌رسانی قطعی سرور.
        </p>
        <ActionForm action={broadcastPushAction} submitLabel="ارسال اطلاعیه">
          <div className="field">
            <label htmlFor="push-title">عنوان</label>
            <input id="push-title" name="title" placeholder="مثلاً: تخفیف ۲۰٪ نوروزی" />
          </div>
          <div className="field">
            <label htmlFor="push-body">متن</label>
            <input id="push-body" name="body" placeholder="متن کوتاه اطلاعیه" />
          </div>
          <div className="field">
            <label htmlFor="push-url">لینک باز شونده</label>
            <input id="push-url" name="url" defaultValue="/plans" className="ltr" />
          </div>
        </ActionForm>
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
