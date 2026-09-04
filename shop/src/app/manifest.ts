import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";
import { themeById } from "@/lib/themes";

export const dynamic = "force-dynamic";

/** فایل مانیفست PWA؛ نام و رنگ‌ها از تنظیمات سایت خوانده می‌شود */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSettings();
  const theme = themeById(s.site_theme);

  return {
    name: `${s.site_name} | ${s.site_tagline}`,
    short_name: s.site_name,
    description: s.site_description,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: theme.themeColor,
    theme_color: theme.themeColor,
    dir: "rtl",
    lang: "fa-IR",
    categories: ["utilities", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "سرویس‌های من", url: "/dashboard", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "خرید اشتراک", url: "/plans" },
      { name: "پشتیبانی", url: "/dashboard/tickets" },
    ],
  };
}
