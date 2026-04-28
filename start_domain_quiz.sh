#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# start_domain_quiz.sh — Alles starten für den Betrieb über quiz.disaai.de
# ==============================================================================
# 1. Startet lokale Quiz-Dienste (Server, Display, Host, Player)
# 2. Startet Cloudflare Tunnel
# ==============================================================================

PROJECT_DIR="${PROJECT_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd -P)"

TUNNEL_NAME="${TUNNEL_NAME:-quiz}"
DOMAIN="quiz.disaai.de"

STATE_DIR="${STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/geburtstagsquiz-domain-mode}"
LOG_DIR="$STATE_DIR/logs"
PID_FILE="$STATE_DIR/pids"

info() { printf "\n==> %s\n" "$*"; }
warn() { printf "WARNUNG: %s\n" "$*" >&2; }
die() { printf "FEHLER: %s\n" "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 fehlt. Bitte installieren."
}

cleanup() {
  local code=$?
  trap - EXIT INT TERM

  info "Beende alle Prozesse..."
  if [[ -f "$PID_FILE" ]]; then
    while read -r pid name; do
      if kill -0 "$pid" 2>/dev/null; then
        kill -TERM "$pid" 2>/dev/null || true
      fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi

  info "Quiz-Dienste und Tunnel gestoppt."
  exit "$code"
}

start_service() {
  local name="$1"
  local cmd="$2"

  info "Starte $name..."
  (
    cd "$PROJECT_DIR"
    exec bash -lc "$cmd"
  ) > "$LOG_DIR/$name.log" 2>&1 &
  
  printf "%s %s\n" "$!" "$name" >> "$PID_FILE"
}

main() {
  need_cmd corepack
  need_cmd cloudflared

  mkdir -p "$LOG_DIR" "$STATE_DIR"
  : > "$PID_FILE"
  trap cleanup EXIT INT TERM

  info "Bereite Umgebung vor..."
  
  # Lade Vars aus .env.production falls vorhanden
  if [[ -f "$PROJECT_DIR/.env.production" ]]; then
    export $(grep -v '^#' "$PROJECT_DIR/.env.production" | xargs)
  fi

  # Fallback Defaults für Domain-Betrieb
  export VITE_DISPLAY_URL="${VITE_DISPLAY_URL:-https://tv.$DOMAIN}"
  export VITE_HOST_URL="${VITE_HOST_URL:-https://host.$DOMAIN}"
  export VITE_PLAYER_JOIN_BASE_URL="${VITE_PLAYER_JOIN_BASE_URL:-https://play.$DOMAIN}"
  export VITE_SERVER_SOCKET_URL="${VITE_SERVER_SOCKET_URL:-wss://api.$DOMAIN}"

  info "Starte lokale Quiz-Dienste (Server + Frontends)"
  
  start_service "server" "corepack pnpm --filter @quiz/server dev"
  start_service "display" "corepack pnpm --filter @quiz/web-display dev -- --port 5175 --strictPort"
  start_service "host" "corepack pnpm --filter @quiz/web-host dev -- --port 5173 --strictPort"
  start_service "player" "corepack pnpm --filter @quiz/web-player dev -- --port 5174 --strictPort"

  info "Warte auf lokale Dienste..."
  sleep 5

  info "Starte Cloudflare Tunnel '$TUNNEL_NAME'"
  
  # Startet den Tunnel. Nutzt lokale Credentials in ~/.cloudflared/
  cloudflared tunnel run "$TUNNEL_NAME" > "$LOG_DIR/tunnel.log" 2>&1 &
  printf "%s %s\n" "$!" "tunnel" >> "$PID_FILE"

  printf "%s\n" "============================================================"
  printf " GEBURTSTAGSQUIZ IM DOMAIN-MODUS AKTIV\n"
  printf "%s\n" "============================================================"
  printf "TV-Display:  https://tv.%s\n" "$DOMAIN"
  printf "Host-UI:     https://host.%s\n" "$DOMAIN"
  printf "Player-UI:   https://play.%s\n" "$DOMAIN"
  printf "API/WS:      wss://api.%s\n" "$DOMAIN"
  printf "%s\n" "------------------------------------------------------------"
  printf "Tunnel:      %s\n" "$TUNNEL_NAME"
  printf "Logs:        %s\n" "$LOG_DIR"
  printf "Stoppen:     Ctrl+C drücken\n"
  printf "%s\n" "============================================================"

  # Am Leben bleiben und Logs beobachten oder einfach warten
  wait
}

main "$@"
