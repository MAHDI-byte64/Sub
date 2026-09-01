#!/usr/bin/env bash
# گرفتن اسکرین‌شات از همه صفحات برای بررسی طراحی
set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${SHOT_PORT:-3333}"
MOCK_PORT="${SHOT_MOCK_PORT:-8897}"
export DATABASE_URL="file:../data/shots.db"
export MOCK_PANEL_URL="http://127.0.0.1:${MOCK_PORT}"
export BASE_URL="http://127.0.0.1:${PORT}"
export ADMIN_EMAIL="admin@example.com"
export ADMIN_PASSWORD="admin12345"
export SHOTS_DIR="${SHOTS_DIR:-/tmp/shots}"

rm -f data/shots.db
npx prisma db push --skip-generate >/dev/null 2>&1
npx prisma db seed >/dev/null 2>&1

cleanup() {
  [ -n "${NEXT_PID:-}" ] && kill -- "-${NEXT_PID}" 2>/dev/null
  [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null
  return 0
}

node scripts/mock-xui.mjs "$MOCK_PORT" v3 >/tmp/mock-shots.log 2>&1 &
MOCK_PID=$!
setsid node_modules/.bin/next start -p "$PORT" >/tmp/next-shots.log 2>&1 &
NEXT_PID=$!
trap cleanup EXIT

for _ in $(seq 1 30); do
  curl -s -o /dev/null -m 2 "$BASE_URL/" && break
  sleep 1
done

rm -rf "$SHOTS_DIR"
node scripts/shots.mjs
STATUS=$?
rm -f data/shots.db
exit $STATUS
