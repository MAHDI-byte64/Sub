import Link from "next/link";
import type { Panel, Plan, Service } from "@prisma/client";
import { buildSubscriptionUrl } from "@/lib/vless";
import { faDate, faNum, formatBytes, remainingDays } from "@/lib/format";
import CopyButton from "./CopyButton";
import UsageRing from "./UsageRing";
import AutoRenewToggle from "./AutoRenewToggle";
import { toman } from "@/lib/format";

export default function ServiceCard({
  service,
  autoRenewEnabled = false,
}: {
  service: Service & { panel: Panel; plan?: Plan | null };
  autoRenewEnabled?: boolean;
}) {
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

  const centerValue = unlimitedVolume ? "∞" : `${faNum(Math.round(volumeRatio * 100))}٪`;

  return (
    <div className={`card svc${expired ? " is-expired" : ""}`}>
      <div className="svc-head">
        <div className="svc-title">
          <span className="svc-flag">{service.panel.flag}</span>
          <div>
            <h3>{service.plan?.title ?? (service.isTrial ? "اکانت تست رایگان" : service.remark)}</h3>
            <small>{service.panel.location}</small>
          </div>
        </div>
        <div className="btn-row">
          {service.isTrial ? <span className="badge badge-info">تست رایگان</span> : null}
          <span
            className={`badge ${expired ? "badge-danger" : disabled ? "badge-warn" : "badge-success"}`}
          >
            {expired ? "منقضی" : disabled ? "غیرفعال" : "فعال"}
          </span>
        </div>
      </div>

      <div className="svc-body">
        <UsageRing
          id={service.id}
          volume={volumeRatio}
          time={timeRatio}
          centerValue={centerValue}
          centerLabel="باقی‌مانده"
        />

        <div className="svc-meta">
          <div className={`meta-row${lowVolume ? " is-low" : ""}`}>
            <span>📦 حجم باقی‌مانده</span>
            <b>
              {unlimitedVolume ? "نامحدود" : formatBytes(remainingBytes, "۰")}
              {!unlimitedVolume ? (
                <span className="dim" style={{ fontWeight: 500 }}>
                  {" "}
                  از {formatBytes(service.totalBytes)}
                </span>
              ) : null}
            </b>
          </div>
          <div className={`meta-row${lowTime ? " is-low" : ""}`}>
            <span>⏳ اعتبار</span>
            <b>
              {days === null
                ? "بدون انقضا"
                : days > 0
                  ? `${faNum(days)} روز مانده`
                  : "پایان یافته"}
              {service.expiresAt ? (
                <span className="dim" style={{ fontWeight: 500 }}>
                  {" "}
                  · {faDate(service.expiresAt)}
                </span>
              ) : null}
            </b>
          </div>
          <div className="meta-row">
            <span>📊 مصرف‌شده</span>
            <b>{formatBytes(service.usedBytes, "۰")}</b>
          </div>
          <div className="meta-row">
            <span>👥 کاربر همزمان</span>
            <b>{service.deviceLimit > 0 ? faNum(service.deviceLimit) : "نامحدود"}</b>
          </div>
        </div>
      </div>

      <div className="svc-sub">
        <label>لینک اشتراک</label>
        <div className="copy-box">
          <code>{sub}</code>
          <CopyButton value={sub} />
        </div>
      </div>

      {autoRenewEnabled && service.plan && !service.isTrial ? (
        <AutoRenewToggle
          serviceId={service.id}
          enabled={service.autoRenew}
          price={toman(service.plan.priceToman)}
        />
      ) : null}

      <div className="svc-actions">
        <Link className="btn btn-sm btn-primary" href={`/dashboard/services/${service.id}`}>
          کانفیگ و QR
        </Link>
        <Link className="btn btn-sm" href={`/plans?renew=${service.id}`}>
          {expired ? "تمدید سرویس" : "تمدید"}
        </Link>
        <a className="btn btn-sm" href={`v2rayng://install-sub?url=${encodeURIComponent(sub)}`}>
          افزودن به v2rayNG
        </a>
      </div>
    </div>
  );
}
