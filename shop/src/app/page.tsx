import Link from "next/link";
import { db } from "@/lib/db";
import { asBool, getSettings } from "@/lib/settings";
import { faqs, features, steps } from "@/lib/content";
import { fmt } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";
import PlanCard from "@/components/PlanCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const locale = await getLocale();
  const tr = translator(locale);
  const f = fmt(locale);
  const [settings, plans, panels, serviceCount, userCount] = await Promise.all([
    getSettings(),
    db.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: { panels: { select: { id: true, flag: true, location: true } } },
    }),
    db.panel.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.service.count(),
    db.user.count({ where: { role: "user" } }),
  ]);

  const trial = asBool(settings.trial_enabled);

  return (
    <>
      {/* ------------------------------- هیرو ------------------------------- */}
      <section className="container hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            {tr("homeExtra.eyebrow")}
          </span>
          <h1>
            {tr("homeExtra.titlePrefix")}{" "}
            <span className="gradient-text">{settings.site_name}</span>
          </h1>
          <p className="lead">
            {locale === "fa" ? settings.site_description : tr("home.heroText")}
          </p>

          <div className="btn-row">
            <Link className="btn btn-primary btn-lg" href="/plans">
              {tr("common.buyNow")}
            </Link>
            <Link className="btn btn-lg" href={trial ? "/dashboard" : "/tutorial"}>
              {trial ? tr("homeExtra.trialCta") : tr("homeExtra.tutorialCta")}
            </Link>
          </div>

          <div className="trust-row">
            <div className="trust-item">
              <strong>{panels.length ? `${f.num(panels.length)}+` : "۲۴/۷"}</strong>
              <span>{panels.length ? tr("homeExtra.activeServers") : tr("homeExtra.alwaysSupport")}</span>
            </div>
            <span className="trust-sep" />
            <div className="trust-item">
              <strong>{f.num(Math.max(serviceCount, 0))}</strong>
              <span>{tr("homeExtra.delivered")}</span>
            </div>
            <span className="trust-sep" />
            <div className="trust-item">
              <strong>{f.num(Math.max(userCount, 0))}</strong>
              <span>{tr("homeExtra.members")}</span>
            </div>
          </div>
        </div>

        {/* کارت گرافیکی اتصال */}
        <div className="hero-visual">
          <div className="conn-card">
            <div className="conn-head">
              <b>{tr("homeExtra.connTitle")}</b>
              <span className="badge badge-success">
                <span className="eyebrow-dot" /> {tr("homeExtra.connected")}
              </span>
            </div>

            <div className="conn-ring">
              <div>
                <strong>{locale === "fa" ? "۹۹.۹٪" : "99.9%"}</strong>
                <span>{tr("homeExtra.stability")}</span>
              </div>
            </div>

            <div className="conn-rows">
              <div className="conn-row">
                <span>{tr("homeExtra.protocol")}</span>
                <b className="ltr">VLESS + Reality</b>
              </div>
              <div className="conn-row">
                <span>{tr("common.location")}</span>
                <b>
                  {panels.length
                    ? `${panels[0].flag} ${panels[0].location}`
                    : tr("homeExtra.multiLocation")}
                </b>
              </div>
              <div className="conn-row">
                <span>{tr("homeExtra.deliveryRow")}</span>
                <b className="gold">{tr("homeExtra.instant")}</b>
              </div>
            </div>
          </div>

          <div className="float-badge float-badge--speed">
            <i>⚡</i>
            <div>
              <b>{tr("homeExtra.speedBadge")}</b>
              <small>{tr("homeExtra.speedText")}</small>
            </div>
          </div>
          <div className="float-badge float-badge--secure">
            <i>🛡️</i>
            <div>
              <b>{tr("homeExtra.secureBadge")}</b>
              <small>{tr("homeExtra.secureText")}</small>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------- نوار ویژگی‌ها --------------------------- */}
      <section className="container" style={{ marginBottom: "clamp(30px, 6vw, 60px)" }}>
        <div className="feature-strip">
          {features(locale)
            .slice(0, 3)
            .map((item) => (
              <article key={item.title}>
                <span className="feature-icon">{item.icon}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </article>
            ))}
        </div>
      </section>

      {/* ------------------------------ تعرفه‌ها ----------------------------- */}
      <section className="section container" id="plans">
        <div className="section-head">
          <h2>{tr("plans.title")}</h2>
          <p>{tr("homeExtra.plansNote")}</p>
        </div>
        {plans.length ? (
          <div className="grid grid-4">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} locale={locale} />
            ))}
          </div>
        ) : (
          <div className="card empty">
            <div className="empty-icon">🗂️</div>
            {tr("homeExtra.plansEmpty")}
          </div>
        )}
      </section>

      {/* ----------------------------- چرا ما ------------------------------- */}
      <section className="section container">
        <div className="section-head">
          <h2>{tr("homeExtra.whyTitle", { site: settings.site_name })}</h2>
          <p>{tr("homeExtra.whyText")}</p>
        </div>
        <div className="grid grid-3">
          {features(locale)
            .slice(3)
            .map((item) => (
              <div className="card feature" key={item.title}>
                <div className="feature-icon">{item.icon}</div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            ))}
        </div>
      </section>

      {/* ---------------------------- لوکیشن‌ها ----------------------------- */}
      {panels.length ? (
        <section className="section container">
          <div className="section-head">
            <h2>{tr("homeExtra.locationsTitle")}</h2>
            <p>{tr("homeExtra.locationsText")}</p>
          </div>
          <div className="grid grid-4">
            {panels.map((panel) => (
              <div className="card feature" key={panel.id}>
                <div className="feature-icon">{panel.flag}</div>
                <h3>{panel.location}</h3>
                <p>{panel.note || tr("homeExtra.locationNote")}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* -------------------------- مراحل خرید ------------------------------ */}
      <section className="section container">
        <div className="section-head">
          <h2>{tr("homeExtra.stepsTitle")}</h2>
        </div>
        <div className="grid grid-3">
          {steps(locale).map((item, i) => (
            <div className="card" key={item.title}>
              <div className="step-num">{f.num(i + 1)}</div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------- متن سئو ------------------------------ */}
      <section className="container">
        <div className="seo-panel">
          <div>
            <span className="kicker">{tr("homeExtra.aboutKicker", { site: settings.site_name })}</span>
            <h2>{tr("homeExtra.aboutTitle")}</h2>
          </div>
          <div>
            <p>
              اگر دنبال یک اتصال پایدار برای وب‌گردی، تماشای ویدیو و کار روزمره هستید، {settings.site_name}{" "}
              کانفیگ اختصاصی شما را روی سرورهای پرسرعت می‌سازد و لینک اشتراک را بلافاصله بعد از تأیید پرداخت
              در پنل کاربری‌تان قرار می‌دهد. کافی است یکی از برنامه‌های رایگان (v2rayNG، Streisand، v2rayN و …)
              را نصب کنید و لینک اشتراک را در آن وارد کنید.
            </p>
            <p>
              همهٔ سرویس‌ها روی پروتکل VLESS با Reality اجرا می‌شوند؛ ترافیک شما رمزنگاری می‌شود و هیچ لاگی
              از فعالیت‌تان نگه داشته نمی‌شود. مصرف حجم و تاریخ انقضا را هر لحظه در پنل کاربری می‌بینید و با
              یک کلیک همان سرویس را تمدید می‌کنید؛ لینک اشتراک شما تغییر نمی‌کند.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------- سوالات ------------------------------- */}
      <section className="section container">
        <div className="section-head">
          <h2>{tr("home.faqTitle")}</h2>
        </div>
        <div style={{ maxWidth: 780, marginInline: "auto" }}>
          {faqs(locale)
            .slice(0, 4)
            .map((item) => (
              <details className="accordion" key={item.q}>
                <summary>{item.q}</summary>
                <div className="acc-body">{item.a}</div>
              </details>
            ))}
        </div>
        <div className="center" style={{ marginTop: 18 }}>
          <Link className="btn" href="/faq">
            {tr("home.faqMore")}
          </Link>
        </div>
      </section>

      {/* ------------------------------ CTA -------------------------------- */}
      <section className="container" style={{ paddingBottom: "clamp(40px, 8vw, 70px)" }}>
        <div className="cta-panel">
          <h2>{tr("home.ctaTitle")}</h2>
          <p>
            {trial ? tr("homeExtra.ctaTrial") : tr("homeExtra.ctaPaid")}
          </p>
          <div className="btn-row" style={{ justifyContent: "center", marginTop: 18 }}>
            <Link className="btn btn-primary btn-lg" href="/plans">
              {tr("homeExtra.ctaPlans")}
            </Link>
            <Link className="btn btn-lg" href="/tutorial">
              {tr("homeExtra.tutorialCta")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
