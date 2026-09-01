import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { faNum } from "@/lib/format";

const QUICK_LINKS = [
  { href: "/plans", label: "تعرفه‌ها" },
  { href: "/tutorial", label: "آموزش اتصال" },
  { href: "/faq", label: "سوالات متداول" },
  { href: "/terms", label: "قوانین و مقررات" },
  { href: "/dashboard", label: "پنل کاربری" },
];

export default async function SiteFooter() {
  const s = await getSettings();
  const year = faNum(new Date().getFullYear());
  const telegram = s.support_telegram.replace("@", "");

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="brand" style={{ marginBottom: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/fandogh.svg" alt="" className="brand-logo" width={40} height={40} />
              <span>{s.site_name}</span>
            </div>
            <p>{s.site_description}</p>
            <div className="footer-chips">
              <span className="footer-chip">⚡ تحویل آنی</span>
              <span className="footer-chip">🛡️ بدون ثبت لاگ</span>
              <span className="footer-chip">🎧 پشتیبانی ۲۴/۷</span>
            </div>
          </div>

          <div>
            <h4>دسترسی سریع</h4>
            <div className="footer-links">
              {QUICK_LINKS.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h4>پشتیبانی</h4>
            <div className="footer-contact">
              <a href={`https://t.me/${telegram}`} target="_blank" rel="noreferrer">
                <i>✈️</i>
                <span>
                  <b>تلگرام پشتیبانی</b>
                  <small className="ltr">{s.support_telegram}</small>
                </span>
              </a>
              <a href={`mailto:${s.support_email}`}>
                <i>✉️</i>
                <span>
                  <b>ایمیل</b>
                  <small className="ltr">{s.support_email}</small>
                </span>
              </a>
              <Link href="/dashboard/tickets">
                <i>🎫</i>
                <span>
                  <b>تیکت پشتیبانی</b>
                  <small>پیگیری کامل داخل پنل</small>
                </span>
              </Link>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>
            © {year} {s.site_name} — تمامی حقوق محفوظ است.
          </span>
          <nav>
            <Link href="/terms">قوانین</Link>
            <Link href="/contact">تماس با ما</Link>
            <Link href="/faq">سوالات متداول</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
