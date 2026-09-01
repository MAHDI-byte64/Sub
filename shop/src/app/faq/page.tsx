import Link from "next/link";
import { FAQ } from "@/lib/content";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "سوالات متداول" };

export default async function FaqPage() {
  const s = await getSettings();
  const half = Math.ceil(FAQ.length / 2);

  return (
    <div className="container section">
      <div className="section-head">
        <span className="eyebrow">
          <span className="eyebrow-dot" />
          پاسخ سریع به سوال‌های رایج
        </span>
        <h1>سوالات متداول</h1>
        <p>اگر پاسخ سوالتان اینجا نبود، از بخش تیکت‌ها بپرسید؛ معمولاً کمتر از یک ساعت جواب می‌دهیم.</p>
      </div>

      <div className="faq-grid">
        <div>
          {FAQ.slice(0, half).map((item) => (
            <details className="accordion" key={item.q}>
              <summary>{item.q}</summary>
              <div className="acc-body">{item.a}</div>
            </details>
          ))}
        </div>
        <div>
          {FAQ.slice(half).map((item) => (
            <details className="accordion" key={item.q}>
              <summary>{item.q}</summary>
              <div className="acc-body">{item.a}</div>
            </details>
          ))}
        </div>
      </div>

      <div className="cta-panel" style={{ marginTop: 30 }}>
        <h2>جواب سوالتان را پیدا نکردید؟</h2>
        <p>تیم پشتیبانی {s.site_name} در تلگرام و داخل پنل کاربری پاسخگوی شماست.</p>
        <div className="btn-row" style={{ justifyContent: "center", marginTop: 16 }}>
          <Link className="btn btn-primary" href="/dashboard/tickets">
            ثبت تیکت
          </Link>
          <a
            className="btn"
            href={`https://t.me/${s.support_telegram.replace("@", "")}`}
            target="_blank"
            rel="noreferrer"
          >
            تلگرام پشتیبانی
          </a>
        </div>
      </div>
    </div>
  );
}
