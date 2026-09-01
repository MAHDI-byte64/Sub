#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  فندق | نصب‌کننده سایت فروش VLESS متصل به پنل 3x-ui (سنایی)
#
#  نصب سریع:
#    bash <(curl -fsSL https://raw.githubusercontent.com/mahdi-byte64/Sub/HEAD/shop/install.sh)
#
#  گزینه‌ها:
#    --node      نصب بدون Docker (Node.js + systemd)
#    --update    فقط به‌روزرسانی نسخه نصب‌شده
#    --uninstall حذف کامل (دیتابیس نگه داشته می‌شود)
#    --logs      نمایش آخرین لاگ‌های سرویس
#    --status    بررسی وضعیت و پاسخ‌دهی سایت
# ---------------------------------------------------------------------------
set -euo pipefail

REPO="${REPO:-https://github.com/mahdi-byte64/Sub.git}"
# اگر BRANCH تعیین نشود، شاخه پیش‌فرض مخزن به‌صورت خودکار تشخیص داده می‌شود
BRANCH="${BRANCH:-}"
BASE_DIR="${BASE_DIR:-/opt/fandogh-shop}"
APP_DIR="${BASE_DIR}/shop"
APP_PORT="${APP_PORT:-3000}"
# 0.0.0.0 یعنی از بیرون سرور در دسترس باشد؛ برای حالت پشت Nginx مقدار 127.0.0.1 بدهید
BIND_ADDR="${BIND_ADDR:-0.0.0.0}"
SERVICE_NAME="fandogh-shop"
MODE="docker"
ACTION="install"

C_OK="\033[1;32m"; C_ERR="\033[1;31m"; C_INFO="\033[1;36m"; C_WARN="\033[1;33m"; C_OFF="\033[0m"
ok()   { echo -e "${C_OK}✓${C_OFF} $*"; }
info() { echo -e "${C_INFO}→${C_OFF} $*"; }
warn() { echo -e "${C_WARN}!${C_OFF} $*"; }
die()  { echo -e "${C_ERR}✗${C_OFF} $*" >&2; exit 1; }

for arg in "$@"; do
  case "$arg" in
    --node) MODE="node" ;;
    --docker) MODE="docker" ;;
    --update) ACTION="update" ;;
    --uninstall) ACTION="uninstall" ;;
    --logs) ACTION="logs" ;;
    --status) ACTION="status" ;;
    -h|--help)
      sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) die "گزینه ناشناخته: $arg" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "این اسکریپت باید با کاربر root اجرا شود."

rand_hex() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "${1:-32}"
  else head -c "$((${1:-32} * 2))" /dev/urandom | od -An -tx1 | tr -d ' \n' | cut -c "1-$((${1:-32} * 2))"; fi
}

need_packages() {
  info "نصب پیش‌نیازها"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq git curl ca-certificates openssl >/dev/null
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q git curl ca-certificates openssl >/dev/null
  elif command -v yum >/dev/null 2>&1; then
    yum install -y -q git curl ca-certificates openssl >/dev/null
  else
    warn "پکیج‌منیجر شناخته نشد؛ مطمئن شوید git و curl نصب هستند."
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker از قبل نصب است"
    return
  fi
  info "نصب Docker"
  curl -fsSL https://get.docker.com | sh >/dev/null
  systemctl enable --now docker >/dev/null 2>&1 || true
  docker compose version >/dev/null 2>&1 || die "Docker Compose نصب نشد؛ با گزینه --node دوباره امتحان کنید."
  ok "Docker نصب شد"
}

install_node() {
  if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then
    ok "Node.js $(node -v) موجود است"
    return
  fi
  info "نصب Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1 || die "نصب Node.js ناموفق بود."
  apt-get install -y -qq nodejs >/dev/null
  ok "Node.js $(node -v) نصب شد"
}

