import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { FAQ, FEATURES, STEPS } from "@/lib/content";
import { faNum } from "@/lib/format";
import PlanCard from "@/components/PlanCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [settings, plans, panels, serviceCount] = await Promise.all([
    getSettings(),
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.panel.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.service.count(),
  ]);

  return (
    <>
      <section className="hero container">
        <div className="hero-badges">
          <span className="pill">🔒 بدون ثبت لاگ</span>
          <span className="pill">⚡ VLESS + Reality</span>
          <span className="pill">🎁 تست رایگان</span>
        </div>
        <h1>
          <span className="gradient-text">{settings.site_name}</span> — {settings.site_tagline}
        </h1>
        <p className="lead">{settings.site_description}</p>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <Link className="btn btn-primary" href="/plans">
            مشاهده تعرفه‌ها
          </Link>
          <Link className="btn" href="/dashboard">
            دریافت تست رایگان
          </Link>
        </div>
      </section>

      <section className="container">
        <div className="grid grid-4">
          <div className="stat">
            <b>{faNum(panels.length || 0)}</b>
            <span>سرور و لوکیشن فعال</span>
          </div>
          <div className="stat">
            <b>{faNum(serviceCount)}</b>
            <span>سرویس تحویل‌شده</span>
          </div>
          <div className="stat">
            <b>۹۹.۹٪</b>
            <span>پایداری سرویس</span>
          </div>
          <div className="stat">
            <b>۲۴/۷</b>
            <span>پشتیبانی</span>
          </div>
        </div>
      </section>

      <section className="section container">
        <div className="section-head">
          <h2>چرا {settings.site_name}؟</h2>
          <p>زیرساخت اختصاصی، تحویل خودکار از پنل و پشتیبانی واقعی انسانی.</p>
        </div>
        <div className="grid grid-3">
          {FEATURES.map((f) => (
            <div className="card feature" key={f.title}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section container" id="plans">
        <div className="section-head">
          <h2>تعرفه‌ها</h2>
          <p>همه پلن‌ها روی تمام لوکیشن‌ها قابل استفاده‌اند و بدون محدودیت سرعت هستند.</p>
        </div>
        {plans.length ? (
          <div className="grid grid-4">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        ) : (
          <div className="card empty">
            <div className="empty-icon">🗂️</div>
            هنوز پلنی تعریف نشده است. مدیر سایت می‌تواند از پنل مدیریت پلن اضافه کند.
          </div>
        )}
      </section>

      {panels.length ? (
        <section className="section container">
          <div className="section-head">
            <h2>لوکیشن‌ها</h2>
            <p>هنگام خرید می‌توانید لوکیشن دلخواه را انتخاب کنید یا انتخاب را به سیستم بسپارید.</p>
          </div>
          <div className="grid grid-4">
            {panels.map((panel) => (
              <div className="card feature" key={panel.id}>
                <div className="feature-icon">{panel.flag}</div>
                <h3>{panel.location}</h3>
                <p>{panel.note || "سرور اختصاصی با پینگ پایین"}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section container">
        <div className="section-head">
          <h2>خرید در سه مرحله</h2>
        </div>
        <div className="grid grid-3">
          {STEPS.map((s, i) => (
            <div className="card" key={s.title}>
              <div className="step-num">{faNum(i + 1)}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section container">
        <div className="section-head">
          <h2>سوالات پرتکرار</h2>
        </div>
        {FAQ.slice(0, 4).map((item) => (
          <details className="accordion" key={item.q}>
            <summary>{item.q}</summary>
            <div className="acc-body">{item.a}</div>
          </details>
        ))}
        <div className="center" style={{ marginTop: 18 }}>
          <Link className="btn" href="/faq">
            همه سوالات
          </Link>
        </div>
      </section>
    </>
  );
}
