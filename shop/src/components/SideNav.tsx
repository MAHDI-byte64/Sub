"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string; exact?: boolean };

export default function SideNav({ items, title }: { items: NavItem[]; title?: string }) {
  const pathname = usePathname();

  return (
    <aside className="side">
      {title ? <span className="side-title">{title}</span> : null}
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={active ? "active" : ""}>
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </aside>
  );
}
