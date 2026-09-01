import Link from "next/link";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "تماس با ما" };

export default async function ContactPage() {
  const s = await getSettings();
  const tg = s.support_telegram.replace("@", "");
  return (
    <div className="container section" style={{ maxWidth: 820 }}>
      <div className="section-head">
        <h1>تماس با ما</h1>
        <p>سریع‌ترین راه ارتباط، تیکت داخل پنل کاربری است.</p>
      </div>
      <div className="grid grid-3">
        <a className="card feature" href={`https://t.me/${tg}`} target="_blank" rel="noreferrer">
          <div className="feature-icon">✈️</div>
          <h3>تلگرام</h3>
          <p className="ltr">{s.support_telegram}</p>
        </a>
        <a className="card feature" href={`mailto:${s.support_email}`}>
          <div className="feature-icon">✉️</div>
          <h3>ایمیل</h3>
          <p className="ltr">{s.support_email}</p>
        </a>
        <Link className="card feature" href="/dashboard/tickets">
          <div className="feature-icon">🎫</div>
          <h3>تیکت پشتیبانی</h3>
          <p>پیگیری کامل داخل پنل کاربری</p>
        </Link>
      </div>
    </div>
  );
}
