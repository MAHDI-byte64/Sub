import Link from "next/link";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "تماس با ما" };

export default async function ContactPage() {
  const s = await getSettings();
  const tg = s.support_telegram.replace("@", "");

  return (
    <div className="container section" style={{ maxWidth: 900 }}>
      <div className="section-head">
        <span className="eyebrow">
          <span className="eyebrow-dot" />
          پاسخگویی در تمام ساعات شبانه‌روز
        </span>
        <h1>تماس با ما</h1>
        <p>سریع‌ترین راه ارتباط، تیکت داخل پنل کاربری است؛ سابقهٔ گفتگو همان‌جا می‌ماند.</p>
      </div>

      <div className="grid grid-3">
        <Link className="card feature" href="/dashboard/tickets">
          <div className="feature-icon">🎫</div>
          <h3>تیکت پشتیبانی</h3>
          <p>پیگیری کامل داخل پنل کاربری</p>
          <span className="badge badge-success">پیشنهاد ما</span>
        </Link>
        <a className="card feature" href={`https://t.me/${tg}`} target="_blank" rel="noreferrer">
          <div className="feature-icon">✈️</div>
          <h3>تلگرام</h3>
          <p className="ltr mono">{s.support_telegram}</p>
        </a>
        <a className="card feature" href={`mailto:${s.support_email}`}>
          <div className="feature-icon">✉️</div>
          <h3>ایمیل</h3>
          <p className="ltr mono">{s.support_email}</p>
        </a>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title">
          <h3>قبل از تماس، این‌ها را ببینید</h3>
        </div>
        <div className="svc-meta">
          <div className="meta-row">
            <span>🔌 مشکل در اتصال</span>
            <b>
              <Link href="/tutorial">آموزش اتصال</Link>
            </b>
          </div>
          <div className="meta-row">
            <span>❓ سوال رایج</span>
            <b>
              <Link href="/faq">سوالات متداول</Link>
            </b>
          </div>
          <div className="meta-row">
            <span>📦 اتمام حجم یا زمان</span>
            <b>
              <Link href="/plans">تمدید سرویس</Link>
            </b>
          </div>
        </div>
      </div>
    </div>
  );
}