detect_branch() {
  [ -n "$BRANCH" ] && return
  local slug
  slug="$(echo "$REPO" | sed -E 's#.*github\.com[:/]##; s#\.git$##')"
  BRANCH="$(curl -fsSL "https://api.github.com/repos/${slug}" 2>/dev/null \
    | grep -m1 '"default_branch"' | cut -d'"' -f4)"
  [ -n "$BRANCH" ] || BRANCH="main"
  info "شاخه مخزن: ${BRANCH}"
}

fetch_source() {
  detect_branch
  if [ -d "${BASE_DIR}/.git" ]; then
    info "به‌روزرسانی سورس"
    git -C "$BASE_DIR" fetch origin "$BRANCH" --depth 1 >/dev/null 2>&1
    git -C "$BASE_DIR" reset --hard "origin/${BRANCH}" >/dev/null 2>&1
  else
    info "دریافت سورس از ${REPO} (شاخه ${BRANCH})"
    rm -rf "$BASE_DIR"
    git clone --depth 1 --branch "$BRANCH" "$REPO" "$BASE_DIR" >/dev/null 2>&1 \
      || die "دریافت سورس ناموفق بود. آدرس مخزن یا اتصال اینترنت را بررسی کنید."
  fi
  [ -d "$APP_DIR" ] || die "پوشه shop در مخزن پیدا نشد."
  ok "سورس آماده شد در ${APP_DIR}"
}

make_env() {
  if [ -f "${APP_DIR}/.env" ]; then
    ok "فایل .env موجود است (دست‌نخورده باقی می‌ماند)"
    return
  fi

  local admin_email admin_pass secret
  admin_email="${ADMIN_EMAIL:-}"
  admin_pass="${ADMIN_PASSWORD:-}"

  if [ -z "$admin_email" ] && [ -t 0 ]; then
    read -r -p "ایمیل مدیر سایت: " admin_email
  fi
  admin_email="${admin_email:-admin@example.com}"

  if [ -z "$admin_pass" ] && [ -t 0 ]; then
    read -r -s -p "رمز عبور مدیر (خالی = ساخت خودکار): " admin_pass; echo
  fi
  [ -n "$admin_pass" ] || admin_pass="$(rand_hex 8)"

  secret="$(rand_hex 32)"
  cat > "${APP_DIR}/.env" <<ENVFILE
DATABASE_URL="file:../data/fandogh.db"
AUTH_SECRET="${secret}"
APP_URL="${APP_URL:-http://$(hostname -I 2>/dev/null | awk '{print $1}'):${APP_PORT}}"
ADMIN_EMAIL="${admin_email}"
ADMIN_PASSWORD="${admin_pass}"
PORT=3000
APP_PORT=${APP_PORT}
BIND_ADDR=${BIND_ADDR}
UPLOAD_DIR="/app/data/uploads"
ENVFILE
  chmod 600 "${APP_DIR}/.env"
  ok "فایل .env ساخته شد"
  echo -e "   ${C_INFO}ایمیل مدیر:${C_OFF} ${admin_email}"
  echo -e "   ${C_INFO}رمز مدیر:${C_OFF}   ${admin_pass}"
  warn "این رمز را یادداشت کنید؛ بعد از ورود از بخش پروفایل تغییرش دهید."
}

open_firewall() {
  [ "$BIND_ADDR" = "127.0.0.1" ] && return 0
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi "Status: active"; then
    ufw allow "${APP_PORT}/tcp" >/dev/null 2>&1 && ok "پورت ${APP_PORT} در ufw باز شد"
  elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port="${APP_PORT}/tcp" >/dev/null 2>&1
    firewall-cmd --reload >/dev/null 2>&1 && ok "پورت ${APP_PORT} در firewalld باز شد"
  fi
  return 0
}

show_logs() {
  if [ -f "${APP_DIR}/docker-compose.yml" ] && command -v docker >/dev/null 2>&1 \
     && docker compose -f "${APP_DIR}/docker-compose.yml" ps >/dev/null 2>&1; then
    docker compose -f "${APP_DIR}/docker-compose.yml" logs --tail="${1:-60}"
  else
    journalctl -u "${SERVICE_NAME}" -n "${1:-60}" --no-pager 2>/dev/null || true
  fi
}

