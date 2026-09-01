import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { serviceLinks, syncService } from "@/lib/provision";
import { faDate, faNum, formatBytes, remainingDays } from "@/lib/format";
import CopyButton from "@/components/CopyButton";

export const dynamic = "force-dynamic";

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/services/${id}`);

  const owned = await db.service.findFirst({ where: { id, userId: user.id } });
  if (!owned) notFound();

  await syncService(id, true);
  const service = await db.service.findUniqueOrThrow({ where: { id }, include: { panel: true, plan: true } });
  const links = await serviceLinks(id);

  const unlimited = service.totalBytes <= 0;
  const remaining = unlimited ? null : Math.max(0, service.totalBytes - service.usedBytes);
  const days = remainingDays(service.expiresAt);

  return (
    <div>
      <div className="card-title">
        <h1 style={{ fontSize: "1.4rem" }}>
          {service.panel.flag} {service.remark}
        </h1>
        <Link className="btn btn-sm" href={`/plans?renew=${service.id}`}>
          تمدید سرویس
        </Link>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="stat">
          <b>{unlimited ? "نامحدود" : formatBytes(remaining ?? 0, "۰")}</b>
          <span>حجم باقی‌مانده</span>
        </div>
        <div className="stat">
          <b>{formatBytes(service.usedBytes, "۰")}</b>
          <span>مصرف شده</span>
        </div>
        <div className="stat">
          <b>{days === null ? "بدون انقضا" : days > 0 ? `${faNum(days)} روز` : "پایان یافته"}</b>
          <span>اعتبار باقی‌مانده</span>
        </div>
        <div className="stat">
          <b>{faDate(service.expiresAt)}</b>
          <span>تاریخ انقضا</span>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">
            <h3>لینک اشتراک (پیشنهادی)</h3>
          </div>
          <p className="field-hint">این لینک را در برنامه خود به‌عنوان Subscription اضافه کنید تا همه سرورها به‌روز بمانند.</p>
          <div className="copy-box">
            <code>{links.subscription}</code>
            <CopyButton value={links.subscription} />
          </div>
          <div className="qr-box" style={{ marginTop: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/qr?d=${encodeURIComponent(links.subscription)}`} alt="QR لینک اشتراک" />
          </div>
          <div className="btn-row" style={{ marginTop: 14, justifyContent: "center" }}>
            <a
              className="btn btn-sm btn-primary"
              href={`v2rayng://install-sub?url=${encodeURIComponent(links.subscription)}`}
            >
              افزودن سریع به v2rayNG
            </a>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <h3>کانفیگ مستقیم</h3>
          </div>
          {links.error ? (
            <div className="alert alert-warn">
              دریافت کانفیگ از سرور در حال حاضر ممکن نیست ({links.error}). از لینک اشتراک استفاده کنید.
            </div>
          ) : null}
          {links.configs.length ? (
            links.configs.map((cfg) => (
              <div key={cfg.uri} style={{ marginBottom: 16 }}>
                <label className="field-hint">{cfg.label}</label>
                <div className="copy-box">
                  <code>{cfg.uri}</code>
                  <CopyButton value={cfg.uri} />
                </div>
                <div className="qr-box" style={{ marginTop: 12 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/qr?d=${encodeURIComponent(cfg.uri)}`} alt="QR کانفیگ" />
                </div>
              </div>
            ))
          ) : !links.error ? (
            <p className="dim">کانفیگ مستقیمی برای این سرویس ساخته نشد.</p>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>مشخصات فنی</h3>
        </div>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr>
                <th>لوکیشن</th>
                <td>
                  {service.panel.flag} {service.panel.location}
                </td>
              </tr>
              <tr>
                <th>پلن</th>
                <td>{service.plan?.title ?? (service.isTrial ? "اکانت تست" : "—")}</td>
              </tr>
              <tr>
                <th>کاربر همزمان</th>
                <td>{service.deviceLimit > 0 ? faNum(service.deviceLimit) : "نامحدود"}</td>
              </tr>
              <tr>
                <th>شناسه کاربری در پنل</th>
                <td className="mono">{service.clientEmail}</td>
              </tr>
              <tr>
                <th>تاریخ خرید</th>
                <td>{faDate(service.createdAt, true)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="field-hint" style={{ marginTop: 12 }}>
          راهنمای اتصال گام‌به‌گام را در صفحه <Link href="/tutorial">آموزش اتصال</Link> ببینید.
        </p>
      </div>
    </div>
  );
}
