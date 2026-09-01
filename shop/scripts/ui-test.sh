#!/usr/bin/env bash
# تست سرتاسری با مرورگر واقعی روی نسخه build شده
set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${UI_PORT:-3222}"
MOCK_PORT="${MOCK_PORT:-8899}"
export DATABASE_URL="file:../data/uitest.db"
export MOCK_PANEL_URL="http://127.0.0.1:${MOCK_PORT}"
export MOCK_API_TOKEN="${MOCK_API_TOKEN:-3xui-test-token}"
export BASE_URL="http://127.0.0.1:${PORT}"
export ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin12345}"

rm -f data/uitest.db
npx prisma db push --skip-generate >/dev/null 2>&1
npx prisma db seed >/dev/null 2>&1

cleanup() {
  [ -n "${NEXT_PID:-}" ] && kill -- "-${NEXT_PID}" 2>/dev/null
  [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null
  return 0
}

node scripts/mock-xui.mjs "$MOCK_PORT" v3 >/tmp/mock-xui.log 2>&1 &
MOCK_PID=$!
setsid node_modules/.bin/next start -p "$PORT" >/tmp/next-uitest.log 2>&1 &
NEXT_PID=$!
trap cleanup EXIT

for _ in $(seq 1 30); do
  curl -s -o /dev/null -m 2 "$BASE_URL/" && break
  sleep 1
done

node scripts/ui-test.mjs
STATUS=$?
rm -f data/uitest.db
exit $STATUS
