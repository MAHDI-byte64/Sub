/** محتوای ثابت سایت (فارسی و انگلیسی): ویژگی‌ها، مراحل، سوالات متداول و نرم‌افزارها */
import type { Locale } from "./i18n";

export type Feature = { icon: string; title: string; text: string };
export type Step = { title: string; text: string };
export type Faq = { q: string; a: string };
export type AppGroup = {
  os: string;
  icon: string;
  items: { name: string; url: string; note?: string }[];
};

const FEATURES_FA: Feature[] = [
  { icon: "⚡", title: "پرسرعت و پایدار", text: "سرورهای اختصاصی با پهنای باند بالا و پروتکل VLESS Reality برای بیشترین سرعت و کمترین قطعی." },
  { icon: "🛡️", title: "امنیت واقعی", text: "رمزنگاری کامل ترافیک، بدون ثبت لاگ فعالیت و بدون نیاز به اطلاعات شخصی." },
  { icon: "📱", title: "همه دستگاه‌ها", text: "اندروید، آی‌او‌اس، ویندوز، مک و لینوکس؛ با یک لینک اشتراک روی همه دستگاه‌ها." },
  { icon: "🚀", title: "تحویل سریع", text: "پس از تأیید رسید، کانفیگ بلافاصله ساخته و در پنل کاربری شما نمایش داده می‌شود." },
  { icon: "🔄", title: "تمدید آسان", text: "با یک کلیک همان سرویس را تمدید کنید؛ لینک اشتراک شما تغییر نمی‌کند." },
  { icon: "🎧", title: "پشتیبانی ۲۴ ساعته", text: "تیکت داخل سایت و تلگرام؛ پاسخ‌گویی سریع در تمام ساعات شبانه‌روز." },
];

const FEATURES_EN: Feature[] = [
  { icon: "⚡", title: "Fast and stable", text: "Dedicated high-bandwidth servers running VLESS Reality for maximum speed and minimum downtime." },
  { icon: "🛡️", title: "Real privacy", text: "Fully encrypted traffic, no activity logs, and no personal information required." },
  { icon: "📱", title: "Every device", text: "Android, iOS, Windows, macOS and Linux — one subscription link covers all of them." },
  { icon: "🚀", title: "Instant delivery", text: "As soon as the payment is confirmed, your config is created and shown in your account." },
  { icon: "🔄", title: "Easy renewal", text: "Renew the same service with one click — your subscription link never changes." },
  { icon: "🎧", title: "24/7 support", text: "Tickets inside the site and Telegram, answered around the clock." },
];

const STEPS_FA: Step[] = [
  { title: "پلن را انتخاب کنید", text: "پلن مناسب حجم و مدت مصرفتان را از صفحه تعرفه‌ها انتخاب کنید." },
  { title: "پرداخت", text: "با درگاه بانکی، کیف پول یا کارت‌به‌کارت پرداخت کنید." },
  { title: "دریافت کانفیگ", text: "پس از تأیید، لینک اشتراک و QR کد در پنل کاربری شما فعال می‌شود." },
];

const STEPS_EN: Step[] = [
  { title: "Pick a plan", text: "Choose the plan that matches the data and duration you need." },
  { title: "Pay", text: "Pay online through the gateway, from your wallet, or by card transfer." },
  { title: "Get your config", text: "Once confirmed, the subscription link and QR code appear in your account." },
];

const FAQ_FA: Faq[] = [
  {
    q: "بعد از پرداخت چقدر طول می‌کشد سرویس تحویل داده شود؟",
    a: "با پرداخت آنلاین یا کیف پول، سرویس در همان لحظه ساخته می‌شود. با کارت‌به‌کارت، پس از بررسی رسید توسط پشتیبانی (معمولاً کمتر از ۳۰ دقیقه).",
  },
  {
    q: "آیا می‌توانم قبل از خرید تست کنم؟",
    a: "بله. پس از ثبت‌نام، از پنل کاربری می‌توانید یک اکانت تست رایگان دریافت کنید (برای هر حساب یک بار).",
  },
  {
    q: "روی چند دستگاه می‌توانم استفاده کنم؟",
    a: "به تعداد «کاربر همزمان» هر پلن. اگر بیشتر از حد مجاز متصل شوید، اتصال محدود می‌شود؛ پلنی با تعداد کاربر بیشتر انتخاب کنید.",
  },
  {
    q: "حجم مصرفی چطور حساب می‌شود؟",
    a: "مجموع دانلود و آپلود شما روی سرور محاسبه می‌شود و در پنل کاربری به‌صورت لحظه‌ای قابل مشاهده است.",
  },
  {
    q: "اگر سرویس کار نکرد چه کنم؟",
    a: "ابتدا لینک اشتراک را در برنامه به‌روزرسانی (Update Subscription) کنید. اگر مشکل برطرف نشد، از بخش تیکت‌ها به ما اطلاع دهید؛ سرور شما را تعویض می‌کنیم.",
  },
  {
    q: "اگر لینک یا کانفیگم لو رفت چه کار کنم؟",
    a: "از صفحه سرویس، بخش «امنیت سرویس»، دکمه بازتولید کانفیگ را بزنید. شناسه اتصال (UUID) و آدرس لینک اشتراک از نو ساخته می‌شود و هر دستگاهی که کانفیگ قدیمی را دارد قطع می‌شود؛ حجم و اعتبار سرویس هم دست‌نخورده می‌ماند.",
  },
  {
    q: "امکان تمدید بدون تغییر کانفیگ وجود دارد؟",
    a: "بله. از بخش «سرویس‌های من» روی تمدید بزنید؛ حجم و زمان به همان کانفیگ فعلی اضافه می‌شود و نیازی به تنظیم دوباره نیست.",
  },
];

