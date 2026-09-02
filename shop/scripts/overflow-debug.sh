#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."
PORT="${DBG_PORT:-3344}"
MOCK_PORT="${DBG_MOCK:-8896}"
export DATABASE_URL="file:../data/dbg.db"
export BASE_URL="http://127.0.0.1:${PORT}"
export ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="admin12345"
rm -f data/dbg.db
npx prisma db push --skip-generate >/dev/null 2>&1
npx prisma db seed >/dev/null 2>&1
cleanup() { [ -n "${NEXT_PID:-}" ] && kill -- "-${NEXT_PID}" 2>/dev/null; [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null; return 0; }
node scripts/mock-xui.mjs "$MOCK_PORT" v3 >/dev/null 2>&1 & MOCK_PID=$!
setsid node_modules/.bin/next start -p "$PORT" >/tmp/next-dbg.log 2>&1 & NEXT_PID=$!
trap cleanup EXIT
for _ in $(seq 1 30); do curl -s -o /dev/null -m 2 "$BASE_URL/" && break; sleep 1; done
node scripts/overflow-debug.mjs
rm -f data/dbg.db
