import { requireAdmin } from "@/lib/auth";
import SideNav, { type NavItem } from "@/components/SideNav";

const ITEMS: NavItem[] = [
  { href: "/admin", label: "داشبورد", icon: "📊", exact: true },
  { href: "/admin/orders", label: "سفارش‌ها", icon: "🧾" },
  { href: "/admin/services", label: "سرویس‌ها", icon: "🌐" },
  { href: "/admin/panels", label: "سرورها (3x-ui)", icon: "🖥️" },
  { href: "/admin/monitor", label: "پایش سرورها", icon: "📡" },
  { href: "/admin/plans", label: "پلن‌ها", icon: "🏷️" },
  { href: "/admin/payments", label: "روش‌های پرداخت", icon: "💳" },
  { href: "/admin/discounts", label: "کد تخفیف", icon: "🎟️" },
  { href: "/admin/users", label: "کاربران", icon: "👥" },
  { href: "/admin/resellers", label: "نمایندگان", icon: "🤝" },
  { href: "/admin/tickets", label: "تیکت‌ها", icon: "🎫" },
  { href: "/admin/logs", label: "گزارش فعالیت", icon: "📋" },
  { href: "/admin/backup", label: "پشتیبان‌گیری", icon: "🗄️" },
  { href: "/admin/settings", label: "تنظیمات", icon: "⚙️" },
];

export const metadata = { title: "پنل مدیریت" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="container dash">
      <SideNav items={ITEMS} title="پنل مدیریت" />
      <div>{children}</div>
    </div>
  );
}
