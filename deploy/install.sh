#!/usr/bin/env bash
#
# InstaCollab UZ — serverga o'rnatish.
#
# Serverda boshqa loyihalar ishlayotgan bo'lsa ham xavfsiz:
#   • tizimdagi Node versiyasi mos bo'lsa — TEGMAYDI (aks holda alohida Node o'rnatadi);
#   • Nginx/Apache/Caddy ishlayotgan bo'lsa — Caddy o'rnatmaydi, mavjudiga alohida blok qo'shadi;
#   • port, katalog, foydalanuvchi va xizmat nomi — hammasi alohida;
#   • boshqa loyihalarning fayllariga umuman tegmaydi.
#
# Avval tekshiruvni ishga tushiring:   sudo bash deploy/check.sh
#
# O'rnatish:
#   sudo DOMAIN=instacollab.example.uz bash deploy/install.sh
#   sudo DOMAIN=... PORT=3200 bash deploy/install.sh      # port band bo'lsa
#   sudo bash deploy/install.sh                            # domensiz (faqat IP:PORT)

set -euo pipefail

APP_USER="instacollab"
APP_DIR="/opt/instacollab"
DATA_DIR="/var/lib/instacollab"
APP_PORT="${PORT:-3100}"
NODE_MIN_MAJOR=18
NODE_INSTALL_VERSION="22.14.0"
DOMAIN="${DOMAIN:-}"

log()  { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n\n' "$*"; exit 1; }

[[ $EUID -eq 0 ]] || die "root sifatida ishga tushiring:  sudo bash deploy/install.sh"

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ------------------------------------------------------------------ #
log "1/8  Portni tekshirish"
if ss -tln 2>/dev/null | grep -qE "[:.]${APP_PORT}[[:space:]]"; then
  die "$APP_PORT-port band. Boshqa portni tanlang:  sudo PORT=3200 DOMAIN=$DOMAIN bash deploy/install.sh"
fi
ok "$APP_PORT-port bo'sh"

# ------------------------------------------------------------------ #
log "2/8  Kerakli paketlar"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg rsync xz-utils >/dev/null
ok "asosiy paketlar tayyor"

# ------------------------------------------------------------------ #
log "3/8  Node.js"
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  SYS_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
  if [[ "$SYS_MAJOR" -ge "$NODE_MIN_MAJOR" ]]; then
    NODE_BIN="$(command -v node)"
    ok "tizimdagi Node $(node -v) ishlatiladi — hech narsa o'zgartirilmadi"
  else
    warn "tizimdagi Node $(node -v) eski, lekin unga TEGILMAYDI"
  fi
fi

if [[ -z "$NODE_BIN" ]]; then
  # Boshqa loyihalarga xalaqit bermaslik uchun Node faqat ilova katalogiga o'rnatiladi.
  case "$(uname -m)" in
    x86_64)  NODE_ARCH="x64" ;;
    aarch64) NODE_ARCH="arm64" ;;
    *) die "qo'llab-quvvatlanmaydigan arxitektura: $(uname -m)" ;;
  esac

  NODE_HOME="$APP_DIR/.node"
  if [[ ! -x "$NODE_HOME/bin/node" ]]; then
    mkdir -p "$NODE_HOME"
    TARBALL="node-v${NODE_INSTALL_VERSION}-linux-${NODE_ARCH}.tar.xz"
    curl -fsSL "https://nodejs.org/dist/v${NODE_INSTALL_VERSION}/${TARBALL}" \
      | tar -xJ -C "$NODE_HOME" --strip-components=1
  fi
  NODE_BIN="$NODE_HOME/bin/node"
  export PATH="$NODE_HOME/bin:$PATH"
  ok "alohida Node o'rnatildi: $NODE_BIN (tizimga ta'sir qilmaydi)"
fi

NPM_BIN="$(dirname "$NODE_BIN")/npm"
[[ -x "$NPM_BIN" ]] || NPM_BIN="$(command -v npm)"

# ------------------------------------------------------------------ #
log "4/8  Foydalanuvchi va kataloglar"
id -u "$APP_USER" >/dev/null 2>&1 \
  || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" "$DATA_DIR"
ok "$APP_USER foydalanuvchisi va $DATA_DIR katalogi tayyor"