wait_for_app() {
  info "بررسی بالا آمدن سایت (حداکثر ۲ دقیقه)"
  local i
  for i in $(seq 1 60); do
    if curl -fs -o /dev/null --max-time 3 "http://127.0.0.1:${APP_PORT}/" 2>/dev/null; then
      ok "سایت پاسخ می‌دهد"
      return 0
    fi
    sleep 2
  done
  warn "سایت در ۲ دقیقه بالا نیامد. آخرین لاگ‌ها:"
  show_logs 40
  echo
  warn "بعد از رفع مشکل: cd ${APP_DIR} && docker compose up -d"
  return 1
}

run_docker() {
  cd "$APP_DIR"
  info "ساخت و اجرای کانتینر (چند دقیقه طول می‌کشد)"
  docker compose up -d --build
  open_firewall
  wait_for_app || true
}

run_node() {
  cd "$APP_DIR"
  info "نصب وابستگی‌ها"
  npm ci --no-audit --no-fund
  info "ساخت نسخه production"
  sed -i 's#UPLOAD_DIR="/app/data/uploads"#UPLOAD_DIR="./data/uploads"#' .env
  npm run build
  npx prisma db push --skip-generate
  npx prisma db seed || true
  mkdir -p data/uploads

  local npm_bin
  npm_bin="$(command -v npm)"
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<UNIT
[Unit]
Description=Fandogh VPN Shop
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
ExecStart=${npm_bin} run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  systemctl enable --now "${SERVICE_NAME}" >/dev/null 2>&1
  ok "سرویس systemd با نام ${SERVICE_NAME} فعال شد"
  open_firewall
  wait_for_app || true
}

uninstall() {
  if [ -d "$APP_DIR" ] && command -v docker >/dev/null 2>&1; then
    (cd "$APP_DIR" && docker compose down 2>/dev/null) || true
  fi
  systemctl disable --now "${SERVICE_NAME}" 2>/dev/null || true
  rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload 2>/dev/null || true
  if [ -d "${APP_DIR}/data" ]; then
    mv "${APP_DIR}/data" "/root/fandogh-shop-data-$(date +%s)"
    warn "دیتابیس در /root نگه داشته شد."
  fi
  rm -rf "$BASE_DIR"
  ok "حذف کامل شد"
}

final_note() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo
  ok "نصب کامل شد 🎉"
  if [ "$BIND_ADDR" = "127.0.0.1" ]; then
    echo -e "   سایت فقط روی ${C_INFO}http://127.0.0.1:${APP_PORT}${C_OFF} باز است (حالت پشت Nginx)."
  else
    echo -e "   آدرس سایت: ${C_INFO}http://${ip}:${APP_PORT}${C_OFF}"
    echo -e "   پنل مدیریت: ${C_INFO}http://${ip}:${APP_PORT}/admin${C_OFF}"
    echo -e "   ${C_WARN}اگر باز نشد:${C_OFF} فایروال سرور و Security Group پنل ابری را برای پورت ${APP_PORT} باز کنید،"
    echo -e "   و با ${C_INFO}bash install.sh --status${C_OFF} وضعیت را بررسی کنید."
  fi
  echo
  echo "گام‌های بعدی:"
  echo "  ۱) وارد /admin شوید و در «سرورها» اطلاعات پنل 3x-ui خود را وارد کنید و «تست اتصال» بگیرید."
  echo "  ۲) در «تنظیمات» شماره کارت، نام صاحب کارت و توکن ربات تلگرام را وارد کنید."
  echo "  ۳) در «پلن‌ها» قیمت‌ها را مطابق نیازتان تغییر دهید."
  echo "  ۴) برای دامنه و HTTPS، Nginx را طبق راهنمای shop/README.md تنظیم کنید."
  echo
  if [ "$MODE" = "docker" ]; then
    echo "دستورات مفید:"
    echo "  bash install.sh --status     بررسی وضعیت"
    echo "  bash install.sh --logs       آخرین لاگ‌ها"
    echo "  cd ${APP_DIR} && docker compose restart"
  else
    echo "دستورات مفید:"
    echo "  bash install.sh --status     بررسی وضعیت"
    echo "  bash install.sh --logs       آخرین لاگ‌ها"
    echo "  systemctl restart ${SERVICE_NAME}"
  fi
}

