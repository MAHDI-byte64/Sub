import { APPS, TUTORIAL_STEPS } from "@/lib/content";
import { faNum } from "@/lib/format";

export const metadata = { title: "آموزش اتصال" };

export default function TutorialPage() {
  return (
    <div className="container section">
      <div className="section-head">
        <h1>آموزش اتصال</h1>
        <p>در چهار مرحله ساده به سرویس متصل شوید.</p>
      </div>

      <div className="grid grid-4">
        {TUTORIAL_STEPS.map((s, i) => (
          <div className="card" key={s.title}>
            <div className="step-num">{faNum(i + 1)}</div>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </div>
        ))}
      </div>

      <div className="section-head" style={{ marginTop: 44 }}>
        <h2>دانلود نرم‌افزار</h2>
        <p>بر اساس سیستم‌عامل خود یکی از برنامه‌های زیر را نصب کنید.</p>
      </div>
      <div className="grid grid-4">
        {APPS.map((group) => (
          <div className="card" key={group.os}>
            <div className="feature-icon">{group.icon}</div>
            <h3>{group.os}</h3>
            <div className="grid" style={{ gap: 8 }}>
              {group.items.map((app) => (
                <a className="btn btn-sm" href={app.url} target="_blank" rel="noreferrer" key={app.name}>
                  {app.name}
                  {app.note ? <span className="badge badge-info">{app.note}</span> : null}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 28 }}>
        <div className="card-title">
          <h3>نکات مهم</h3>
        </div>
        <ul className="muted">
          <li>لینک اشتراک را با کسی به اشتراک نگذارید؛ تعداد کاربر همزمان محدود است.</li>
          <li>هر چند وقت یک‌بار در برنامه گزینه «به‌روزرسانی اشتراک» را بزنید تا سرورهای جدید اضافه شوند.</li>
          <li>اگر سرعت کم شد، سرور دیگری از لیست را امتحان کنید.</li>
          <li>در صورت اتمام حجم یا زمان، سرویس به‌صورت خودکار قطع می‌شود؛ از پنل کاربری تمدید کنید.</li>
        </ul>
      </div>
    </div>
  );
}
