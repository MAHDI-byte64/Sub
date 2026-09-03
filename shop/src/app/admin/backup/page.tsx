import Link from "next/link";
import {
  backupList,
  createBackupAction,
  deleteBackupAction,
  restoreBackupAction,
  saveSettingsAction,
  sendBackupAction,
} from "@/app/actions/admin";
import { asBool, asNum, getSettings, SETTING_DEFS } from "@/lib/settings";
import { faDate, faNum, relativeTime } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import Flash from "@/components/Flash";

export const dynamic = "force-dynamic";
export const metadata = { title: "پشتیبان‌گیری" };

const BACKUP_KEYS = ["backup_auto", "backup_interval_hours", "backup_keep", "backup_telegram"];

function sizeLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1
    ? `${faNum(mb.toFixed(1))} مگابایت`
    : `${faNum(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
}

export default async function AdminBackupPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; type?: string }>;
}) {
  const { msg, type } = await searchParams;
  const [backups, settings] = await Promise.all([backupList(), getSettings()]);

  const total = backups.reduce((sum, file) => sum + file.size, 0);
  const lastAuto = Number(settings.backup_last_at || 0);
  const autoOn = asBool(settings.backup_auto);
  const telegramReady = Boolean(settings.telegram_bot_token && settings.telegram_admin_chat_id);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>پشتیبان‌گیری</h1>
          <p>یک فایل شامل کل دیتابیس و رسیدهای پرداخت؛ با یک کلیک بسازید، دانلود کنید یا برگردانید.</p>
        </div>
        <ActionForm
          action={createBackupAction}
          submitLabel="🗄️ ساخت پشتیبان تازه"
          buttonClass="btn btn-sm btn-primary"
          inline
        />
      </div>

      <Flash msg={msg} type={type} />

      <div className="summary-strip">
        <div className="summary-tile">
          <span>🗂️ تعداد پشتیبان</span>
          <b>{faNum(backups.length)}</b>
        </div>
        <div className="summary-tile">
          <span>💾 حجم کل</span>
          <b>{backups.length ? sizeLabel(total) : "—"}</b>
        </div>
        <div className="summary-tile">
          <span>🕒 آخرین پشتیبان</span>
          <b>{backups[0] ? relativeTime(backups[0].createdAt) : "ندارید"}</b>
        </div>
        <div className="summary-tile">
          <span>🔁 خودکار</span>
          <b>{autoOn ? `هر ${faNum(asNum(settings.backup_interval_hours, 24))} ساعت` : "خاموش"}</b>
        </div>
      </div>

      {!backups.length ? (
        <div className="alert alert-warn">
          هنوز هیچ پشتیبانی ندارید. یک بار دکمهٔ «ساخت پشتیبان تازه» را بزنید و فایل را جای امنی نگه
          دارید؛ بعد پشتیبان‌گیری خودکار را روشن کنید.
        </div>
      ) : null}

      {/* ------------------------------ فهرست ------------------------------ */}
      <div className="card">
        <div className="card-title">
          <h3>🗂️ پشتیبان‌های ذخیره‌شده</h3>
          <span className="badge badge-info">
            {faNum(asNum(settings.backup_keep, 7))} تای آخر نگه داشته می‌شود
          </span>
        </div>

        {backups.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>فایل</th>
                  <th>تاریخ</th>
                  <th>حجم</th>
                  <th>اقدام</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((file) => (
                  <tr key={file.name}>
                    <td>
                      <span className="cell-main mono ltr">{file.name}</span>
                      <span className="cell-sub">{relativeTime(file.createdAt)}</span>
                    </td>
                    <td className="nowrap">{faDate(file.createdAt, true)}</td>
                    <td className="nowrap">{sizeLabel(file.size)}</td>
                    <td>
                      <div className="cell-actions">
                        <a className="btn btn-sm btn-primary" href={`/api/admin/backup/${file.name}`}>
                          ⬇ دانلود
                        </a>
                        {telegramReady ? (
                          <ActionForm
                            action={sendBackupAction}
                            submitLabel="✈️ تلگرام"
                            buttonClass="btn btn-sm"
                            inline
                          >
                            <input type="hidden" name="name" value={file.name} />
                          </ActionForm>
                        ) : null}
                        <ActionForm
                          action={deleteBackupAction}
                          submitLabel="حذف"
                          buttonClass="btn btn-sm btn-danger"
                          confirm="این فایل پشتیبان حذف شود؟"
                          inline
                        >
                          <input type="hidden" name="name" value={file.name} />
                        </ActionForm>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dim">فهرست خالی است.</p>
        )}

        <p className="field-hint" style={{ marginTop: 12 }}>
          هر فایل شامل <b>دیتابیس کامل</b> (کاربران، سفارش‌ها، سرویس‌ها، سرورها و تنظیمات) و{" "}
          <b>رسیدهای پرداخت</b> است. فایل را جایی بیرون از سرور هم نگه دارید.
        </p>
      </div>

      {/* --------------------------- خودکار --------------------------- */}
      <div className="card">
        <div className="card-title">
          <h3>🔁 پشتیبان‌گیری خودکار</h3>
          <span className={`badge ${autoOn ? "badge-success" : "badge"}`}>
            {autoOn ? "روشن" : "خاموش"}
          </span>
        </div>
        <p className="field-hint">
          کارهای پس‌زمینه هر ۱۵ دقیقه اجرا می‌شوند و اگر از آخرین پشتیبان به‌اندازهٔ فاصلهٔ تعیین‌شده
          گذشته باشد، یک پشتیبان تازه می‌سازند و قدیمی‌ترها را پاک می‌کنند.
          {lastAuto ? ` آخرین پشتیبان خودکار: ${faDate(new Date(lastAuto), true)}.` : ""}
        </p>
        {!telegramReady && asBool(settings.backup_telegram) ? (
          <div className="alert alert-warn">
            برای ارسال به تلگرام، اول توکن ربات و آیدی چت مدیر را در{" "}
            <Link href="/admin/settings">تنظیمات</Link> وارد کنید.
          </div>
        ) : null}

        <ActionForm action={saveSettingsAction} submitLabel="ذخیره تنظیمات پشتیبان‌گیری">
          {SETTING_DEFS.filter((d) => !BACKUP_KEYS.includes(d.key)).map((def) =>
            def.type === "bool" ? (
              <input
                key={def.key}
                type="hidden"
                name={def.key}
                value={settings[def.key] === "1" ? "on" : ""}
              />
            ) : (
              <input key={def.key} type="hidden" name={def.key} value={settings[def.key] ?? ""} />
            ),
          )}
          <div className="grid grid-2">
            {BACKUP_KEYS.map((key) => {
              const def = SETTING_DEFS.find((d) => d.key === key);
              if (!def) return null;
              return def.type === "bool" ? (
                <div className="checkbox" key={key}>
                  <input
                    id={key}
                    name={key}
                    type="checkbox"
                    defaultChecked={settings[key] === "1"}
                  />
                  <label htmlFor={key}>{def.label}</label>
                </div>
              ) : (
                <div className="field" key={key}>
                  <label htmlFor={key}>{def.label}</label>
                  <input
                    id={key}
                    name={key}
                    type="number"
                    className="ltr"
                    defaultValue={settings[key] ?? ""}
                  />
                  {def.hint ? <span className="field-hint">{def.hint}</span> : null}
                </div>
              );
            })}
          </div>
        </ActionForm>
      </div>

      {/* --------------------------- بازیابی --------------------------- */}
      <div className="card">
        <div className="card-title">
          <h3>♻️ بازیابی از پشتیبان</h3>
          <span className="badge badge-warn">با احتیاط</span>
        </div>
        <div className="alert alert-warn">
          بازیابی، دیتابیس فعلی را با نسخهٔ پشتیبان جایگزین می‌کند؛ هر تغییری بعد از آن پشتیبان
          (سفارش‌ها، سرویس‌ها، کاربران تازه) از بین می‌رود. قبل از جایگزینی، خودکار یک{" "}
          <b>پشتیبان ایمنی</b> از وضعیت فعلی ساخته می‌شود.
        </div>

        <ActionForm action={restoreBackupAction} submitLabel="بازیابی" buttonClass="btn btn-danger">
          {backups.length ? (
            <div className="field">
              <label htmlFor="name">انتخاب از پشتیبان‌های ذخیره‌شده</label>
              <select id="name" name="name" defaultValue="">
                <option value="">— انتخاب نشده —</option>
                {backups.map((file) => (
                  <option key={file.name} value={file.name}>
                    {file.name} ({sizeLabel(file.size)})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="file">یا آپلود فایل پشتیبان</label>
            <input id="file" name="file" type="file" accept=".gz,application/gzip" />
            <span className="field-hint">
              همان فایل <span className="mono ltr">.tar.gz</span> که از این صفحه دانلود کرده‌اید.
            </span>
          </div>

          <div className="field">
            <label htmlFor="confirm">برای تأیید، کلمهٔ «بازیابی» را بنویسید</label>
            <input id="confirm" name="confirm" autoComplete="off" placeholder="بازیابی" />
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
