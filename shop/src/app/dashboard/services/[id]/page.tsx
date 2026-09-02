import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { serviceLinks, syncService } from "@/lib/provision";
import { fmt, remainingDays } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";
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
  const locale = await getLocale();
  const tr = translator(locale);
  const f = fmt(locale);

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
          {service.panel.flag}{" "}
          {service.plan?.title ?? (service.isTrial ? tr("service.trial") : service.remark)}
        </h1>
        <div className="btn-row">
          <span className={`badge ${expired ? "badge-danger" : "badge-success"}`}>
            {expired ? tr("common.expired") : tr("common.active")}
          </span>
          <Link className="btn btn-sm btn-primary" href={`/plans?renew=${service.id}`}>
            {tr("service.renew")}
          </Link>
        </div>
      </div>

      {/* وضعیت مصرف */}
      <div className="card svc">
        <div className="svc-body">
          <UsageRing
            locale={locale}
            id={service.id}
            volume={volumeRatio}
            time={timeRatio}
            centerValue={unlimited ? "∞" : `${f.num(Math.round(volumeRatio * 100))}٪`}
            centerLabel={tr("common.remaining")}
          />
          <div className="svc-meta">
            <div className="meta-row">
              <span>{tr("card.volumeLeft")}</span>
              <b>
                {unlimited ? tr("common.unlimited") : f.bytes(remaining, f.num(0))}
                {!unlimited ? (
                  <span className="dim" style={{ fontWeight: 500 }}>
                    {" "}
                    {tr("card.of")} {f.bytes(service.totalBytes)}
                  </span>
                ) : null}
              </b>
            </div>
            <div className="meta-row">
              <span>{tr("card.used")}</span>
              <b>{f.bytes(service.usedBytes, f.num(0))}</b>
            </div>
            <div className="meta-row">
              <span>{tr("card.validity")}</span>
              <b>
                {days === null
                  ? tr("service.noExpiry")
                  : days > 0
                    ? f.daysLeft(days)
                    : tr("service.finished")}
              </b>
            </div>
            <div className="meta-row">
              <span>📅 {tr("service.expiresAt")}</span>
              <b>{f.date(service.expiresAt)}</b>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        {/* لینک اشتراک */}
        <div className="card">
          <div className="card-title">
            <h3>{tr("service.subLink")}</h3>
            <span className="badge badge-info">{tr("contact.recommended")}</span>
          </div>
          <p className="field-hint">{tr("service.subHint")}</p>
          <div className="copy-box">
            <code>{links.subscription}</code>
            <CopyButton value={links.subscription} locale={locale} />
          </div>

          <div className="qr-box" style={{ marginTop: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/qr?d=${encodeURIComponent(links.subscription)}`} alt={tr("service.subLink")} />
          </div>

          <label className="field-hint" style={{ display: "block", margin: "18px 0 8px" }}>
            {tr("service.quickAdd")}
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
            <h3>{tr("service.directConfig")}</h3>
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
                  <CopyButton value={cfg.uri} locale={locale} />
                </div>
                <div className="copy-box">
                  <code>{cfg.uri}</code>
                </div>
                <div className="qr-box" style={{ marginTop: 12 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/qr?d=${encodeURIComponent(cfg.uri)}`} alt={tr("service.directConfig")} />
                </div>
              </div>
            ))
          ) : !links.error ? (
            <p className="dim">{tr("service.noConfig")}</p>
          ) : null}
        </div>
      </div>

      {/* امنیت سرویس */}
      <div className="card">
        <div className="card-title">
          <h3>{tr("service.security")}</h3>
          <span className="badge badge-info">{tr("service.yourConfig")}</span>
        </div>
        <p className="field-hint" style={{ marginBottom: 14 }}>
          {tr("service.securityText")}
        </p>
        <RotateConfigButton
          serviceId={service.id}
          locale={locale}
          rotatedAt={service.rotatedAt ? f.date(service.rotatedAt, true) : null}
          rotateCount={f.num(service.rotateCount)}
          cooldownMinutes={f.num(rotateCooldown)}
          disabled={!rotateEnabled || expired}
          disabledReason={
            !rotateEnabled ? tr("rotate.disabledAdmin") : tr("rotate.disabledExpired")
          }
        />
      </div>

      <div className="card">
        <div className="card-title">
          <h3>{tr("service.specs")}</h3>
        </div>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr>
                <th>{tr("common.location")}</th>
                <td>
                  {service.panel.flag} {service.panel.location}
                </td>
              </tr>
              <tr>
                <th>{tr("service.plan")}</th>
                <td>{service.plan?.title ?? (service.isTrial ? tr("service.trial") : "—")}</td>
              </tr>
              <tr>
                <th>{tr("common.device")}</th>
                <td>{service.deviceLimit > 0 ? f.num(service.deviceLimit) : tr("common.unlimited")}</td>
              </tr>
              <tr>
                <th>{tr("service.clientId")}</th>
                <td className="mono">{service.clientEmail}</td>
              </tr>
              <tr>
                <th>{tr("service.boughtAt")}</th>
                <td>{f.date(service.createdAt, true)}</td>
              </tr>
              <tr>
                <th>{tr("service.lastSync")}</th>
                <td>{f.date(service.lastSyncAt, true)}</td>
              </tr>
              <tr>
                <th>{tr("service.rotatedAt")}</th>
                <td>
                  {service.rotatedAt
                    ? `${f.date(service.rotatedAt, true)} · ${f.num(service.rotateCount)} ${tr("service.times")}`
                    : tr("service.notRotated")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="field-hint" style={{ marginTop: 12 }}>
          {tr("service.guideHint").split("{link}")[0]}
          <Link href="/tutorial">{tr("nav.tutorial")}</Link>
          {tr("service.guideHint").split("{link}")[1]}
        </p>
      </div>
    </div>
  );
}
