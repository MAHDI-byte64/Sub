import Link from "next/link";
import { asBool, getSettings } from "@/lib/settings";
import { fmt } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";
import LangSwitch from "./LangSwitch";

export default async function SiteFooter() {
  const [s, locale] = await Promise.all([getSettings(), getLocale()]);
  const tr = translator(locale);
  const f = fmt(locale);
  const year = f.num(new Date().getFullYear());

  // در حالت تعمیر فقط یک فوتر ساده نمایش داده می‌شود
  if (asBool(s.maintenance_mode)) {
    return (
      <footer className="footer">
        <div className="container footer-bottom" style={{ borderTop: "none" }}>
          <span>
            © {year} {s.site_name} — {tr("footer.maintenanceBack")}
          </span>
        </div>
      </footer>
    );
  }

  const telegram = s.support_telegram.replace("@", "");
  const quickLinks = [
    { href: "/plans", label: tr("nav.plans") },
    { href: "/tutorial", label: tr("nav.tutorial") },
    { href: "/faq", label: tr("nav.faq") },
    { href: "/terms", label: tr("nav.terms") },
    { href: "/dashboard", label: tr("common.dashboard") },
  ];

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
            <p>{locale === "fa" ? s.site_description : tr("home.heroText")}</p>
            <div className="footer-chips">
              <span className="footer-chip">⚡ {tr("homeExtra.instant")}</span>
              <span className="footer-chip">🛡️ {tr("homeExtra.secureBadge")}</span>
              <span className="footer-chip">🎧 {tr("common.support")} {f.num(24)}/{f.num(7)}</span>
            </div>
          </div>

          <div>
            <h4>{tr("footer.quickLinks")}</h4>
            <div className="footer-links">
              {quickLinks.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h4>{tr("footer.support")}</h4>
            <div className="footer-contact">
              <a href={`https://t.me/${telegram}`} target="_blank" rel="noreferrer">
                <i>✈️</i>
                <span>
                  <b>{tr("footer.telegram")}</b>
                  <small className="ltr">{s.support_telegram}</small>
                </span>
              </a>
              <a href={`mailto:${s.support_email}`}>
                <i>✉️</i>
                <span>
                  <b>{tr("footer.email")}</b>
                  <small className="ltr">{s.support_email}</small>
                </span>
              </a>
              <Link href="/dashboard/tickets">
                <i>🎫</i>
                <span>
                  <b>{tr("footer.ticket")}</b>
                  <small>{tr("footer.ticketHint")}</small>
                </span>
              </Link>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>
            © {year} {s.site_name} — {tr("footer.rights")}
          </span>
          <nav>
            <Link href="/terms">{tr("nav.terms")}</Link>
            <Link href="/contact">{tr("nav.contact")}</Link>
            <Link href="/faq">{tr("nav.faq")}</Link>
            <Link href="/status">{tr("nav.status")}</Link>
            <LangSwitch locale={locale} />
          </nav>
        </div>
      </div>
    </footer>
  );
}
