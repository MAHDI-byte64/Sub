import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { faNum } from "@/lib/format";

export default async function SiteFooter() {
  const s = await getSettings();
  const year = faNum(new Date().getFullYear());

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="brand" style={{ marginBottom: 10 }}>
              <span className="brand-logo">🌰</span>
              <span>{s.site_name}</span>
            </div>
            <p style={{ fontSize: 14 }}>{s.site_description}</p>
          </div>
          <div>
            <h4>دسترسی سریع</h4>
            <Link href="/plans">تعرفه‌ها</Link>
            <Link href="/tutorial">آموزش اتصال</Link>
            <Link href="/faq">سوالات متداول</Link>
            <Link href="/terms">قوانین و مقررات</Link>
          </div>
          <div>
            <h4>پشتیبانی</h4>
            <Link href="/contact">تماس با ما</Link>
            <a href={`https://t.me/${s.support_telegram.replace("@", "")}`} target="_blank" rel="noreferrer">
              تلگرام: {s.support_telegram}
            </a>
            <a href={`mailto:${s.support_email}`}>{s.support_email}</a>
          </div>
        </div>
        <div className="footer-bottom">
          © {year} {s.site_name} — تمامی حقوق محفوظ است.
        </div>
      </div>
    </footer>
  );
}
