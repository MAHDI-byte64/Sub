import Link from "next/link";
import type { Panel, Service } from "@prisma/client";
import { buildSubscriptionUrl } from "@/lib/vless";
import { faDate, faNum, formatBytes, remainingDays } from "@/lib/format";
import CopyButton from "./CopyButton";

export default function ServiceCard({ service }: { service: Service & { panel: Panel } }) {
  const sub = buildSubscriptionUrl(service.panel.subBase, service.panel.url, service.subId);
  const unlimited = service.totalBytes <= 0;
  const percent = unlimited ? 0 : Math.min(100, Math.round((service.usedBytes / service.totalBytes) * 100));
  const days = remainingDays(service.expiresAt);
  const expired = service.status === "expired" || (days !== null && days <= 0);
  const level = percent >= 90 ? "danger" : percent >= 70 ? "warn" : "";

  return (
    <div className="card">
      <div className="card-title">
        <h3>
          {service.panel.flag} {service.remark}
          {service.isTrial ? <span className="badge badge-info" style={{ marginInlineStart: 8 }}>تست رایگان</span> : null}
        </h3>
        <span className={`badge ${expired ? "badge-danger" : service.status === "disabled" ? "badge-warn" : "badge-success"}`}>
          {expired ? "منقضی" : service.status === "disabled" ? "غیرفعال" : "فعال"}
        </span>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 14 }}>
        <div className="stat">
          <b>{unlimited ? "نامحدود" : formatBytes(Math.max(0, service.totalBytes - service.usedBytes))}</b>
          <span>حجم باقی‌مانده</span>
        </div>
        <div className="stat">
          <b>{days === null ? "بدون انقضا" : days > 0 ? `${faNum(days)} روز` : "پایان یافته"}</b>
          <span>زمان باقی‌مانده</span>
        </div>
        <div className="stat">
          <b>{formatBytes(service.usedBytes, "۰")}</b>
          <span>مصرف شده</span>
        </div>
      </div>

      {!unlimited ? (
        <div className={`progress ${level}`} style={{ marginBottom: 12 }}>
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : null}

      <div className="field">
        <label>لینک اشتراک</label>
        <div className="copy-box">
          <code>{sub}</code>
          <CopyButton value={sub} />
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 14 }}>
        <Link className="btn btn-sm btn-primary" href={`/dashboard/services/${service.id}`}>
          مشاهده کانفیگ و QR
        </Link>
        <Link className="btn btn-sm" href={`/plans?renew=${service.id}`}>
          تمدید
        </Link>
        <span className="badge">انقضا: {faDate(service.expiresAt)}</span>
      </div>
    </div>
  );
}