# ------------------------------------------------------------------ #
log "5/8  Kodni ko'chirish va yig'ish"
rsync -a --delete \
  --exclude node_modules --exclude dist --exclude data \
  --exclude .git --exclude .env --exclude .node \
  "$SOURCE_DIR/" "$APP_DIR/"

# .env faqat birinchi marta ko'chiriladi — serverdagisi ustidan yozilmaydi.
if [[ ! -f "$APP_DIR/.env" && -f "$SOURCE_DIR/.env" ]]; then
  cp "$SOURCE_DIR/.env" "$APP_DIR/.env"
fi
[[ -f "$APP_DIR/.env" ]] || die ".env fayli topilmadi. Uni $APP_DIR/.env ga joylang (namuna: .env.example)"

cd "$APP_DIR"
# Yig'ish uchun dev-paketlar ham kerak, keyin ular olib tashlanadi.
"$NPM_BIN" ci --silent 2>/dev/null || "$NPM_BIN" install --silent
"$NPM_BIN" run build
"$NPM_BIN" prune --omit=dev --silent

chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR"
chmod 600 "$APP_DIR/.env"
ok "ilova yig'ildi"

# ------------------------------------------------------------------ #
log "6/8  systemd xizmati"
# Domen (proksi) bor bo'lsa — port tashqariga ochilmaydi, faqat 127.0.0.1.
BIND_HOST="0.0.0.0"
[[ -n "$DOMAIN" ]] && BIND_HOST="127.0.0.1"

sed -e "s|{{NODE}}|$NODE_BIN|g" \
    -e "s|{{HOST}}|$BIND_HOST|g" \
    -e "s|{{APP_DIR}}|$APP_DIR|g" \
    -e "s|{{DATA_DIR}}|$DATA_DIR|g" \
    -e "s|{{PORT}}|$APP_PORT|g" \
    -e "s|{{USER}}|$APP_USER|g" \
    "$SOURCE_DIR/deploy/instacollab.service" > /etc/systemd/system/instacollab.service

systemctl daemon-reload
systemctl enable instacollab >/dev/null
systemctl restart instacollab
sleep 3

if systemctl is-active --quiet instacollab; then
  ok "instacollab xizmati ishlayapti (port $APP_PORT)"
else
  warn "xizmat ishga tushmadi. Jurnal:  journalctl -u instacollab -n 50"
fi

# ------------------------------------------------------------------ #
log "7/8  Veb-server"

detect_webserver() {
  for svc in caddy nginx apache2 httpd; do
    systemctl is-active --quiet "$svc" 2>/dev/null && { echo "$svc"; return; }
  done
  echo "none"
}
WEBSERVER="$(detect_webserver)"

if [[ -z "$DOMAIN" ]]; then
  warn "DOMAIN berilmadi — veb-server sozlanmadi."
  warn "Ilova hozircha faqat http://SERVER_IP:$APP_PORT orqali ochiladi."
  warn "Telegram Mini App uchun HTTPS shart. Domen bilan qayta ishga tushiring:"
  warn "  sudo DOMAIN=instacollab.example.uz PORT=$APP_PORT bash deploy/install.sh"

elif [[ "$WEBSERVER" == "nginx" ]]; then
  # Mavjud nginx'ga ALOHIDA fayl qo'shamiz — boshqa saytlarga tegilmaydi.
  sed -e "s|{{DOMAIN}}|$DOMAIN|g" -e "s|{{PORT}}|$APP_PORT|g" \
    "$SOURCE_DIR/deploy/nginx-instacollab.conf" > /etc/nginx/sites-available/instacollab.conf
  ln -sf /etc/nginx/sites-available/instacollab.conf /etc/nginx/sites-enabled/instacollab.conf

  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx
    ok "nginx sozlandi: $DOMAIN → 127.0.0.1:$APP_PORT (boshqa saytlar tegilmadi)"

    if command -v certbot >/dev/null 2>&1; then
      warn "HTTPS uchun quyidagini bajaring:"
      warn "  sudo certbot --nginx -d $DOMAIN"
    else
      warn "HTTPS uchun certbot o'rnating:"
      warn "  sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d $DOMAIN"
    fi
  else
    warn "nginx sozlamasida xato — fayl o'chirildi, mavjud saytlar buzilmadi"
    rm -f /etc/nginx/sites-enabled/instacollab.conf
    nginx -t || true
  fi

