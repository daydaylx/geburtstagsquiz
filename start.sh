#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# start.sh — Geburtstagsquiz über quiz.disaai.de starten
# ==============================================================================
# Startet Server, alle drei Frontends und den Cloudflare Tunnel.
# Stoppen: Ctrl+C
# ==============================================================================
# Verwendung:
#   CONFIRM_CLOUDFLARE_TUNNEL_START=1 ./start.sh
# ==============================================================================

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

DOMAIN="quiz.disaai.de"
TUNNEL_NAME="${TUNNEL_NAME:-quiz}"
CONFIG_FILE="$PROJECT_DIR/.cloudflared/config.yml"
STATE_DIR="${STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/geburtstagsquiz}"
LOG_DIR="$STATE_DIR/logs"
CONFIRM_CLOUDFLARE_TUNNEL_START="${CONFIRM_CLOUDFLARE_TUNNEL_START:-0}"

info() { printf '\n==> %s\n' "$*"; }
die()  { printf 'FEHLER: %s\n' "$*" >&2; exit 1; }

find_cloudflared() {
  command -v cloudflared 2>/dev/null && return
  [[ -x "$PROJECT_DIR/cloudflared" ]] && echo "$PROJECT_DIR/cloudflared" && return
  return 1
}

require_confirm() {
  [[ "$CONFIRM_CLOUDFLARE_TUNNEL_START" == "1" ]] && return
  die "Tunnel-Start erfordert CONFIRM_CLOUDFLARE_TUNNEL_START=1.\nDetails: docs/DEPLOYMENT-CLOUDFLARE-TUNNEL.md"
}

wait_healthy() {
  local url="$1" name="$2" i=0
  until curl -sf "$url" >/dev/null 2>&1; do
    (( i++ > 30 )) && die "$name nicht bereit nach 30s — Log: $LOG_DIR/${name}.log"
    sleep 1
  done
  info "$name bereit"
}

start_bg() {
  local name="$1"; shift
  (cd "$PROJECT_DIR" && exec "$@") >"$LOG_DIR/$name.log" 2>&1 &
  echo $! >"$STATE_DIR/$name.pid"
}

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  info "Beende alle Dienste..."
  local pid
  for f in "$STATE_DIR"/*.pid; do
    [[ -f "$f" ]] || continue
    pid="$(cat "$f")"
    kill -TERM "$pid" 2>/dev/null || true
  done
  sleep 1
  for f in "$STATE_DIR"/*.pid; do
    [[ -f "$f" ]] || continue
    pid="$(cat "$f")"
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
    rm -f "$f"
  done
  info "Gestoppt."
  exit "$code"
}

main() {
  local cf
  cf="$(find_cloudflared)" || die "cloudflared nicht gefunden."
  require_confirm
  [[ -f "$CONFIG_FILE" ]] || die "Tunnel-Config fehlt: $CONFIG_FILE"
  command -v corepack >/dev/null || die "corepack nicht gefunden."

  mkdir -p "$LOG_DIR"
  trap cleanup EXIT INT TERM

  export PORT=3001
  export HOST=0.0.0.0
  export VITE_DISPLAY_URL="https://tv.$DOMAIN"
  export VITE_HOST_URL="https://host.$DOMAIN"
  export VITE_PLAYER_JOIN_BASE_URL="https://play.$DOMAIN"
  export VITE_SERVER_SOCKET_URL="wss://api.$DOMAIN"
  export ALLOWED_ORIGINS="http://localhost:5173,http://localhost:5174,http://localhost:5175,https://tv.$DOMAIN,https://host.$DOMAIN,https://play.$DOMAIN"

  info "Starte Server..."
  start_bg server corepack pnpm --filter @quiz/server dev
  wait_healthy "http://localhost:3001/health" "server"

  info "Starte Frontends..."
  start_bg display corepack pnpm --filter @quiz/web-display dev
  start_bg host    corepack pnpm --filter @quiz/web-host dev
  start_bg player  corepack pnpm --filter @quiz/web-player dev

  info "Starte Cloudflare Tunnel '$TUNNEL_NAME'..."
  start_bg tunnel "$cf" tunnel --config "$CONFIG_FILE" run "$TUNNEL_NAME"

  sleep 3
  kill -0 "$(cat "$STATE_DIR/tunnel.pid")" 2>/dev/null || {
    cat "$LOG_DIR/tunnel.log" >&2
    die "Tunnel konnte nicht gestartet werden."
  }

  printf '\n%s\n' "============================================================"
  printf ' GEBURTSTAGSQUIZ AKTIV — %s\n' "$(date '+%H:%M')"
  printf '%s\n' "============================================================"
  printf 'TV-Display:  https://tv.%s\n'   "$DOMAIN"
  printf 'Host:        https://host.%s\n' "$DOMAIN"
  printf 'Spieler:     https://play.%s\n' "$DOMAIN"
  printf '%s\n' "------------------------------------------------------------"
  printf 'Logs:        %s\n'              "$LOG_DIR"
  printf 'Stoppen:     Ctrl+C  oder  ./stop.sh\n'
  printf '%s\n' "============================================================"

  wait "$(cat "$STATE_DIR/tunnel.pid")"
}

main "$@"
