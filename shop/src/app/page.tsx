import Link from "next/link";
import { db } from "@/lib/db";
import { asBool, getSettings } from "@/lib/settings";
import { FAQ, FEATURES, STEPS } from "@/lib/content";
import { faNum } from "@/lib/format";
import PlanCard from "@/components/PlanCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [settings, plans, panels, serviceCount, userCount] = await Promise.all([
    getSettings(),
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
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
            سرویس فعال · تحویل آنی پس از تأیید پرداخت
          </span>
          <h1>
            اینترنت بدون محدودیت با <span className="gradient-text">{settings.site_name}</span>
          </h1>
          <p className="lead">{settings.site_description}</p>

          <div className="btn-row">
            <Link className="btn btn-primary btn-lg" href="/plans">
              خرید اشتراک
            </Link>
            <Link className="btn btn-lg" href={trial ? "/dashboard" : "/tutorial"}>
              {trial ? "دریافت تست رایگان" : "آموزش اتصال"}
            </Link>
          </div>

          <div className="trust-row">
            <div className="trust-item">
              <strong>{panels.length ? `${faNum(panels.length)}+` : "۲۴/۷"}</strong>
              <span>{panels.length ? "سرور و لوکیشن فعال" : "پشتیبانی همیشگی"}</span>
            </div>
            <span className="trust-sep" />
            <div className="trust-item">
              <strong>{faNum(Math.max(serviceCount, 0))}</strong>
              <span>سرویس تحویل‌شده</span>
            </div>
            <span className="trust-sep" />
            <div className="trust-item">
              <strong>{faNum(Math.max(userCount, 0))}</strong>
              <span>کاربر ثبت‌نام‌شده</span>
            </div>
          </div>
        </div>

        {/* کارت گرافیکی اتصال */}
        <div className="hero-visual">
          <div className="conn-card">
            <div className="conn-head">
              <b>وضعیت اتصال</b>
              <span className="badge badge-success">
                <span className="eyebrow-dot" /> متصل
              </span>
            </div>

            <div className="conn-ring">
              <div>
                <strong>۹۹.۹٪</strong>
                <span>پایداری سرویس</span>
              </div>
            </div>

            <div className="conn-rows">
              <div className="conn-row">
                <span>پروتکل</span>
                <b className="ltr">VLESS + Reality</b>
              </div>
              <div className="conn-row">
                <span>لوکیشن</span>
                <b>{panels.length ? `${panels[0].flag} ${panels[0].location}` : "چند لوکیشن"}</b>
              </div>
              <div className="conn-row">
                <span>تحویل سرویس</span>
                <b className="gold">آنی</b>
              </div>
            </div>
          </div>

          <div className="float-badge float-badge--speed">
            <i>⚡</i>
            <div>
              <b>سرعت بالا</b>
              <small>بدون افت در ساعات شلوغی</small>
            </div>
          </div>
          <div className="float-badge float-badge--secure">
            <i>🛡️</i>
            <div>
              <b>بدون ثبت لاگ</b>
              <small>ترافیک کاملاً رمزنگاری‌شده</small>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------- نوار ویژگی‌ها --------------------------- */}
      <section className="container" style={{ marginBottom: "clamp(30px, 6vw, 60px)" }}>
        <div className="feature-strip">
          {FEATURES.slice(0, 3).map((f) => (
            <article key={f.title}>
              <span className="feature-icon">{f.icon}</span>
              <div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ------------------------------ تعرفه‌ها ----------------------------- */}
      <section className="section container" id="plans">
        <div className="section-head">
          <h2>تعرفه‌ها</h2>
          <p>همه پلن‌ها روی تمام لوکیشن‌ها فعال‌اند و بدون محدودیت سرعت هستند.</p>
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

      {/* ----------------------------- چرا ما ------------------------------- */}
      <section className="section container">
        <div className="section-head">
          <h2>چرا {settings.site_name}؟</h2>
          <p>زیرساخت اختصاصی، تحویل خودکار از پنل و پشتیبانی واقعی انسانی.</p>
        </div>
        <div className="grid grid-3">
          {FEATURES.slice(3).map((f) => (
            <div className="card feature" key={f.title}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------- لوکیشن‌ها ----------------------------- */}
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

      {/* -------------------------- مراحل خرید ------------------------------ */}
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

      {/* ----------------------------- متن سئو ------------------------------ */}
      <section className="container">
        <div className="seo-panel">
          <div>
            <span className="kicker">دربارهٔ {settings.site_name}</span>
            <h2>خرید اشتراک VLESS، ساده و بدون تنظیمات پیچیده</h2>
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
          <h2>سوالات پرتکرار</h2>
        </div>
        <div style={{ maxWidth: 780, marginInline: "auto" }}>
          {FAQ.slice(0, 4).map((item) => (
            <details className="accordion" key={item.q}>
              <summary>{item.q}</summary>
              <div className="acc-body">{item.a}</div>
            </details>
          ))}
        </div>
        <div className="center" style={{ marginTop: 18 }}>
          <Link className="btn" href="/faq">
            همه سوالات
          </Link>
        </div>
      </section>

      {/* ------------------------------ CTA -------------------------------- */}
      <section className="container" style={{ paddingBottom: "clamp(40px, 8vw, 70px)" }}>
        <div className="cta-panel">
          <h2>همین حالا شروع کنید</h2>
          <p>
            {trial
              ? "با ثبت‌نام رایگان یک اکانت تست بگیرید و بعد از اطمینان، پلن دلخواهتان را بخرید."
              : "پلن دلخواهتان را انتخاب کنید؛ کمتر از چند دقیقه تا اتصال فاصله دارید."}
          </p>
          <div className="btn-row" style={{ justifyContent: "center", marginTop: 18 }}>
            <Link className="btn btn-primary btn-lg" href="/plans">
              مشاهده تعرفه‌ها
            </Link>
            <Link className="btn btn-lg" href="/tutorial">
              آموزش اتصال
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
