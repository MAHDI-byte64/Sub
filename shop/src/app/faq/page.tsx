import Link from "next/link";
import { faqs } from "@/lib/content";
import { getSettings } from "@/lib/settings";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";

export const metadata = { title: "سوالات متداول" };

export default async function FaqPage() {
  const [s, locale] = await Promise.all([getSettings(), getLocale()]);
  const tr = translator(locale);
  const items = faqs(locale);
  const half = Math.ceil(items.length / 2);

  return (
    <div className="container section">
      <div className="section-head">
        <span className="eyebrow">
          <span className="eyebrow-dot" />
          {tr("faqPage.subtitle")}
        </span>
        <h1>{tr("faqPage.title")}</h1>
        <p>{tr("faqPage.moreText")}</p>
      </div>

      <div className="faq-grid">
        <div>
          {items.slice(0, half).map((item) => (
            <details className="accordion" key={item.q}>
              <summary>{item.q}</summary>
              <div className="acc-body">{item.a}</div>
            </details>
          ))}
        </div>
        <div>
          {items.slice(half).map((item) => (
            <details className="accordion" key={item.q}>
              <summary>{item.q}</summary>
              <div className="acc-body">{item.a}</div>
            </details>
          ))}
        </div>
      </div>

      <div className="cta-panel" style={{ marginTop: 30 }}>
        <h2>{tr("faqPage.moreTitle")}</h2>
        <p>{tr("faqPage.moreText")}</p>
        <div className="btn-row" style={{ justifyContent: "center", marginTop: 16 }}>
          <Link className="btn btn-primary" href="/dashboard/tickets">
            {tr("footer.ticket")}
          </Link>
          <a
            className="btn"
            href={`https://t.me/${s.support_telegram.replace("@", "")}`}
            target="_blank"
            rel="noreferrer"
          >
            {tr("footer.telegram")}
          </a>
        </div>
      </div>
    </div>
  );
}
