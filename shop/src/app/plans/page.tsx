import Link from "next/link";
import { db } from "@/lib/db";
import { asBool, getSettings } from "@/lib/settings";
import { fmt } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";
import { faqs } from "@/lib/content";
import PlanCard from "@/components/PlanCard";
import PlanEstimator from "@/components/PlanEstimator";

export const dynamic = "force-dynamic";
export const metadata = { title: "تعرفه‌ها" };

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ renew?: string }>;
}) {
  const { renew } = await searchParams;
  const locale = await getLocale();
  const tr = translator(locale);
  const f = fmt(locale);

  const [plans, panels, settings] = await Promise.all([
    db.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: { panels: { select: { id: true, flag: true, location: true } } },
    }),
    db.panel.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getSettings(),
  ]);

  const trial = asBool(settings.trial_enabled);

  return (
    <div className="container section">
      <div className="section-head">
        <span className="eyebrow">
          <span className="eyebrow-dot" />
          {tr("plansPage.eyebrow")}
        </span>
        <h1>{renew ? tr("plansPage.renewTitle") : tr("plans.title")}</h1>
        <p>{renew ? tr("plansPage.renewText") : tr("plansPage.text")}</p>
      </div>

      {trial && !renew ? (
        <div className="cta-panel" style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: "1.2rem" }}>{tr("plansPage.trialTitle")}</h2>
          <p>
            {tr("plansPage.trialText", {
              gb: f.num(settings.trial_volume_gb),
              days: f.num(settings.trial_days),
            })}
          </p>
          <Link className="btn btn-primary" href="/dashboard">
            {tr("homeExtra.trialCta")}
          </Link>
        </div>
      ) : null}

      {plans.length ? (
        <div className="grid grid-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              locale={locale}
              href={`/checkout?plan=${plan.id}${renew ? `&renew=${renew}` : ""}`}
            />
          ))}
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">🗂️</div>
          {tr("plansPage.empty")}
        </div>
      )}

      {plans.length ? (
        <div style={{ marginTop: 26 }}>
          <PlanEstimator
            locale={locale}
            plans={plans.map((p) => ({
              id: p.id,
              title: p.title,
              volumeGb: p.volumeGb,
              days: p.days,
              priceToman: p.priceToman,
            }))}
          />
        </div>
      ) : null}

      {/* ویژگی‌های مشترک همه پلن‌ها */}
      <div className="feature-strip" style={{ marginTop: 28 }}>
        <article>
          <span className="feature-icon">🔄</span>
          <div>
            <h3>{tr("plansPage.fRenew")}</h3>
            <p>{tr("plansPage.fRenewText")}</p>
          </div>
        </article>
        <article>
          <span className="feature-icon">📱</span>
          <div>
            <h3>{tr("plansPage.fDevices")}</h3>
            <p>{tr("plansPage.fDevicesText")}</p>
          </div>
        </article>
        <article>
          <span className="feature-icon">🎧</span>
          <div>
            <h3>{tr("plansPage.fSupport")}</h3>
            <p>{tr("plansPage.fSupportText")}</p>
          </div>
        </article>
      </div>

      {panels.length ? (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-title">
            <h3>{tr("plansPage.locationsTitle")}</h3>
            <span className="badge badge-info">
              {tr("plansPage.serversBadge", { count: f.num(panels.length) })}
            </span>
          </div>
          <div className="btn-row">
            {panels.map((p) => (
              <span className="pill" key={p.id}>
                {p.flag} {p.location}
              </span>
            ))}
          </div>
          <p className="field-hint" style={{ marginTop: 12 }}>
            {tr("plansPage.locationHint")}
          </p>
        </div>
      ) : null}

      <div className="section-head" style={{ marginTop: "clamp(34px, 6vw, 54px)" }}>
        <h2>{tr("plansPage.faqTitle")}</h2>
      </div>
      <div className="faq-grid">
        {faqs(locale)
          .slice(0, 4)
          .map((item) => (
            <details className="accordion" key={item.q}>
              <summary>{item.q}</summary>
              <div className="acc-body">{item.a}</div>
            </details>
          ))}
      </div>
    </div>
  );
}
