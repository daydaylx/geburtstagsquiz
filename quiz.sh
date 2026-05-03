#!/usr/bin/env bash
# quiz.sh — Geburtstagsquiz starten
# Aufruf: ./quiz.sh  oder  quiz  (wenn ~/.local/bin/quiz angelegt ist)
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

DOMAIN="quiz.disaai.de"
CONFIG_FILE="$PROJECT_DIR/.cloudflared/config.yml"
STATE_DIR="${STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/geburtstagsquiz}"
LOG_DIR="$STATE_DIR/logs"

# ── ANSI ──────────────────────────────────────────────────────────────────────
BOLD=$'\033[1m'
DIM=$'\033[2m'
RED=$'\033[31m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
BLUE=$'\033[34m'
CYAN=$'\033[36m'
NC=$'\033[0m'

step() { printf "\n${CYAN}${BOLD}▶  %s${NC}\n" "$*"; }
ok()   { printf "${GREEN}  ✓  %s${NC}\n"   "$*"; }
fail() { printf "${RED}  ✗  %s${NC}\n"    "$*" >&2; }
die()  { printf "\n${RED}${BOLD}Fehler: %s${NC}\n" "$*" >&2; exit 1; }

# ── Cleanup ────────────────────────────────────────────────────────────────────
_cleanup_done=0
cleanup() {
  [[ "$_cleanup_done" == "1" ]] && return
  _cleanup_done=1
  trap - EXIT INT TERM
  printf "\n${YELLOW}${BOLD}⏹  Stoppe alle Dienste...${NC}\n"
  local f pid
  for f in "$STATE_DIR"/*.pid; do
    [[ -f "$f" ]] || continue
    pid="$(cat "$f")" || continue
    kill -TERM "$pid" 2>/dev/null || true
  done
  sleep 2
  for f in "$STATE_DIR"/*.pid; do
    [[ -f "$f" ]] || continue
    pid="$(cat "$f")" || continue
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
    rm -f "$f"
  done
  printf "${GREEN}✓  Gestoppt.${NC}\n\n"
}

# ── Hilfsfunktionen ────────────────────────────────────────────────────────────
stop_previous() {
  local f pid
  for f in "$STATE_DIR"/*.pid; do
    [[ -f "$f" ]] || continue
    pid="$(cat "$f")" || continue
    kill -TERM "$pid" 2>/dev/null || true
    rm -f "$f"
  done
}

start_bg() {
  local name="$1"; shift
  mkdir -p "$LOG_DIR"
  (cd "$PROJECT_DIR" && exec "$@") >"$LOG_DIR/$name.log" 2>&1 &
  printf "%d" "$!" >"$STATE_DIR/$name.pid"
}

wait_health() {
  local name="$1" url="$2" i=0
  printf "    %-14s" "$name"
  until curl -sf --max-time 2 "$url" >/dev/null 2>&1; do
    if (( i++ > 90 )); then
      printf " ${RED}TIMEOUT${NC}\n"
      die "$name nicht bereit — Log: $LOG_DIR/$name.log"
    fi
    printf "."
    sleep 0.5
  done
  printf " ${GREEN}✓${NC}\n"
}

# ── Menü (whiptail) ────────────────────────────────────────────────────────────
pick_mode() {
  local raw=""
  if ! raw="$(
    whiptail \
      --title "  🎂  Geburtstagsquiz  " \
      --menu "\nModus wählen:" \
      13 54 3 \
      "tunnel" "Tunnel-Modus  →  quiz.disaai.de" \
      "lokal"  "Lokal-Modus   →  localhost" \
      "exit"   "Beenden" \
      3>&1 1>&2 2>&3
  )"; then
    raw="exit"
  fi
  printf "%s" "${raw:-exit}"
}

# ── Dashboard ──────────────────────────────────────────────────────────────────
show_dashboard() {
  local mode="$1"
  local SEP="═══════════════════════════════════════════════════════"
  local tv host player server

  if [[ "$mode" == "tunnel" ]]; then
    server="http://localhost:3001"
    tv="https://tv.$DOMAIN"
    host="https://host.$DOMAIN"
    player="https://play.$DOMAIN"
  else
    server="http://localhost:3001"
    tv="http://localhost:5175"
    host="http://localhost:5173"
    player="http://localhost:5174"
  fi

  clear
  printf "\n${BLUE}${BOLD}%s${NC}\n" "$SEP"
  printf "${BLUE}${BOLD}   🎂  GEBURTSTAGSQUIZ LÄUFT  🎉${NC}\n"
  printf "${BLUE}${BOLD}%s${NC}\n\n" "$SEP"
  printf "   ${GREEN}✓${NC}  Server      ${DIM}→${NC}  %s\n" "$server"
  printf "   ${GREEN}✓${NC}  TV-Display  ${DIM}→${NC}  %s\n" "$tv"
  printf "   ${GREEN}✓${NC}  Host        ${DIM}→${NC}  %s\n" "$host"
  printf "   ${GREEN}✓${NC}  Spieler     ${DIM}→${NC}  %s\n" "$player"
  if [[ "$mode" == "tunnel" ]]; then
    printf "   ${GREEN}✓${NC}  Tunnel      ${DIM}→${NC}  aktiv (cloudflared)\n"
  fi
  printf "\n   ${DIM}Logs:${NC}  %s\n" "$LOG_DIR"
  printf "\n${BLUE}${BOLD}%s${NC}\n" "$SEP"
  printf "   ${YELLOW}${BOLD}Ctrl+C zum sauberen Stoppen${NC}\n"
  printf "${BLUE}${BOLD}%s${NC}\n\n" "$SEP"

  local qrpkg="$PROJECT_DIR/apps/web-host/node_modules/qrcode/lib/index.js"
  if [[ -f "$qrpkg" ]]; then
    printf "   QR-Code Spieler-URL:\n\n"
    QRPKG="$qrpkg" PURL="$player" node --input-type=module 2>/dev/null <<'JS' || true
import { pathToFileURL } from "node:url";
const qr = (await import(pathToFileURL(process.env.QRPKG).href)).default;
process.stdout.write(await qr.toString(process.env.PURL, { type: "utf8", small: true }));
JS
  fi
}

# ── Voraussetzungen ────────────────────────────────────────────────────────────
check_prereqs() {
  local mode="$1"
  command -v corepack >/dev/null || die "corepack nicht gefunden."
  command -v curl     >/dev/null || die "curl nicht gefunden."
  [[ -d "$PROJECT_DIR/node_modules" ]] || die "node_modules fehlt — bitte: corepack pnpm install"
  if [[ "$mode" == "tunnel" ]]; then
    command -v cloudflared >/dev/null || die "cloudflared nicht gefunden (erwartet in PATH)."
    [[ -f "$CONFIG_FILE" ]]           || die "Tunnel-Config fehlt: $CONFIG_FILE"
  fi
}

# ── Hauptprogramm ──────────────────────────────────────────────────────────────
main() {
  mkdir -p "$STATE_DIR"

  local mode
  mode="$(pick_mode)"
  [[ "$mode" == "exit" ]] && exit 0

  clear
  printf "\n${BOLD}${CYAN}🎂 Geburtstagsquiz${NC}  –  Modus: ${BOLD}%s${NC}\n" \
    "$( [[ "$mode" == "tunnel" ]] && echo "Tunnel (quiz.disaai.de)" || echo "Lokal (localhost)" )"

  check_prereqs "$mode"

  step "Räume vorherigen Lauf auf"
  stop_previous
  ok "Bereit"

  trap cleanup EXIT INT TERM

  # ── Umgebungsvariablen ────────────────────────────────────────────────────
  export HOST=0.0.0.0
  export PORT=3001
  export SERVER_PORT=3001

  if [[ "$mode" == "tunnel" ]]; then
    export VITE_DISPLAY_URL="https://tv.$DOMAIN"
    export VITE_HOST_URL="https://host.$DOMAIN"
    export VITE_PLAYER_JOIN_BASE_URL="https://play.$DOMAIN"
    export VITE_SERVER_SOCKET_URL="wss://api.$DOMAIN"
    export ALLOWED_ORIGINS="http://localhost:5173,http://localhost:5174,http://localhost:5175,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175,https://tv.$DOMAIN,https://host.$DOMAIN,https://play.$DOMAIN"
  else
    export VITE_PUBLIC_HOST="localhost"
    export VITE_SERVER_PORT="3001"
    export VITE_HOST_PORT="5173"
    export VITE_PLAYER_PORT="5174"
    export VITE_DISPLAY_URL="http://localhost:5175"
    export VITE_HOST_URL="http://localhost:5173"
    export VITE_PLAYER_JOIN_BASE_URL="http://localhost:5174"
    export VITE_SERVER_SOCKET_URL="ws://localhost:3001"
    export ALLOWED_ORIGINS="http://localhost:5173,http://localhost:5174,http://localhost:5175,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175"
  fi
  # ─────────────────────────────────────────────────────────────────────────

  step "Starte Server"
  start_bg server corepack pnpm --filter @quiz/server dev
  wait_health "Server" "http://localhost:3001/health"

  step "Starte Frontends"
  start_bg display corepack pnpm --filter @quiz/web-display dev -- --host 0.0.0.0 --port 5175 --strictPort
  start_bg host    corepack pnpm --filter @quiz/web-host    dev -- --host 0.0.0.0 --port 5173 --strictPort
  start_bg player  corepack pnpm --filter @quiz/web-player  dev -- --host 0.0.0.0 --port 5174 --strictPort
  wait_health "Display" "http://localhost:5175"
  wait_health "Host"    "http://localhost:5173"
  wait_health "Player"  "http://localhost:5174"

  if [[ "$mode" == "tunnel" ]]; then
    step "Starte Cloudflare Tunnel"
    start_bg tunnel cloudflared tunnel --config "$CONFIG_FILE" run quiz
    sleep 3
    local tp
    tp="$(cat "$STATE_DIR/tunnel.pid" 2>/dev/null || echo 0)"
    kill -0 "$tp" 2>/dev/null || {
      cat "$LOG_DIR/tunnel.log" >&2
      die "Tunnel konnte nicht gestartet werden."
    }
    ok "Tunnel läuft (PID $tp)"
  fi

  show_dashboard "$mode"

  # Läuft weiter; meldet abgestürzte Kindprozesse
  local f pid name
  while true; do
    sleep 5
    for f in "$STATE_DIR"/*.pid; do
      [[ -f "$f" ]] || continue
      pid="$(cat "$f")" || continue
      name="$(basename "$f" .pid)"
      if ! kill -0 "$pid" 2>/dev/null; then
        fail "$name abgestürzt — Log: $LOG_DIR/$name.log"
      fi
    done
  done
}

main "$@"
