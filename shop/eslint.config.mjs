import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * پیکربندی ESLint (فرمت flat).
 *
 * نکست ۱۶ دستور `next lint` را برداشته و لینت مستقیم با خود ESLint اجرا
 * می‌شود: `npm run lint`. مجموعهٔ قاعده‌ها همان پیکربندی رسمی نکست است
 * (core-web-vitals + قاعده‌های تایپ‌اسکریپت) تا چیزی که در CI می‌بینید با
 * پیشنهادهای ویرایشگر یکی باشد.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "data/**",
      "public/**",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // پارامترهای استفاده‌نشده‌ای که عمداً با _ شروع می‌شوند (مثل _prev در
      // اکشن‌های سرور) خطا نیستند؛ امضای اکشن را نمی‌شود کوتاه‌تر کرد.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // صفحه‌ها و اکشن‌های سرور روی سرور اجرا می‌شوند؛ خواندن ساعت یا دیتابیس
    // داخل آن‌ها طبیعی است و قاعدهٔ «تابع ناخالص در رندر» به آن‌ها ربطی ندارد.
    files: ["src/app/**"],
    rules: { "react-hooks/purity": "off" },
  },
  {
    // اسکریپت‌های تست و ابزارها در نود اجرا می‌شوند
    files: ["scripts/**", "prisma/**"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default config;
