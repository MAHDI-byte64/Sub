import Link from "next/link";
import { db } from "@/lib/db";
import { asBool, getSettings } from "@/lib/settings";
import { faNum } from "@/lib/format";
import { FAQ } from "@/lib/content";
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
  const [plans, panels, settings] = await Promise.all([
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.panel.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getSettings(),
  ]);

  const trial = asBool(settings.trial_enabled);

  return (
    <div className="container section">
      <div className="section-head">
        <span className="eyebrow">
          <span className="eyebrow-dot" />
          تحویل آنی پس از تأیید پرداخت
        </span>
        <h1>{renew ? "تمدید سرویس" : "تعرفه‌ها"}</h1>
        <p>
          {renew
            ? "پلنی را که می‌خواهید به سرویس فعلی اضافه شود انتخاب کنید؛ لینک اشتراک شما تغییر نمی‌کند."
            : "پلن مناسب خود را انتخاب کنید. همه پلن‌ها روی تمام لوکیشن‌ها فعال‌اند و محدودیت سرعت ندارند."}
        </p>
      </div>

      {trial && !renew ? (
        <div className="cta-panel" style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: "1.2rem" }}>🎁 هنوز مطمئن نیستید؟</h2>
          <p>
            با ثبت‌نام رایگان می‌توانید یک اکانت تست {faNum(settings.trial_volume_gb)} گیگابایتی{" "}
            {faNum(settings.trial_days)} روزه بگیرید و قبل از خرید امتحان کنید.
          </p>
          <Link className="btn btn-primary" href="/dashboard">
            دریافت تست رایگان
          </Link>
        </div>
      ) : null}

      {plans.length ? (
        <div className="grid grid-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              href={`/checkout?plan=${plan.id}${renew ? `&renew=${renew}` : ""}`}
            />
          ))}
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">🗂️</div>
          فعلاً پلنی برای فروش تعریف نشده است.
        </div>
      )}

      {plans.length ? (
        <div style={{ marginTop: 26 }}>
          <PlanEstimator
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
            <h3>تمدید بدون دردسر</h3>
            <p>حجم و زمان به همان کانفیگ اضافه می‌شود؛ نیازی به تنظیم دوباره نیست.</p>
          </div>
        </article>
        <article>
          <span className="feature-icon">📱</span>
          <div>
            <h3>روی همه دستگاه‌ها</h3>
            <p>اندروید، آی‌او‌اس، ویندوز، مک و لینوکس با یک لینک اشتراک.</p>
          </div>
        </article>
        <article>
          <span className="feature-icon">🎧</span>
          <div>
            <h3>پشتیبانی واقعی</h3>
            <p>تیکت داخل پنل و تلگرام، در تمام ساعات شبانه‌روز.</p>
          </div>
        </article>
      </div>

      {panels.length ? (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-title">
            <h3>لوکیشن‌های در دسترس</h3>
            <span className="badge badge-info">{faNum(panels.length)} سرور</span>
          </div>
          <div className="btn-row">
            {panels.map((p) => (
              <span className="pill" key={p.id}>
                {p.flag} {p.location}
              </span>
            ))}
          </div>
          <p className="field-hint" style={{ marginTop: 12 }}>
            هنگام خرید می‌توانید لوکیشن را انتخاب کنید یا انتخاب را به سیستم بسپارید تا کم‌بارترین سرور
            به شما داده شود.
          </p>
        </div>
      ) : null}

      <div className="section-head" style={{ marginTop: "clamp(34px, 6vw, 54px)" }}>
        <h2>سوال‌هایی که قبل از خرید می‌پرسند</h2>
      </div>
      <div className="faq-grid">
        {FAQ.slice(0, 4).map((item) => (
          <details className="accordion" key={item.q}>
            <summary>{item.q}</summary>
            <div className="acc-body">{item.a}</div>
          </details>
        ))}
      </div>
    </div>
  );
}
