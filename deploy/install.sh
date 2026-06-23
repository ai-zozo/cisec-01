#!/usr/bin/env bash
# =============================================================================
# Ci-Sec — מערכת ניהול מצב אבטחת מידע
# סקריפט התקנה ופריסה לשרת Ubuntu נקי.
# מתקין Docker + Docker Compose (אם חסרים), מייצר תעודת TLS מקומית ל-5 שנים,
# מייצר סודות, בונה ומריץ את כל הסטאק.
#
# הרצה:   sudo bash deploy/install.sh
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[Ci-Sec]${NC} $*"; }
warn() { echo -e "${YELLOW}[Ci-Sec]${NC} $*"; }
err()  { echo -e "${RED}[Ci-Sec]${NC} $*" >&2; }

# נע לתיקיית שורש הפרויקט (היכן ש-docker-compose.yml יושב)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if [[ $EUID -ne 0 ]]; then
  err "יש להריץ עם sudo / root."
  exit 1
fi

# -----------------------------------------------------------------------------
# 1. התקנת Docker + Compose plugin אם חסרים
# -----------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Docker לא מותקן — מתקין..."
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg openssl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  log "Docker כבר מותקן."
  command -v openssl >/dev/null 2>&1 || apt-get install -y openssl
fi

# בחירת פקודת compose
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  err "Docker Compose לא נמצא."
  exit 1
fi

# -----------------------------------------------------------------------------
# 2. יצירת קובץ .env עם סודות (אם לא קיים)
# -----------------------------------------------------------------------------
if [[ ! -f .env ]]; then
  log "מייצר קובץ .env עם סודות אקראיים..."
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 48)"
  cat > .env <<EOF
# נוצר אוטומטית ע"י install.sh — אין לשתף קובץ זה.
POSTGRES_USER=cisec
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=cisec
JWT_SECRET=${JWT_SECRET}
ADMIN_DEFAULT_PASSWORD=Aa123456
SESSION_IDLE_MINUTES=60
BACKUP_CRON=0 2 * * *
EOF
  chmod 600 .env
else
  warn "קובץ .env קיים — משתמש בקיים."
fi

# -----------------------------------------------------------------------------
# 3. יצירת תעודת TLS מקומית בתוקף 5 שנים (אם לא קיימת)
# -----------------------------------------------------------------------------
CERT_DIR="$ROOT_DIR/deploy/certs"
mkdir -p "$CERT_DIR"
if [[ ! -f "$CERT_DIR/cisec.crt" ]]; then
  log "מייצר תעודת TLS מקומית בתוקף 5 שנים..."
  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$CERT_DIR/cisec.key" \
    -out "$CERT_DIR/cisec.crt" \
    -days 1825 \
    -subj "/C=IL/O=Ci-Sec/CN=ci-sec.local" \
    -addext "subjectAltName=DNS:ci-sec.local,DNS:localhost,IP:127.0.0.1"
  chmod 600 "$CERT_DIR/cisec.key"
else
  warn "תעודה קיימת — משתמש בקיימת."
fi

# -----------------------------------------------------------------------------
# 4. בנייה והרצה
# -----------------------------------------------------------------------------
log "בונה ומריץ את הסטאק (db, api, web, proxy)..."
$COMPOSE build
$COMPOSE up -d

log "ממתין לעליית בסיס הנתונים והרצת מיגרציות + seed..."
$COMPOSE exec -T api node ./scripts/init.js || warn "init רץ אוטומטית בעליית ה-API; בדוק לוגים אם צריך."

echo
log "================================================================"
log " Ci-Sec הותקנה בהצלחה!"
log " כתובת:   https://<כתובת-השרת>:11445"
log " משתמש:   admin"
log " סיסמה:   Aa123456  (תידרש החלפה בכניסה הראשונה)"
log "================================================================"
log " צפייה בלוגים:   $COMPOSE logs -f"
log " עצירה:          $COMPOSE down"
