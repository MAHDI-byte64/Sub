#!/usr/bin/env bash
# اجرای تست سرتاسری روی پنل 3x-ui شبیه‌سازی‌شده
set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${MOCK_PORT:-8899}"
PORT_V3="${MOCK_PORT_V3:-8898}"
GW_PORT="${MOCK_GATEWAY_PORT:-8896}"
export DATABASE_URL="file:../data/e2e.db"
export MOCK_PANEL_URL="http://127.0.0.1:${PORT}"
export MOCK_PANEL_V3_URL="http://127.0.0.1:${PORT_V3}"
export MOCK_GATEWAY_URL="http://127.0.0.1:${GW_PORT}"
export HOOSHPAY_BASE="http://127.0.0.1:${GW_PORT}"
export MOCK_GATEWAY_KEY="${MOCK_GATEWAY_KEY:-gw-test-key}"

echo "→ راه‌اندازی پنل شبیه‌سازی‌شده نسخه ۲ (پورت ${PORT})، نسخه ۳ (پورت ${PORT_V3}) و درگاه پرداخت (پورت ${GW_PORT})"
node scripts/mock-xui.mjs "$PORT" v2 >/tmp/mock-xui-v2.log 2>&1 &
MOCK_PID=$!
node scripts/mock-xui.mjs "$PORT_V3" v3 >/tmp/mock-xui-v3.log 2>&1 &
MOCK_V3_PID=$!
node scripts/mock-gateway.mjs "$GW_PORT" >/tmp/mock-gateway.log 2>&1 &
MOCK_GW_PID=$!
trap 'kill $MOCK_PID $MOCK_V3_PID $MOCK_GW_PID 2>/dev/null' EXIT
sleep 1

rm -f data/e2e.db
npx prisma db push --skip-generate >/dev/null 2>&1

NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e.ts
STATUS=$?

rm -f data/e2e.db
exit $STATUS
