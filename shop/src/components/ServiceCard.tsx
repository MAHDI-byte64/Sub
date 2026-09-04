import Link from "next/link";
import type { Panel, Plan, Service } from "@prisma/client";
import { buildSubscriptionUrl } from "@/lib/vless";
import { fmt, remainingDays } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import CopyButton from "./CopyButton";
import UsageRing from "./UsageRing";
import AutoRenewToggle from "./AutoRenewToggle";

export default function ServiceCard({
  service,
  autoRenewEnabled = false,
  locale = "fa",
}: {
  service: Service & { panel: Panel; plan?: Plan | null };
  autoRenewEnabled?: boolean;
  locale?: Locale;
}) {
  const f = fmt(locale);
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
  const sub = buildSubscriptionUrl(service.panel.subBase, service.panel.url, service.subId);

  const unlimitedVolume = service.totalBytes <= 0;
  const remainingBytes = unlimitedVolume ? 0 : Math.max(0, service.totalBytes - service.usedBytes);
  const volumeRatio = unlimitedVolume ? 1 : remainingBytes / service.totalBytes;

  const days = remainingDays(service.expiresAt);
  const totalDays =
    service.expiresAt && service.createdAt
      ? Math.max(
          1,
          Math.round((service.expiresAt.getTime() - service.createdAt.getTime()) / 86_400_000),
        )
      : null;
  const timeRatio = days === null ? 1 : totalDays ? Math.max(0, days) / totalDays : 0;

  const expired = service.status === "expired" || (days !== null && days <= 0) || (!unlimitedVolume && remainingBytes <= 0);
  const disabled = service.status === "disabled";
  const lowVolume = !unlimitedVolume && volumeRatio < 0.15;
  const lowTime = days !== null && days <= 3;

  const centerValue = unlimitedVolume ? "∞" : `${f.num(Math.round(volumeRatio * 100))}٪`;

  return (
    <div className={`card svc${expired ? " is-expired" : ""}`}>
      <div className="svc-head">
        <div className="svc-title">
          <span className="svc-flag">{service.panel.flag}</span>
          <div>
            <h3>{service.plan?.title ?? (service.isTrial ? tr("service.trial") : service.remark)}</h3>
            <small>{service.panel.location}</small>
          </div>
        </div>
        <div className="btn-row">
          {service.isTrial ? <span className="badge badge-info">{tr("card.trialBadge")}</span> : null}
          <span
            className={`badge ${expired ? "badge-danger" : disabled ? "badge-warn" : "badge-success"}`}
          >
            {expired ? tr("common.expired") : disabled ? tr("common.disabled") : tr("common.active")}
          </span>
        </div>
      </div>

      <div className="svc-body">
        <UsageRing
          locale={locale}
          id={service.id}
          volume={volumeRatio}
          time={timeRatio}
          centerValue={centerValue}
          centerLabel={tr("common.remaining")}
        />

        <div className="svc-meta">
          <div className={`meta-row${lowVolume ? " is-low" : ""}`}>
            <span>{tr("card.volumeLeft")}</span>
            <b>
              {unlimitedVolume ? tr("common.unlimited") : f.bytes(remainingBytes, f.num(0))}
              {!unlimitedVolume ? (
                <span className="dim" style={{ fontWeight: 500 }}>
                  {" "}
                  {tr("card.of")} {f.bytes(service.totalBytes)}
                </span>
              ) : null}
            </b>
          </div>
          <div className={`meta-row${lowTime ? " is-low" : ""}`}>
            <span>{tr("card.validity")}</span>
            <b>
              {days === null
                ? tr("service.noExpiry")
                : days > 0
                  ? f.daysLeft(days)
                  : tr("service.finished")}
              {service.expiresAt ? (
                <span className="dim" style={{ fontWeight: 500 }}>
                  {" "}
                  · {f.date(service.expiresAt)}
                </span>
              ) : null}
            </b>
          </div>
          <div className="meta-row">
            <span>{tr("card.used")}</span>
            <b>{f.bytes(service.usedBytes, f.num(0))}</b>
          </div>
          <div className="meta-row">
            <span>{tr("card.devices")}</span>
            <b>{service.deviceLimit > 0 ? f.num(service.deviceLimit) : tr("common.unlimited")}</b>
          </div>
        </div>
      </div>

      <div className="svc-sub">
        <label>{tr("card.subLink")}</label>
        <div className="copy-box">
          <code>{sub}</code>
          <CopyButton value={sub} locale={locale} />
        </div>
      </div>

      {autoRenewEnabled && service.plan && !service.isTrial ? (
        <AutoRenewToggle
          serviceId={service.id}
          enabled={service.autoRenew}
          locale={locale}
          price={f.money(service.plan.priceToman)}
        />
      ) : null}

      <div className="svc-actions">
        <Link className="btn btn-sm btn-primary" href={`/dashboard/services/${service.id}`}>
          {tr("card.configQr")}
        </Link>
        <Link className="btn btn-sm" href={`/plans?renew=${service.id}`}>
          {expired ? tr("card.renewLong") : tr("card.renew")}
        </Link>
        <a className="btn btn-sm" href={sub} target="_blank" rel="noreferrer">
          {tr("card.addToApp")}
        </a>
      </div>
    </div>
  );
}
