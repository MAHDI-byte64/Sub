import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getSettings } from "@/lib/settings";
import { getLocale } from "@/lib/locale";
import { dirOf } from "@/lib/i18n";
import { themeById, themeCss } from "@/lib/themes";
import BackgroundFX from "@/components/BackgroundFX";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PwaBoot from "@/components/PwaBoot";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: {
      default: `${s.site_name} | ${s.site_tagline}`,
      template: `%s | ${s.site_name}`,
    },
    description: s.site_description,
    robots: { index: true, follow: true },
    applicationName: s.site_name,
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: s.site_name },
    icons: {
      icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const settings = await getSettings();
  return {
    // رنگ نوار بالای مرورگر با تم انتخابی مدیر هماهنگ می‌ماند
    themeColor: themeById(settings.site_theme).themeColor,
    width: "device-width",
    initialScale: 1,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, settings] = await Promise.all([getLocale(), getSettings()]);
  const theme = themeById(settings.site_theme);

  return (
    <html lang={locale} dir={dirOf(locale)} data-theme={theme.id}>
      <head>
        <link
          rel="preload"
          href="/fonts/vazirmatn-arabic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* متغیرهای تم انتخابی مدیر؛ مقدارها از فهرست ثابت themes.ts می‌آیند */}
        <style dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />
      </head>
      <body>
        <BackgroundFX />
        <PwaBoot />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
