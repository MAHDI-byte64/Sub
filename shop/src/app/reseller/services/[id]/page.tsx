import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireReseller } from "@/lib/auth";
import { serviceLinks, syncService } from "@/lib/provision";
import { resellerPlans, resellerProfile } from "@/lib/reseller";
import {
  refreshServiceAction,
  renameCustomerAction,
  renewServiceAction,
  rotateCustomerConfigAction,
} from "@/app/actions/reseller";
import { faDate, faNum, formatBytes, remainingDays, toman } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import CopyButton from "@/components/CopyButton";
import UsageRing from "@/components/UsageRing";

export const dynamic = "force-dynamic";

/** برنامه‌هایی که لینک اشتراک را مستقیم وارد می‌کنند */
function quickAddLinks(sub: string) {
  const encoded = encodeURIComponent(sub);
  return [
    { name: "v2rayNG", href: `v2rayng://install-sub?url=${encoded}` },
    { name: "Hiddify", href: `hiddify://install-sub?url=${encoded}` },
    { name: "Streisand", href: `streisand://import/${sub}` },
  ];
}

export default async function ResellerServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const user = await requireReseller();

  const owned = await db.service.findFirst({ where: { id, resellerId: user.id } });
  if (!owned) notFound();

  await syncService(id, true);
  const [service, links, plans, profile] = await Promise.all([
    db.service.findUniqueOrThrow({ where: { id }, include: { panel: true, plan: true } }),
    serviceLinks(id),
    resellerPlans(user.resellerOff),
    resellerProfile(user.id),
  ]);

  const unlimited = service.totalBytes <= 0;
  const remaining = unlimited ? 0 : Math.max(0, service.totalBytes - service.usedBytes);
  const volumeRatio = unlimited ? 1 : remaining / service.totalBytes;
  const days = remainingDays(service.expiresAt);
  const totalDays = service.expiresAt
    ? Math.max(1, Math.round((service.expiresAt.getTime() - service.createdAt.getTime()) / 86_400_000))
    : null;
  const timeRatio = days === null ? 1 : totalDays ? Math.max(0, days) / totalDays : 0;
  const expired = service.status === "expired" || (days !== null && days <= 0);
  const renewPlan = plans.find((p) => p.id === service.planId) ?? plans[0];

  return (
    <div>
      <div className="card-title">
        <h1 style={{ fontSize: "1.3rem" }}>
          {service.panel.flag} {service.customerName || "مشتری بدون نام"}
        </h1>
        <div className="btn-row">
          <span className={`badge ${expired ? "badge-danger" : "badge-success"}`}>
            {expired ? "منقضی" : "فعال"}
          </span>
          <Link className="btn btn-sm" href="/reseller/services">
            ← همه مشتری‌ها
          </Link>
        </div>
      </div>

      {isNew ? (
        <div className="alert alert-success">
          سرویس ساخته شد. لینک اشتراک و QR پایین همین صفحه است؛ آن را برای مشتری بفرستید.
        </div>
      ) : null}

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
              <span>⏳ اعتبار</span>
              <b>{days === null ? "بدون انقضا" : days > 0 ? `${faNum(days)} روز مانده` : "پایان یافته"}</b>
            </div>
            <div className="meta-row">
              <span>📅 تاریخ انقضا</span>
              <b>{faDate(service.expiresAt)}</b>
            </div>
            <div className="meta-row">
              <span>🏷️ پلن</span>
              <b>{service.plan?.title ?? "—"}</b>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-title">
            <h3>لینک اشتراک مشتری</h3>
            <span className="badge badge-info">این را برای مشتری بفرستید</span>
          </div>
          <div className="copy-box">
            <code>{links.subscription}</code>
            <CopyButton value={links.subscription} />
          </div>
          <div className="qr-box" style={{ marginTop: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/qr?d=${encodeURIComponent(links.subscription)}`} alt="لینک اشتراک" />
          </div>
          <div className="btn-row" style={{ marginTop: 14 }}>
            {quickAddLinks(links.subscription).map((app) => (
              <a className="btn btn-sm" href={app.href} key={app.name}>
                {app.name}
              </a>
            ))}
          </div>

          {links.configs.length ? (
            <>
              <hr />
              <label className="field-hint" style={{ display: "block", marginBottom: 8 }}>
                کانفیگ مستقیم:
              </label>
              {links.configs.map((cfg) => (
                <div className="copy-box" key={cfg.uri} style={{ marginBottom: 8 }}>
                  <code>{cfg.uri}</code>
                  <CopyButton value={cfg.uri} />
                </div>
              ))}
            </>
          ) : null}
        </div>

        <div>
          <div className="card">
            <div className="card-title">
              <h3>🔄 تمدید سرویس</h3>
              <span className="badge badge-info">اعتبار: {toman(profile.balance)}</span>
            </div>
            {plans.length ? (
              <ActionForm action={renewServiceAction} submitLabel="تمدید و کسر از اعتبار">
                <input type="hidden" name="serviceId" value={service.id} />
                <div className="field">
                  <label htmlFor="planId">پلن تمدید</label>
                  <select id="planId" name="planId" defaultValue={renewPlan?.id ?? ""}>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.title} — {toman(plan.price)}
                      </option>
                    ))}
                  </select>
                  <span className="field-hint">
                    حجم و زمان به همین کانفیگ اضافه می‌شود؛ لینک مشتری عوض نمی‌شود.
                  </span>
                </div>
              </ActionForm>
            ) : (
              <p className="dim">پلنی برای تمدید تعریف نشده است.</p>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              <h3>🏷️ نام مشتری</h3>
            </div>
            <ActionForm action={renameCustomerAction} submitLabel="ذخیره نام">
              <input type="hidden" name="serviceId" value={service.id} />
              <div className="field">
                <input
                  name="customerName"
                  defaultValue={service.customerName ?? ""}
                  placeholder="مثلاً علی — ۰۹۱۲…"
                  maxLength={60}
                />
              </div>
            </ActionForm>
          </div>

          <div className="card">
            <div className="card-title">
              <h3>ابزارها</h3>
            </div>
            <div className="btn-row">
              <ActionForm
                action={refreshServiceAction}
                submitLabel="↻ به‌روزرسانی مصرف"
                buttonClass="btn btn-sm"
                inline
              >
                <input type="hidden" name="serviceId" value={service.id} />
              </ActionForm>
              <ActionForm
                action={rotateCustomerConfigAction}
                submitLabel="🔐 بازتولید کانفیگ"
                buttonClass="btn btn-sm"
                confirm="کانفیگ تازه ساخته شود؟ لینک قبلی مشتری از کار می‌افتد."
                inline
              >
                <input type="hidden" name="serviceId" value={service.id} />
              </ActionForm>
            </div>
            <p className="field-hint" style={{ marginTop: 10 }}>
              بازتولید کانفیگ وقتی به‌درد می‌خورد که لینک مشتری جایی لو رفته باشد؛ حجم و اعتبار
              دست‌نخورده می‌ماند.
            </p>
            <div className="svc-meta" style={{ marginTop: 12 }}>
              <div className="meta-row">
                <span>🧾 نام کلاینت روی پنل</span>
                <b className="mono">{service.clientEmail}</b>
              </div>
              <div className="meta-row">
                <span>📅 تاریخ فروش</span>
                <b>{faDate(service.createdAt, true)}</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
