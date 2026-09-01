import Link from "next/link";
import { APPS, TUTORIAL_STEPS } from "@/lib/content";
import { faNum } from "@/lib/format";

export const metadata = { title: "آموزش اتصال" };

export default function TutorialPage() {
  return (
    <div className="container section">
      <div className="section-head">
        <span className="eyebrow">
          <span className="eyebrow-dot" />
          کمتر از دو دقیقه تا اتصال
        </span>
        <h1>آموزش اتصال</h1>
        <p>برنامه را نصب کنید، لینک اشتراک را وارد کنید، متصل شوید. همین.</p>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-title">
            <h3>مراحل اتصال</h3>
          </div>
          <div className="timeline">
            {TUTORIAL_STEPS.map((s, i) => (
              <div className="timeline-item" key={s.title}>
                <span className="tl-num">{faNum(i + 1)}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </div>
            ))}
          </div>
          <Link className="btn btn-primary btn-block" href="/dashboard" style={{ marginTop: 18 }}>
            رفتن به پنل کاربری و دریافت لینک
          </Link>
        </div>

        <div className="card">
          <div className="card-title">
            <h3>نکات مهم</h3>
          </div>
          <div className="svc-meta">
            <div className="meta-row">
              <span>🔗 اشتراک‌گذاری</span>
              <b>لینک را با کسی به اشتراک نگذارید</b>
            </div>
            <div className="meta-row">
              <span>🔄 به‌روزرسانی</span>
              <b>هر چند وقت «Update Subscription» بزنید</b>
            </div>
            <div className="meta-row">
              <span>🚀 سرعت کم شد؟</span>
              <b>سرور دیگری از لیست را امتحان کنید</b>
            </div>
            <div className="meta-row">
              <span>⏳ اتمام حجم یا زمان</span>
              <b>از پنل کاربری تمدید کنید</b>
            </div>
          </div>
          <p className="field-hint" style={{ marginTop: 14 }}>
            اگر با این نکات مشکل حل نشد، از بخش <Link href="/dashboard/tickets">تیکت‌ها</Link> به ما بگویید؛
            سرور شما را تعویض می‌کنیم.
          </p>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: "clamp(34px, 6vw, 56px)" }}>
        <h2>دانلود نرم‌افزار</h2>
        <p>بر اساس سیستم‌عامل خود یکی از برنامه‌های زیر را نصب کنید؛ همه رایگان‌اند.</p>
      </div>
      <div className="grid grid-4">
        {APPS.map((group) => (
          <div className="app-card" key={group.os}>
            <div className="app-card-head">
              <span>{group.icon}</span>
              <b>{group.os}</b>
            </div>
            {group.items.map((app) => (
              <a className="btn btn-sm btn-block" href={app.url} target="_blank" rel="noreferrer" key={app.name}>
                {app.name}
                {app.note ? <span className="badge badge-info">{app.note}</span> : null}
              </a>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
