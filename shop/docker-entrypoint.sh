#!/bin/sh
set -e

mkdir -p /app/data/uploads

echo "→ همگام‌سازی دیتابیس..."
npx prisma db push --skip-generate

echo "→ ساخت/به‌روزرسانی حساب مدیر و پلن‌های پیش‌فرض..."
npx prisma db seed || echo "  (seed رد شد)"

echo "→ اجرای سایت روی پورت ${PORT:-3000}"
exec "$@"