case "$ACTION" in
  logs) show_logs 100; exit 0 ;;
  status)
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    echo "پوشه نصب: ${APP_DIR}"
    if [ -f "${APP_DIR}/.env" ]; then
      APP_PORT="$(grep -E '^APP_PORT=' "${APP_DIR}/.env" | tail -1 | cut -d= -f2 | tr -d '"')"
      BIND_ADDR="$(grep -E '^BIND_ADDR=' "${APP_DIR}/.env" | tail -1 | cut -d= -f2 | tr -d '"')"
      APP_PORT="${APP_PORT:-3000}"
      BIND_ADDR="${BIND_ADDR:-0.0.0.0}"
    fi
    echo "پورت: ${APP_PORT} | آدرس انتشار: ${BIND_ADDR}"
    if [ -f "${APP_DIR}/docker-compose.yml" ] && command -v docker >/dev/null 2>&1; then
      docker compose -f "${APP_DIR}/docker-compose.yml" ps 2>/dev/null || true
    fi
    systemctl is-active "${SERVICE_NAME}" >/dev/null 2>&1 && echo "سرویس systemd: فعال"
    if curl -fs -o /dev/null --max-time 5 "http://127.0.0.1:${APP_PORT}/" 2>/dev/null; then
      ok "سایت از داخل سرور پاسخ می‌دهد: http://127.0.0.1:${APP_PORT}"
      if [ "$BIND_ADDR" = "127.0.0.1" ]; then
        warn "پورت فقط روی لوکال‌هاست باز است؛ از بیرون باید از طریق Nginx/دامنه وارد شوید."
        warn "برای باز کردن مستقیم: در ${APP_DIR}/.env مقدار BIND_ADDR=0.0.0.0 را بگذارید و docker compose up -d بزنید."
      else
        echo "   آدرس بیرونی: http://${ip}:${APP_PORT}"
        warn "اگر از بیرون باز نشد، فایروال سرور و Security Group سرویس ابری را بررسی کنید."
      fi
    else
      die "سایت از داخل سرور هم پاسخ نمی‌دهد. برای دیدن دلیل: bash install.sh --logs"
    fi
    exit 0 ;;
  uninstall) uninstall; exit 0 ;;
  update)
    fetch_source
    if [ "$MODE" != "node" ] && command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
      cd "$APP_DIR" && docker compose up -d --build
    else
      cd "$APP_DIR" && npm ci --no-audit --no-fund && npm run build && npx prisma db push --skip-generate && systemctl restart "$SERVICE_NAME"
    fi
    ok "به‌روزرسانی انجام شد"; exit 0 ;;
esac

echo -e "${C_INFO}"
cat <<'BANNER'
  ______              _             _
 |  ____|            | |           | |
 | |__ __ _ _ __   __| | ___   __ _| |__
 |  __/ _` | '_ \ / _` |/ _ \ / _` | '_ \
 | | | (_| | | | | (_| | (_) | (_| | | | |
 |_|  \__,_|_| |_|\__,_|\___/ \__, |_| |_|
   سایت فروش VLESS + پنل 3x-ui __/ |
BANNER
echo -e "${C_OFF}"

need_packages
fetch_source
if [ "$MODE" = "docker" ]; then
  install_docker
  make_env
  run_docker
else
  install_node
  make_env
  run_node
fi
final_note
