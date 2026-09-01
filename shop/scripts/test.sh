#!/usr/bin/env bash
# اجرای تست سرتاسری روی پنل 3x-ui شبیه‌سازی‌شده
set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${MOCK_PORT:-8899}"
export DATABASE_URL="file:../data/e2e.db"
export MOCK_PANEL_URL="http://127.0.0.1:${PORT}"

echo "→ راه‌اندازی پنل شبیه‌سازی‌شده روی پورت ${PORT}"
node scripts/mock-xui.mjs "$PORT" >/tmp/mock-xui.log 2>&1 &
MOCK_PID=$!
trap 'kill $MOCK_PID 2>/dev/null' EXIT
sleep 1

rm -f data/e2e.db
npx prisma db push --skip-generate >/dev/null 2>&1

NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e.ts
STATUS=$?

rm -f data/e2e.db
exit $STATUS
