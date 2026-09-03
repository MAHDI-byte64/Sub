import { requireReseller } from "@/lib/auth";
import SideNav, { type NavItem } from "@/components/SideNav";

const ITEMS: NavItem[] = [
  { href: "/reseller", label: "داشبورد", icon: "📊", exact: true },
  { href: "/reseller/sell", label: "فروش سرویس", icon: "🛒" },
  { href: "/reseller/services", label: "مشتری‌های من", icon: "🌐" },
  { href: "/reseller/prices", label: "لیست قیمت", icon: "🏷️" },
  { href: "/reseller/wallet", label: "اعتبار و تراکنش‌ها", icon: "💰" },
  { href: "/dashboard", label: "پنل کاربری خودم", icon: "👤" },
];

export const metadata = { title: "پنل نمایندگی" };

export default async function ResellerLayout({ children }: { children: React.ReactNode }) {
  await requireReseller();
  return (
    <div className="container dash">
      <SideNav items={ITEMS} title="پنل نمایندگی" />
      <div>{children}</div>
    </div>
  );
}
