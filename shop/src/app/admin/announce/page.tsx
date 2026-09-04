import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { announceAction } from "@/app/actions/admin";
import { AUDIENCE_LABEL, audienceUserIds, type Audience } from "@/lib/notify";
import { pushReady } from "@/lib/push";
import { faDate, faNum, relativeTime } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import Flash from "@/components/Flash";

export const dynamic = "force-dynamic";
export const metadata = { title: "اطلاعیه به کاربران" };

export default async function AdminAnnouncePage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; type?: string }>;
}) {
  await requireAdmin();
  const { msg, type } = await searchParams;

  const audiences = Object.keys(AUDIENCE_LABEL) as Audience[];
  const [counts, pushOn, recent] = await Promise.all([
    Promise.all(audiences.map(async (key) => [key, (await audienceUserIds(key)).length] as const)),
    pushReady(),
    db.notification.groupBy({
      by: ["title"],
      where: { kind: "announcement" },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: 6,
    }),
  ]);
  const size = new Map(counts);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>اطلاعیه به کاربران</h1>
          <p>پیام شما در زنگ اعلان‌های کاربران می‌نشیند؛ اگر بخواهید، روی گوشی‌شان هم پوش می‌شود.</p>
        </div>
        <span className="badge badge-info">🔔 {faNum(size.get("all") ?? 0)} کاربر</span>
      </div>

      <Flash msg={msg} type={type} />

      <div className="card">
        <div className="card-title">
          <h3>📣 نوشتن اطلاعیه</h3>
        </div>

        <ActionForm action={announceAction} submitLabel="📣 ارسال اطلاعیه">
          <div className="field">
            <label htmlFor="title">عنوان</label>
            <input
              id="title"
              name="title"
              required
              maxLength={120}
              placeholder="مثلاً: سرور آلمان ارتقا پیدا کرد"
            />
          </div>

          <div className="field">
            <label htmlFor="body">متن (اختیاری)</label>
            <textarea
              id="body"
              name="body"
              rows={4}
              placeholder="توضیح کوتاه؛ همان چیزی که کاربر در اعلان می‌خواند."
            />
          </div>

          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="audience">مخاطب</label>
              <select id="audience" name="audience" defaultValue="all">
                {audiences.map((key) => (
                  <option key={key} value={key}>
                    {AUDIENCE_LABEL[key]} ({faNum(size.get(key) ?? 0)} نفر)
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="href">لینک (اختیاری)</label>
              <input id="href" name="href" className="ltr" placeholder="/plans" />
              <span className="field-hint">
                با کلیک روی اعلان، کاربر به این صفحه می‌رود. خالی بگذارید تا به فهرست اعلان‌ها برود.
              </span>
            </div>
          </div>

          <div className="checkbox">
            <input id="push" name="push" type="checkbox" disabled={!pushOn} />
            <label htmlFor="push">
              اعلان پوش هم فرستاده شود
              {pushOn ? "" : " (اول باید پوش را در تنظیمات روشن کنید)"}
            </label>
          </div>

          <p className="field-hint">
            کاربران مسدودشده اطلاعیه نمی‌گیرند. اگر می‌خواهید پیام روی <b>همهٔ صفحه‌های سایت</b> به
            بازدیدکننده هم نشان داده شود، به‌جای این، «اطلاعیه بالای سایت» را در{" "}
            <Link href="/admin/settings">تنظیمات</Link> پر کنید.
          </p>
        </ActionForm>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>🗂️ اطلاعیه‌های اخیر</h3>
        </div>
        {recent.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>عنوان</th>
                  <th>گیرنده</th>
                  <th>زمان</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.title}>
                    <td>
                      <span className="cell-main">{row.title}</span>
                    </td>
                    <td className="nowrap">{faNum(row._count._all)} کاربر</td>
                    <td className="nowrap">
                      {row._max.createdAt ? (
                        <>
                          <span className="cell-main">{relativeTime(row._max.createdAt)}</span>
                          <span className="cell-sub">{faDate(row._max.createdAt, true)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dim">هنوز اطلاعیه‌ای نفرستاده‌اید.</p>
        )}
      </div>
    </div>
  );
}
