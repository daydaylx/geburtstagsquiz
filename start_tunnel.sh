#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# start_tunnel.sh — Cloudflare Tunnel starten
# ==============================================================================
# Startet den Tunnel. Quiz-Server sollten bereits laufen (start_quiz.sh).
# ==============================================================================

PROJECT_DIR="${PROJECT_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd -P)"

DOMAIN="${DOMAIN:-quiz.disaai.de}"
TUNNEL_NAME="${TUNNEL_NAME:-geburtstagsquiz}"

STATE_DIR="${STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/geburtstagsquiz-tunnel}"
CONFIG_FILE="$PROJECT_DIR/.cloudflared/config.yml"
PID_FILE="$STATE_DIR/tunnel.pid"
LOG_DIR="$STATE_DIR/logs"

info() { printf "\n==> %s\n" "$*"; }
warn() { printf "WARNUNG: %s\n" "$*" >&2; }
die() { printf "FEHLER: %s\n" "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 fehlt. Bitte installieren."
}

find_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    command -v cloudflared
    return 0
  fi

  if [[ -x "$PROJECT_DIR/cloudflared" ]]; then
    printf "%s\n" "$PROJECT_DIR/cloudflared"
    return 0
  fi

  return 1
}

cleanup() {
  local code=$?
  trap - EXIT INT TERM

  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    kill -TERM "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi

  info "Tunnel gestoppt"
  exit "$code"
}

check_config() {
  if [[ ! -f "$CONFIG_FILE" ]]; then
    die "Tunnel-Config nicht gefunden: $CONFIG_FILE\nKopiere deploy/cloudflare-tunnel.example.yml nach $CONFIG_FILE und ersetze Platzhalter lokal."
  fi

  if ! grep -q "quiz.disaai.de" "$CONFIG_FILE"; then
    warn "Tunnel-Config enthaelt nicht quiz.disaai.de. Bitte gegen deploy/cloudflare-tunnel.example.yml pruefen."
  fi
}

check_already_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      die "Tunnel laeuft bereits (PID $pid). Stoppen mit: ./stop_tunnel.sh"
    fi
    rm -f "$PID_FILE"
  fi
}

main() {
  local cloudflared_bin
  cloudflared_bin="$(find_cloudflared)" || die "cloudflared fehlt. Bitte installieren oder als $PROJECT_DIR/cloudflared ablegen."
  check_config
  check_already_running

  mkdir -p "$LOG_DIR" "$STATE_DIR"
  trap cleanup EXIT INT TERM

  info "Starte Cloudflare Tunnel '$TUNNEL_NAME'"

  "$cloudflared_bin" tunnel --config "$CONFIG_FILE" run "$TUNNEL_NAME" \
    > "$LOG_DIR/tunnel.log" 2>&1 &

  local pid=$!
  printf "%s\n" "$pid" > "$PID_FILE"

  sleep 2

  if ! kill -0 "$pid" 2>/dev/null; then
    cat "$LOG_DIR/tunnel.log" 2>/dev/null || true
    die "Tunnel konnte nicht gestartet werden. Siehe Log: $LOG_DIR/tunnel.log"
  fi

  printf "\n============================================================\n"
  printf " TUNNEL LAEUFT\n"
  printf "============================================================\n"
  printf "Tunnel:      %s\n" "$TUNNEL_NAME"
  printf "PID:         %s\n" "$pid"
  printf "Config:      %s\n" "$CONFIG_FILE"
  printf "------------------------------------------------------------\n"
  printf "TV:          https://tv.%s\n" "$DOMAIN"
  printf "Host:        https://host.%s\n" "$DOMAIN"
  printf "Spieler:     https://play.%s\n" "$DOMAIN"
  printf "API/WS:      wss://api.%s\n" "$DOMAIN"
  printf "------------------------------------------------------------\n"
  printf "Log:         %s\n" "$LOG_DIR/tunnel.log"
  printf "Stoppen:     Ctrl+C oder ./stop_tunnel.sh\n"
  printf "============================================================\n"

  info "Warte auf Tunnel-Beendigung (Ctrl+C zum Stoppen)"
  wait "$pid"
}

main "$@"
