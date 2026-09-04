"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import LangSwitch from "./LangSwitch";
import LogoutButton from "./LogoutButton";

export type MenuLink = { href: string; label: string; primary?: boolean };

/**
 * منوی موبایل.
 *
 * روی صفحه‌های کوچک، نوار بالا جای همهٔ دکمه‌ها را ندارد و قبلاً بخشی از آن‌ها
 * از لبهٔ صفحه بیرون می‌زد (و چون `body` سرریز افقی را پنهان می‌کند، بی‌صدا
 * بریده می‌شدند). حالا همان لینک‌ها اینجا جمع می‌شوند.
 */
export default function MobileMenu({
  links,
  locale,
  labels,
  showLogout,
}: {
  links: MenuLink[];
  locale: Locale;
  labels: { open: string; close: string; language: string; logout: string };
  showLogout: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // با رفتن به صفحهٔ تازه، منو خودش بسته می‌شود
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`menu-btn${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? labels.close : labels.open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden>{open ? "✕" : "☰"}</span>
      </button>

      {open ? <div className="menu-backdrop" onClick={() => setOpen(false)} /> : null}

      <div className="menu-sheet" id="mobile-menu" hidden={!open}>
        <nav className="menu-links">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`menu-link${link.primary ? " is-primary" : ""}`}
              // بستن همان لحظهٔ کلیک؛ منتظر تغییر مسیر نمی‌مانیم
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="menu-foot">
          <span className="field-hint">{labels.language}</span>
          <LangSwitch locale={locale} />
          {showLogout ? <LogoutButton label={labels.logout} /> : null}
        </div>
      </div>
    </>
  );
}
