/** لیست دامنه‌های مجاز برای Server Actions (وقتی سایت پشت Nginx یا با IP باز می‌شود) */
const allowedOrigins = [];
for (const value of [process.env.APP_URL, process.env.EXTRA_ORIGINS].filter(Boolean)) {
  for (const item of String(value).split(",")) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    try {
      allowedOrigins.push(new URL(trimmed).host);
    } catch {
      allowedOrigins.push(trimmed.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
    }
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // رسید پرداخت (عکس) از طریق Server Action آپلود می‌شود
      bodySizeLimit: "8mb",
      ...(allowedOrigins.length ? { allowedOrigins } : {}),
    },
  },
};

export default nextConfig;
