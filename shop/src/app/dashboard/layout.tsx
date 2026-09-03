import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";
import SideNav, { type NavItem } from "@/components/SideNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const locale = await getLocale();
  const tr = translator(locale);

  const items: NavItem[] = [
    { href: "/dashboard", label: tr("dash.myServices"), icon: "🌐", exact: true },
    { href: "/dashboard/wallet", label: tr("dash.wallet"), icon: "💰" },
    { href: "/dashboard/orders", label: tr("dash.orders"), icon: "🧾" },
    { href: "/dashboard/notifications", label: tr("common.notifications"), icon: "🔔" },
    { href: "/dashboard/tickets", label: tr("dash.tickets"), icon: "🎫" },
    { href: "/dashboard/profile", label: tr("dash.profile"), icon: "👤" },
    { href: "/plans", label: tr("dash.newService"), icon: "🛒" },
  ];

  return (
    <div className="container dash">
      <SideNav items={items} title={tr("dash.panelTitle")} />
      <div>{children}</div>
    </div>
  );
}
