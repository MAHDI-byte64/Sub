/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // رسید پرداخت (عکس) از طریق Server Action آپلود می‌شود
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
