import { requireStaff } from "@/lib/auth";
import SideNav, { type NavItem } from "@/components/SideNav";

/** `staffOnly` یعنی پشتیبان هم می‌بیند؛ بقیه فقط برای مدیر است */
type AdminNavItem = NavItem & { staff?: boolean };

const ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "داشبورد", icon: "📊", exact: true, staff: true },
  { href: "/admin/orders", label: "سفارش‌ها", icon: "🧾", staff: true },
  { href: "/admin/services", label: "سرویس‌ها", icon: "🌐", staff: true },
  { href: "/admin/panels", label: "سرورها (3x-ui)", icon: "🖥️" },
  { href: "/admin/monitor", label: "پایش سرورها", icon: "📡" },
  { href: "/admin/plans", label: "پلن‌ها", icon: "🏷️" },
  { href: "/admin/payments", label: "روش‌های پرداخت", icon: "💳" },
  { href: "/admin/discounts", label: "کد تخفیف", icon: "🎟️" },
  { href: "/admin/users", label: "کاربران", icon: "👥", staff: true },
  { href: "/admin/resellers", label: "نمایندگان", icon: "🤝" },
  { href: "/admin/tickets", label: "تیکت‌ها", icon: "🎫", staff: true },
  { href: "/admin/logs", label: "گزارش فعالیت", icon: "📋" },
  { href: "/admin/backup", label: "پشتیبان‌گیری", icon: "🗄️" },
  { href: "/admin/security", label: "امنیت حساب", icon: "🔐", staff: true },
  { href: "/admin/settings", label: "تنظیمات", icon: "⚙️" },
];

export const metadata = { title: "پنل مدیریت" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const items = staff.role === "admin" ? ITEMS : ITEMS.filter((item) => item.staff);

  return (
    <div className="container dash">
      <SideNav items={items} title={staff.role === "admin" ? "پنل مدیریت" : "پنل پشتیبانی"} />
      <div>{children}</div>
    </div>
  );
}
