import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";

export const metadata = { title: "تماس با ما" };

export default async function ContactPage() {
  const [s, locale] = await Promise.all([getSettings(), getLocale()]);
  const tr = translator(locale);
  const tg = s.support_telegram.replace("@", "");

  return (
    <div className="container section" style={{ maxWidth: 900 }}>
      <div className="section-head">
        <span className="eyebrow">
          <span className="eyebrow-dot" />
          {tr("contact.eyebrow")}
        </span>
        <h1>{tr("contact.title")}</h1>
        <p>{tr("contact.subtitle")}</p>
      </div>

      <div className="grid grid-3">
        <Link className="card feature" href="/dashboard/tickets">
          <div className="feature-icon">🎫</div>
          <h3>{tr("contact.ticket")}</h3>
          <p>{tr("contact.ticketNote")}</p>
          <span className="badge badge-success">{tr("contact.recommended")}</span>
        </Link>
        <a className="card feature" href={`https://t.me/${tg}`} target="_blank" rel="noreferrer">
          <div className="feature-icon">✈️</div>
          <h3>{tr("contact.telegram")}</h3>
          <p className="ltr mono">{s.support_telegram}</p>
        </a>
        <a className="card feature" href={`mailto:${s.support_email}`}>
          <div className="feature-icon">✉️</div>
          <h3>{tr("contact.email")}</h3>
          <p className="ltr mono">{s.support_email}</p>
        </a>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title">
          <h3>{tr("contact.hours")}</h3>
          <span className="badge badge-info">{s.support_hours}</span>
        </div>
        <div className="svc-meta">
          <div className="meta-row">
            <span>{tr("contact.beforeConnect")}</span>
            <b>
              <Link href="/tutorial">{tr("nav.tutorial")}</Link>
            </b>
          </div>
          <div className="meta-row">
            <span>{tr("contact.beforeFaq")}</span>
            <b>
              <Link href="/faq">{tr("nav.faq")}</Link>
            </b>
          </div>
          <div className="meta-row">
            <span>{tr("contact.beforeQuota")}</span>
            <b>
              <Link href="/plans">{tr("contact.renewLink")}</Link>
            </b>
          </div>
        </div>
      </div>
    </div>
  );
}