const FAQ_EN: Faq[] = [
  {
    q: "How long does delivery take after payment?",
    a: "With online payment or wallet balance the service is created instantly. With a card transfer it is delivered once support checks the receipt — usually under 30 minutes.",
  },
  {
    q: "Can I try before buying?",
    a: "Yes. After signing up you can request a free trial account from your dashboard (one per account).",
  },
  {
    q: "How many devices can I use?",
    a: "As many as the plan's simultaneous-device limit. Connecting more devices throttles the service, so pick a plan with a higher limit if you need it.",
  },
  {
    q: "How is my data usage calculated?",
    a: "Your download and upload on the server are added together, and the total is visible live in your dashboard.",
  },
  {
    q: "What if the service stops working?",
    a: "First update the subscription in your app (Update Subscription). If that does not help, open a ticket and we will move you to another server.",
  },
  {
    q: "What if my link or config leaks?",
    a: "Open the service page and use “Regenerate config” in the security section. A new UUID and subscription address are issued, every device holding the old config is cut off, and your data and expiry stay untouched.",
  },
  {
    q: "Can I renew without changing my config?",
    a: "Yes. Renew from “My services” — data and days are added to the same config, so there is nothing to set up again.",
  },
];

const APPS_FA: AppGroup[] = [
  { os: "اندروید", icon: "🤖", items: [
    { name: "v2rayNG", url: "https://github.com/2dust/v2rayNG/releases", note: "پیشنهاد ما" },
    { name: "Hiddify", url: "https://github.com/hiddify/hiddify-next/releases" },
  ]},
  { os: "آی‌او‌اس", icon: "🍎", items: [
    { name: "Streisand", url: "https://apps.apple.com/app/streisand/id6450534064", note: "رایگان" },
    { name: "V2Box", url: "https://apps.apple.com/app/v2box-v2ray-client/id6446814690" },
  ]},
  { os: "ویندوز", icon: "🪟", items: [
    { name: "v2rayN", url: "https://github.com/2dust/v2rayN/releases", note: "پیشنهاد ما" },
    { name: "Hiddify Desktop", url: "https://github.com/hiddify/hiddify-next/releases" },
  ]},
  { os: "مک", icon: "💻", items: [
    { name: "V2RayXS", url: "https://github.com/tzmax/V2RayXS/releases" },
    { name: "Hiddify", url: "https://github.com/hiddify/hiddify-next/releases" },
  ]},
];

const APPS_EN: AppGroup[] = [
  { os: "Android", icon: "🤖", items: [
    { name: "v2rayNG", url: "https://github.com/2dust/v2rayNG/releases", note: "recommended" },
    { name: "Hiddify", url: "https://github.com/hiddify/hiddify-next/releases" },
  ]},
  { os: "iOS", icon: "🍎", items: [
    { name: "Streisand", url: "https://apps.apple.com/app/streisand/id6450534064", note: "free" },
    { name: "V2Box", url: "https://apps.apple.com/app/v2box-v2ray-client/id6446814690" },
  ]},
  { os: "Windows", icon: "🪟", items: [
    { name: "v2rayN", url: "https://github.com/2dust/v2rayN/releases", note: "recommended" },
    { name: "Hiddify Desktop", url: "https://github.com/hiddify/hiddify-next/releases" },
  ]},
  { os: "macOS", icon: "💻", items: [
    { name: "V2RayXS", url: "https://github.com/tzmax/V2RayXS/releases" },
    { name: "Hiddify", url: "https://github.com/hiddify/hiddify-next/releases" },
  ]},
];

const TUTORIAL_FA: Step[] = [
  { title: "برنامه را نصب کنید", text: "بر اساس سیستم‌عامل خود یکی از برنامه‌های بالا را دانلود و نصب کنید." },
  { title: "لینک اشتراک را کپی کنید", text: "از پنل کاربری، دکمه «کپی لینک اشتراک» را بزنید." },
  { title: "لینک را در برنامه وارد کنید", text: "در برنامه گزینه Add subscription / افزودن اشتراک را بزنید و لینک را جای‌گذاری کنید." },
  { title: "به‌روزرسانی و اتصال", text: "روی Update بزنید تا سرورها بیایند، سپس یکی را انتخاب و متصل شوید." },
];

const TUTORIAL_EN: Step[] = [
  { title: "Install an app", text: "Download one of the apps above for your operating system." },
  { title: "Copy your subscription link", text: "Open your account and press “Copy subscription link”." },
  { title: "Add the link to the app", text: "Choose “Add subscription” in the app and paste the link." },
  { title: "Update and connect", text: "Tap Update to fetch the servers, then pick one and connect." },
];

export function features(locale: Locale): Feature[] {
  return locale === "en" ? FEATURES_EN : FEATURES_FA;
}

export function steps(locale: Locale): Step[] {
  return locale === "en" ? STEPS_EN : STEPS_FA;
}

export function faqs(locale: Locale): Faq[] {
  return locale === "en" ? FAQ_EN : FAQ_FA;
}

export function apps(locale: Locale): AppGroup[] {
  return locale === "en" ? APPS_EN : APPS_FA;
}

export function tutorialSteps(locale: Locale): Step[] {
  return locale === "en" ? TUTORIAL_EN : TUTORIAL_FA;
}

/** سازگاری با کدهایی که هنوز فارسی ثابت می‌خواهند (پنل مدیریت) */
export const FEATURES = FEATURES_FA;
export const STEPS = STEPS_FA;
export const FAQ = FAQ_FA;
export const APPS = APPS_FA;
export const TUTORIAL_STEPS = TUTORIAL_FA;
