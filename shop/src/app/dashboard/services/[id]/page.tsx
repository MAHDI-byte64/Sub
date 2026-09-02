import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { serviceLinks, syncService } from "@/lib/provision";
import { faDate, faNum, formatBytes, remainingDays } from "@/lib/format";
import { asBool, asNum, getSettings } from "@/lib/settings";
import CopyButton from "@/components/CopyButton";
import UsageRing from "@/components/UsageRing";
import RotateConfigButton from "@/components/RotateConfigButton";

export const dynamic = "force-dynamic";

/** برنامه‌هایی که لینک اشتراک را مستقیم وارد می‌کنند */
function quickAddLinks(sub: string) {
  const encoded = encodeURIComponent(sub);
  return [
    { name: "v2rayNG", href: `v2rayng://install-sub?url=${encoded}` },
    { name: "Hiddify", href: `hiddify://install-sub?url=${encoded}` },
    { name: "Streisand", href: `streisand://import/${sub}` },
    { name: "Sing-box", href: `sing-box://import-remote-profile?url=${encoded}` },
  ];
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/services/${id}`);

  const owned = await db.service.findFirst({ where: { id, userId: user.id } });
  if (!owned) notFound();

  await syncService(id, true);
  const service = await db.service.findUniqueOrThrow({
    where: { id },
    include: { panel: true, plan: true },
  });
  const links = await serviceLinks(id);
  const settings = await getSettings();

  const unlimited = service.totalBytes <= 0;
  const remaining = unlimited ? 0 : Math.max(0, service.totalBytes - service.usedBytes);
  const volumeRatio = unlimited ? 1 : remaining / service.totalBytes;
  const days = remainingDays(service.expiresAt);
  const totalDays = service.expiresAt
    ? Math.max(1, Math.round((service.expiresAt.getTime() - service.createdAt.getTime()) / 86_400_000))
    : null;
  const timeRatio = days === null ? 1 : totalDays ? Math.max(0, days) / totalDays : 0;
  const expired = service.status === "expired" || (days !== null && days <= 0);

  const rotateEnabled = asBool(settings.rotate_enabled);
  const rotateCooldown = Math.max(0, asNum(settings.rotate_cooldown_minutes, 30));

  return (
    <div>
      <div className="card-title">
        <h1 style={{ fontSize: "1.35rem" }}>
          {service.panel.flag} {service.plan?.title ?? (service.isTrial ? "اکانت تست رایگان" : service.remark)}
        </h1>
        <div className="btn-row">
          <span className={`badge ${expired ? "badge-danger" : "badge-success"}`}>
            {expired ? "منقضی" : "فعال"}
          </span>
          <Link className="btn btn-sm btn-primary" href={`/plans?renew=${service.id}`}>
            تمدید سرویس
          </Link>
        </div>
      </div>

      {/* وضعیت مصرف */}
      <div className="card svc">
        <div className="svc-body">
          <UsageRing
            id={service.id}
            volume={volumeRatio}
            time={timeRatio}
            centerValue={unlimited ? "∞" : `${faNum(Math.round(volumeRatio * 100))}٪`}
            centerLabel="باقی‌مانده"
          />
          <div className="svc-meta">
            <div className="meta-row">
              <span>📦 حجم باقی‌مانده</span>
              <b>
                {unlimited ? "نامحدود" : formatBytes(remaining, "۰")}
                {!unlimited ? (
                  <span className="dim" style={{ fontWeight: 500 }}>
                    {" "}
                    از {formatBytes(service.totalBytes)}
                  </span>
                ) : null}
              </b>
            </div>
            <div className="meta-row">
              <span>📊 مصرف‌شده</span>
              <b>{formatBytes(service.usedBytes, "۰")}</b>
            </div>
            <div className="meta-row">
              <span>⏳ اعتبار</span>
              <b>
                {days === null ? "بدون انقضا" : days > 0 ? `${faNum(days)} روز مانده` : "پایان یافته"}
              </b>
            </div>
            <div className="meta-row">
              <span>📅 تاریخ انقضا</span>
              <b>{faDate(service.expiresAt)}</b>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        {/* لینک اشتراک */}
        <div className="card">
          <div className="card-title">
            <h3>لینک اشتراک</h3>
            <span className="badge badge-info">پیشنهادی</span>
          </div>
          <p className="field-hint">
            این لینک را در برنامه به‌عنوان Subscription اضافه کنید تا سرورها همیشه به‌روز بمانند.
          </p>
          <div className="copy-box">
            <code>{links.subscription}</code>
            <CopyButton value={links.subscription} />
          </div>

          <div className="qr-box" style={{ marginTop: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/qr?d=${encodeURIComponent(links.subscription)}`} alt="QR لینک اشتراک" />
          </div>

          <label className="field-hint" style={{ display: "block", margin: "18px 0 8px" }}>
            افزودن سریع به برنامه:
          </label>
          <div className="btn-row">
            {quickAddLinks(links.subscription).map((app) => (
              <a className="btn btn-sm" href={app.href} key={app.name}>
                {app.name}
              </a>
            ))}
          </div>
        </div>

        {/* کانفیگ مستقیم */}
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
              <div className="config-card" key={cfg.uri}>
                <div className="config-head">
                  <span className="badge">{cfg.label}</span>
                  <CopyButton value={cfg.uri} label="کپی کانفیگ" />
                </div>
                <div className="copy-box">
                  <code>{cfg.uri}</code>
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

      {/* امنیت سرویس */}
      <div className="card">
        <div className="card-title">
          <h3>امنیت سرویس</h3>
          <span className="badge badge-info">کانفیگ شخصی شماست</span>
        </div>
        <p className="field-hint" style={{ marginBottom: 14 }}>
          کانفیگ و لینک اشتراک را با کسی به اشتراک نگذارید. اگر لینک‌تان جایی منتشر شد یا کسی بدون
          اجازه از سرویس شما استفاده می‌کند، با یک کلیک کانفیگ تازه بسازید.
        </p>
        <RotateConfigButton
          serviceId={service.id}
          rotatedAt={service.rotatedAt ? faDate(service.rotatedAt, true) : null}
          rotateCount={faNum(service.rotateCount)}
          cooldownMinutes={faNum(rotateCooldown)}
          disabled={!rotateEnabled || expired}
          disabledReason={
            !rotateEnabled
              ? "بازتولید کانفیگ توسط مدیر غیرفعال شده است. برای تعویض کانفیگ تیکت بزنید."
              : "این سرویس منقضی شده است؛ برای ساخت کانفیگ تازه ابتدا آن را تمدید کنید."
          }
        />
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
              <tr>
                <th>آخرین به‌روزرسانی مصرف</th>
                <td>{faDate(service.lastSyncAt, true)}</td>
              </tr>
              <tr>
                <th>آخرین بازتولید کانفیگ</th>
                <td>
                  {service.rotatedAt
                    ? `${faDate(service.rotatedAt, true)} (${faNum(service.rotateCount)} بار)`
                    : "انجام نشده"}
                </td>
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
