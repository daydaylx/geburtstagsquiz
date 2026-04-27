#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# setup_tunnel.sh — Cloudflare Tunnel fuer disaai.de einrichten (einmalig)
# ==============================================================================
# Erstellt Tunnel, konfiguriert DNS, schreibt Config.
# Vorher: cloudflared muss installiert und eingeloggt sein.
#   Install: siehe https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
#   Login:   cloudflared tunnel login
# ==============================================================================

PROJECT_DIR="${PROJECT_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd -P)"

DOMAIN="${DOMAIN:-disaai.de}"
TUNNEL_NAME="${TUNNEL_NAME:-quiz}"

STATE_DIR="${STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/geburtstagsquiz-tunnel}"
TUNNEL_DIR="$STATE_DIR"
CONFIG_FILE="$PROJECT_DIR/.cloudflared/config.yml"

SERVER_PORT="${SERVER_PORT:-3001}"
DISPLAY_WEB_PORT="${DISPLAY_WEB_PORT:-5175}"
HOST_WEB_PORT="${HOST_WEB_PORT:-5173}"
PLAYER_WEB_PORT="${PLAYER_WEB_PORT:-5174}"

info() { printf "\n==> %s\n" "$*"; }
warn() { printf "WARNUNG: %s\n" "$*" >&2; }
die() { printf "FEHLER: %s\n" "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 fehlt. Bitte installieren."
}

# ---- Voraussetzungen pruefen ----

check_prerequisites() {
  need_cmd cloudflared
  need_cmd yq

  cloudflared tunnel list >/dev/null 2>&1 ||
    die "cloudflared ist nicht eingeloggt. Bitte zuerst: cloudflared tunnel login"
}

# ---- Pruefen ob Tunnel bereits existiert ----

tunnel_exists() {
  cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"
}

# ---- Tunnel erstellen ----

create_tunnel() {
  if tunnel_exists; then
    info "Tunnel '$TUNNEL_NAME' existiert bereits — ueberspringe Erstellung"
  else
    info "Erstelle Tunnel '$TUNNEL_NAME'"
    cloudflared tunnel create "$TUNNEL_NAME"
  fi
}

# ---- Tunnel-UUID holen ----

get_tunnel_uuid() {
  cloudflared tunnel list 2>/dev/null | awk -v name="$TUNNEL_NAME" '$2 == name { print $1; exit }'
}

# ---- DNS-Eintraege erstellen ----

setup_dns() {
  local uuid="$1"

  info "Pruefe DNS-Eintraege"

  local subdomains=("api" "tv" "host" "play")

  for sub in "${subdomains[@]}"; do
    local fqdn="$sub.$DOMAIN"

    if cloudflared tunnel route dns --overwrite-dns "$TUNNEL_NAME" "$fqdn" 2>/dev/null; then
      info "DNS: $fqdn -> CNAME $uuid.cfargotunnel.com (erstellt/aktualisiert)"
    else
      warn "DNS-Eintrag fuer $fqdn konnte nicht erstellt werden. Pruefe manuell im Cloudflare Dashboard."
    fi
  done
}

# ---- Config-Datei schreiben ----

write_config() {
  local uuid="$1"

  info "Schreibe Tunnel-Config nach $CONFIG_FILE"

  mkdir -p "$(dirname "$CONFIG_FILE")"

  cat > "$CONFIG_FILE" <<EOF
tunnel: $uuid
credentials-file: $STATE_DIR/$uuid.json

ingress:
  - hostname: api.$DOMAIN
    service: http://localhost:$SERVER_PORT
    originRequest:
      noTLSVerify: true

  - hostname: tv.$DOMAIN
    service: http://localhost:$DISPLAY_WEB_PORT
    originRequest:
      noTLSVerify: true

  - hostname: host.$DOMAIN
    service: http://localhost:$HOST_WEB_PORT
    originRequest:
      noTLSVerify: true

  - hostname: play.$DOMAIN
    service: http://localhost:$PLAYER_WEB_PORT
    originRequest:
      noTLSVerify: true

  - service: http_status:404
EOF

  info "Config geschrieben."
}

# ---- Credentials-Datei lokalisieren ----

locate_credentials() {
  local uuid="$1"
  local global_cred="$HOME/.cloudflared/$uuid.json"
  local local_cred="$STATE_DIR/$uuid.json"

  if [[ -f "$global_cred" ]]; then
    if [[ "$global_cred" != "$local_cred" ]]; then
      mkdir -p "$STATE_DIR"
      cp "$global_cred" "$local_cred"
      info "Credentials von $global_cred nach $local_cred kopiert"
    fi
    return 0
  fi

  if [[ -f "$local_cred" ]]; then
    return 0
  fi

  die "Credentials-Datei $uuid.json nicht gefunden. Pruefe ~/.cloudflared/ oder $STATE_DIR/"
}

# ---- Env-Beispiel-Datei schreiben ----

write_env_example() {
  local env_file="$PROJECT_DIR/.env.tunnel.example"

  info "Schreibe Env-Beispiel nach $env_file"

  cat > "$env_file" <<EOF
# Cloudflare Tunnel — Domain-Modus
VITE_SERVER_SOCKET_URL=wss://api.$DOMAIN
VITE_DISPLAY_URL=https://tv.$DOMAIN
VITE_HOST_URL=https://host.$DOMAIN
VITE_PLAYER_JOIN_BASE_URL=https://play.$DOMAIN
EOF
}

# ---- Hauptprogramm ----

main() {
  check_prerequisites
  create_tunnel

  local uuid
  uuid="$(get_tunnel_uuid)"
  [[ -n "$uuid" ]] || die "Tunnel-UUID konnte nicht ermittelt werden."

  info "Tunnel-UUID: $uuid"
  locate_credentials "$uuid"
  setup_dns "$uuid"
  write_config "$uuid"
  write_env_example

  printf "\n============================================================\n"
  printf " TUNNEL EINGERICHTET\n"
  printf "============================================================\n"
  printf "Tunnel-Name:   %s\n" "$TUNNEL_NAME"
  printf "Tunnel-UUID:   %s\n" "$uuid"
  printf "Domain:        %s\n" "$DOMAIN"
  printf "DNS:           api/tv/host/play.%s\n" "$DOMAIN"
  printf "Config:        %s\n" "$CONFIG_FILE"
  printf "------------------------------------------------------------\n"
  printf "Naechste Schritte:\n"
  printf "  1. Quiz lokal starten:  ./start_quiz.sh\n"
  printf "  2. Tunnel starten:      ./start_tunnel.sh\n"
  printf "  3. Offne https://tv.%s im TV-Browser\n" "$DOMAIN"
  printf "============================================================\n"
}

main "$@"