elif [[ "$WEBSERVER" == "caddy" ]]; then
  # Mavjud Caddyfile'ga tegmasdan alohida fayl qo'shamiz.
  mkdir -p /etc/caddy/conf.d
  sed -e "s|{{DOMAIN}}|$DOMAIN|g" -e "s|{{PORT}}|$APP_PORT|g" \
    "$SOURCE_DIR/deploy/Caddyfile" > /etc/caddy/conf.d/instacollab.caddy

  if ! grep -q 'conf.d' /etc/caddy/Caddyfile 2>/dev/null; then
    printf '\nimport /etc/caddy/conf.d/*.caddy\n' >> /etc/caddy/Caddyfile
  fi
  systemctl reload caddy
  ok "caddy sozlandi: https://$DOMAIN (mavjud Caddyfile'ga faqat import qo'shildi)"

elif [[ "$WEBSERVER" == "apache2" || "$WEBSERVER" == "httpd" ]]; then
  warn "Apache aniqlandi — avtomatik sozlanmadi (mavjud saytlarni buzmaslik uchun)."
  warn "Quyidagini VirtualHost ichiga qo'shing:"
  cat <<APACHE

    <VirtualHost *:80>
        ServerName $DOMAIN
        ProxyPreserveHost On
        ProxyPass        / http://127.0.0.1:$APP_PORT/
        ProxyPassReverse / http://127.0.0.1:$APP_PORT/
        RequestHeader set X-Forwarded-Proto "https"
    </VirtualHost>

APACHE
  warn "So'ng:  sudo a2enmod proxy proxy_http headers && sudo systemctl reload apache2"
  warn "HTTPS:  sudo certbot --apache -d $DOMAIN"

else
  # 80-port bo'sh — Caddy o'rnatamiz.
  if ! command -v caddy >/dev/null 2>&1; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
    curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy >/dev/null
  fi
  mkdir -p /etc/caddy/conf.d
  sed -e "s|{{DOMAIN}}|$DOMAIN|g" -e "s|{{PORT}}|$APP_PORT|g" \
    "$SOURCE_DIR/deploy/Caddyfile" > /etc/caddy/conf.d/instacollab.caddy
  grep -q 'conf.d' /etc/caddy/Caddyfile 2>/dev/null \
    || printf '\nimport /etc/caddy/conf.d/*.caddy\n' >> /etc/caddy/Caddyfile
  systemctl restart caddy
  ok "caddy o'rnatildi va sozlandi: https://$DOMAIN"
fi

# APP_URL ni domenga moslaymiz — Telegram Mini App faqat HTTPS bilan ishlaydi.
if [[ -n "$DOMAIN" ]]; then
  if grep -q '^APP_URL=' "$APP_DIR/.env"; then
    sed -i "s|^APP_URL=.*|APP_URL=\"https://$DOMAIN\"|" "$APP_DIR/.env"
  else
    echo "APP_URL=\"https://$DOMAIN\"" >> "$APP_DIR/.env"
  fi
  systemctl restart instacollab
  ok "APP_URL: https://$DOMAIN"
fi

# ------------------------------------------------------------------ #
log "8/8  Xavfsizlik devori"
if [[ -n "$DOMAIN" ]]; then
  for p in 80 443; do
    iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null \
      || iptables -I INPUT 6 -p tcp --dport "$p" -j ACCEPT 2>/dev/null || true
  done
  netfilter-persistent save >/dev/null 2>&1 || iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
  ok "80 va 443 portlari ochiq"
  warn "Bulut panelida (Security List / NSG) ham 80 va 443 ochilishi shart!"
else
  ok "o'zgartirilmadi"
fi
# APP_PORT tashqariga ochilmaydi — unga faqat veb-server 127.0.0.1 orqali murojaat qiladi.

# ------------------------------------------------------------------ #
printf '\n\033[1;32m═══ Tayyor ═══\033[0m\n'
if [[ -n "$DOMAIN" ]]; then
  echo "  Sayt:     https://$DOMAIN"
else
  echo "  Sayt:     http://$(curl -s -m 5 ifconfig.me 2>/dev/null || echo SERVER_IP):$APP_PORT"
fi
echo "  Port:     $APP_PORT ($BIND_HOST)"
echo "  Node:     $NODE_BIN"
echo "  Holat:    systemctl status instacollab"
echo "  Jurnal:   journalctl -u instacollab -f"
echo "  Baza:     $DATA_DIR/db.json"
echo
