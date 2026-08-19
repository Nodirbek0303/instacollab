#!/usr/bin/env bash
#
# InstaCollab — serverni tekshirish (HECH NARSANI O'ZGARTIRMAYDI).
#
# Serverda allaqachon boshqa loyiha ishlayotgan bo'lsa, bu skript
# to'qnashuv bo'ladigan joylarni aniqlab beradi.
#
# Ishlatish:
#   sudo bash deploy/check.sh
#
# Chiqqan natijani nusxalab yuboring — o'rnatishni shunga moslaymiz.

set -uo pipefail

APP_PORT="${PORT:-3100}"

bold()  { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }
ok()    { printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[1;33m!\033[0m %s\n' "$*"; }
bad()   { printf '  \033[1;31m✗\033[0m %s\n' "$*"; }
info()  { printf '    %s\n' "$*"; }

echo "════════════════════════════════════════════════"
echo "  InstaCollab — server tekshiruvi"
echo "  $(date '+%Y-%m-%d %H:%M')"
echo "════════════════════════════════════════════════"

# ------------------------------------------------------------------ #
bold "1. Tizim"
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  ok "OS: $PRETTY_NAME"
else
  warn "OS aniqlanmadi"
fi
info "Arxitektura: $(uname -m)"
info "Yadro: $(uname -r)"
info "RAM: $(free -h 2>/dev/null | awk '/^Mem:/{print $2" (bo\047sh: "$7")"}' || echo '?')"
info "Disk: $(df -h / | awk 'NR==2{print $4" bo\047sh / "$2}')"

# ------------------------------------------------------------------ #
bold "2. Node.js"
if command -v node >/dev/null 2>&1; then
  NODE_V="$(node -v)"
  NODE_MAJOR="$(echo "$NODE_V" | sed 's/^v//' | cut -d. -f1)"
  info "Yo'li: $(command -v node)"
  if [[ "$NODE_MAJOR" -ge 18 ]]; then
    ok "Node $NODE_V — mos keladi, TIZIMDAGI NODE O'ZGARTIRILMAYDI"
  else
    warn "Node $NODE_V — eski (kamida 18 kerak)"
    info "Tizimdagi Node'ga TEGILMAYDI — InstaCollab uchun alohida Node o'rnatiladi"
    info "(/opt/instacollab/.node ichiga, boshqa loyihalarga ta'sir qilmaydi)"
  fi
else
  warn "Node.js o'rnatilmagan — InstaCollab uchun alohida o'rnatiladi"
fi
command -v npm >/dev/null 2>&1 && info "npm: $(npm -v)"

# ------------------------------------------------------------------ #
bold "3. Band portlar"
if command -v ss >/dev/null 2>&1; then
  LISTEN="$(ss -tlnp 2>/dev/null)"
elif command -v netstat >/dev/null 2>&1; then
  LISTEN="$(netstat -tlnp 2>/dev/null)"
else
  LISTEN=""
  warn "ss/netstat topilmadi — portlarni tekshirib bo'lmadi"
fi

port_owner() {
  echo "$LISTEN" | grep -E "[:.]$1[[:space:]]" | head -1 \
    | sed -E 's/.*users:\(\("([^"]+)".*/\1/' | head -1
}

for p in 80 443; do
  if echo "$LISTEN" | grep -qE "[:.]$p[[:space:]]"; then
    warn "$p-port band: $(port_owner "$p")"
  else
    ok "$p-port bo'sh"
  fi
done

if echo "$LISTEN" | grep -qE "[:.]$APP_PORT[[:space:]]"; then
  bad "$APP_PORT-port BAND: $(port_owner "$APP_PORT")"
  info "O'rnatishda boshqa port tanlang:  sudo PORT=3200 bash deploy/install.sh"
else
  ok "$APP_PORT-port bo'sh — InstaCollab shu portda ishlaydi"
fi

echo
info "Hozir tinglanayotgan barcha portlar:"
echo "$LISTEN" | awk 'NR>1{print "      "$4"  "$NF}' | sed 's/users:((//;s/))//' | sort -u | head -20

# ------------------------------------------------------------------ #
bold "4. Veb-server (80/443 egasi)"
WEBSERVER="yo'q"
for svc in nginx apache2 httpd caddy haproxy traefik; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    WEBSERVER="$svc"
    ok "Faol: $svc"
    case "$svc" in
      nginx)
        info "Konfiguratsiya: /etc/nginx/sites-available/"
        info "InstaCollab uchun ALOHIDA fayl qo'shiladi, mavjudlariga tegilmaydi"
        ;;
      caddy)
        info "Konfiguratsiya: /etc/caddy/Caddyfile"
        info "InstaCollab uchun alohida blok qo'shiladi"
        ;;
      apache2|httpd)
        info "Apache uchun proksi sozlamasi qo'lda qo'shiladi (qo'llanmada bor)"
        ;;
    esac
  fi
done
[[ "$WEBSERVER" == "yo'q" ]] && ok "Veb-server yo'q — Caddy o'rnatiladi (avtomatik HTTPS bilan)"

# ------------------------------------------------------------------ #
bold "5. Mavjud systemd xizmatlari"
RUNNING="$(systemctl list-units --type=service --state=running --no-legend --no-pager 2>/dev/null \
  | awk '{print $1}' | grep -vE '^(systemd|dbus|cron|ssh|rsyslog|polkit|networkd|resolved|udev|getty|snapd|unattended|multipathd|irqbalance|chrony|walinuxagent|oracle|qemu)' | head -15)"
if [[ -n "$RUNNING" ]]; then
  info "Ishlab turgan xizmatlar:"
  echo "$RUNNING" | sed 's/^/      /'
else
  info "Maxsus xizmatlar topilmadi"
fi

if systemctl list-unit-files 2>/dev/null | grep -q '^instacollab.service'; then
  warn "instacollab.service ALLAQACHON MAVJUD — qayta o'rnatish uni yangilaydi"
else
  ok "instacollab.service yo'q — yangi qo'shiladi"
fi

# ------------------------------------------------------------------ #
bold "6. To'qnashuv bo'lishi mumkin bo'lgan joylar"
CONFLICT=0

for path in /opt/instacollab /var/lib/instacollab; do
  if [[ -e "$path" ]]; then
    warn "$path allaqachon mavjud"
    CONFLICT=1
  else
    ok "$path — bo'sh"
  fi
done

if id -u instacollab >/dev/null 2>&1; then
  warn "instacollab foydalanuvchisi allaqachon bor"
else
  ok "instacollab foydalanuvchisi — yangi yaratiladi"
fi

# ------------------------------------------------------------------ #
bold "7. Xulosa"
echo
if [[ "$CONFLICT" -eq 0 ]]; then
  ok "Jiddiy to'qnashuv topilmadi — o'rnatish xavfsiz"
else
  warn "Yuqoridagi belgilangan joylarga e'tibor bering"
fi

cat <<EOF

  O'rnatish buyrug'i (domenni o'zingiznikiga almashtiring):

    sudo DOMAIN=instacollab.sizning-domen.uz PORT=$APP_PORT \\
      bash deploy/install.sh

  Skript:
    • tizimdagi Node'ni versiyasi mos bo'lsa TEGMAYDI;
    • $WEBSERVER ishlayotgan bo'lsa Caddy o'rnatmaydi, unga alohida blok qo'shadi;
    • boshqa loyihalaringizning fayllariga umuman tegmaydi.

EOF
