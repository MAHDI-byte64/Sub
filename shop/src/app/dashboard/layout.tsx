import { requireUser } from "@/lib/auth";
import SideNav, { type NavItem } from "@/components/SideNav";

const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "سرویس‌های من", icon: "🌐", exact: true },
  { href: "/dashboard/orders", label: "سفارش‌ها", icon: "🧾" },
  { href: "/dashboard/tickets", label: "تیکت‌ها", icon: "🎫" },
  { href: "/dashboard/profile", label: "پروفایل", icon: "👤" },
  { href: "/plans", label: "خرید سرویس جدید", icon: "🛒" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="container dash">
      <SideNav items={ITEMS} title="پنل کاربری" />
      <div>{children}</div>
    </div>
  );
}
