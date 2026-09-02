import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { unreadCount } from "@/lib/notify";
import LogoutButton from "./LogoutButton";
import { faNum } from "@/lib/format";

export default async function SiteHeader() {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  const unread = user ? await unreadCount(user.id) : 0;

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
            <Link href="/plans">تعرفه‌ها</Link>
            <Link href="/tutorial">آموزش اتصال</Link>
            <Link href="/faq">سوالات متداول</Link>
            <Link href="/contact">تماس با ما</Link>
          </nav>
          <div className="nav-actions">
            {user ? (
              <>
                <Link className="bell" href="/dashboard/notifications" title="اعلان‌ها">
                  🔔
                  {unread > 0 ? <span className="bell-dot">{unread > 9 ? "۹+" : faNum(unread)}</span> : null}
                </Link>
                {user.role === "admin" ? (
                  <Link className="btn btn-sm hide-sm" href="/admin">
                    مدیریت
                  </Link>
                ) : null}
                <Link className="btn btn-sm" href="/plans">
                  خرید اشتراک
                </Link>
                <Link className="btn btn-sm btn-primary" href="/dashboard">
                  پنل کاربری
                </Link>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link className="btn btn-sm" href="/login">
                  ورود
                </Link>
                <Link className="btn btn-sm btn-primary" href="/plans">
                  خرید اشتراک
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
