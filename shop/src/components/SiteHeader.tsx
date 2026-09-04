import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { asBool, getSettings } from "@/lib/settings";
import { unreadCount } from "@/lib/notify";
import LogoutButton from "./LogoutButton";
import { fmt } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";
import LangSwitch from "./LangSwitch";
import MobileMenu from "./MobileMenu";

export default async function SiteHeader() {
  const [user, settings, locale] = await Promise.all([getCurrentUser(), getSettings(), getLocale()]);
  const unread = user ? await unreadCount(user.id) : 0;
  const tr = translator(locale);
  const f = fmt(locale);

  // در حالت تعمیر، بازدیدکننده فقط لوگو را می‌بیند؛ لینک‌ها به جایی نمی‌رسند
  if (asBool(settings.maintenance_mode) && user?.role !== "admin") {
    return (
      <header className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/fandogh.svg" alt="" className="brand-logo" width={40} height={40} />
            <span>{settings.site_name}</span>
          </Link>
          <span className="badge badge-warn">{tr("maintenance.badge")}</span>
        </div>
      </header>
    );
  }

  return (
    <>
      {settings.announcement?.trim() ? (
        <div className="announce">📣 {settings.announcement}</div>
      ) : null}
      <header className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/fandogh.svg" alt="" className="brand-logo" width={40} height={40} />
            <span>{settings.site_name}</span>
          </Link>
          <nav className="nav-links">
            <Link href="/plans">{tr("nav.plans")}</Link>
            <Link href="/tutorial">{tr("nav.tutorial")}</Link>
            <Link href="/faq">{tr("nav.faq")}</Link>
            <Link href="/contact">{tr("nav.contact")}</Link>
          </nav>
          <div className="nav-actions">
            {user ? (
              <>
                <Link className="bell" href="/dashboard/notifications" title={tr("common.notifications")}>
                  🔔
                  {unread > 0 ? (
                    <span className="bell-dot">{unread > 9 ? f.num(9) + "+" : f.num(unread)}</span>
                  ) : null}
                </Link>
                {user.role === "admin" ? (
                  <Link className="btn btn-sm hide-sm" href="/admin">
                    {tr("common.admin")}
                  </Link>
                ) : null}
                {user.isReseller ? (
                  <Link className="btn btn-sm hide-sm" href="/reseller">
                    {tr("common.reseller")}
                  </Link>
                ) : null}
                <Link className="btn btn-sm hide-sm" href="/plans">
                  {tr("common.buyNow")}
                </Link>
                <Link className="btn btn-sm btn-primary" href="/dashboard">
                  {tr("common.dashboard")}
                </Link>
                <span className="hide-sm">
                  <LogoutButton label={tr("common.logout")} />
                </span>
              </>
            ) : (
              <>
                <Link className="btn btn-sm hide-sm" href="/login">
                  {tr("common.login")}
                </Link>
                <Link className="btn btn-sm btn-primary" href="/plans">
                  {tr("common.buyNow")}
                </Link>
              </>
            )}
            <span className="hide-sm">
              <LangSwitch locale={locale} />
            </span>

            {/* روی موبایل، همهٔ لینک‌ها داخل این منو جمع می‌شوند */}
            <MobileMenu
              locale={locale}
              showLogout={Boolean(user)}
              labels={{
                open: tr("common.menuOpen"),
                close: tr("common.menuClose"),
                language: tr("common.language"),
                logout: tr("common.logout"),
              }}
              links={[
                { href: "/plans", label: tr("nav.plans"), primary: !user },
                { href: "/tutorial", label: tr("nav.tutorial") },
                { href: "/faq", label: tr("nav.faq") },
                { href: "/contact", label: tr("nav.contact") },
                ...(user
                  ? [
                      { href: "/dashboard", label: tr("common.dashboard"), primary: true },
                      ...(user.role === "admin"
                        ? [{ href: "/admin", label: tr("common.admin") }]
                        : []),
                      ...(user.isReseller
                        ? [{ href: "/reseller", label: tr("common.reseller") }]
                        : []),
                      { href: "/dashboard/notifications", label: tr("common.notifications") },
                    ]
                  : [{ href: "/login", label: tr("common.login") }]),
              ]}
            />
          </div>
        </div>
      </header>
    </>
  );
}
