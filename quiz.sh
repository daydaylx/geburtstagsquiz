#!/usr/bin/env bash
# quiz.sh — Privatquiz starten
# Aufruf: ./quiz.sh  oder  quiz  (wenn ~/.local/bin/quiz angelegt ist)
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

DOMAIN="quiz.disaai.de"
CONFIG_FILE="$PROJECT_DIR/.cloudflared/config.yml"
STATE_DIR="${STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/privatquiz}"
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
warn() { printf "${YELLOW}  !  %s${NC}\n"   "$*" >&2; }
fail() { printf "${RED}  ✗  %s${NC}\n"    "$*" >&2; }
die()  { printf "\n${RED}${BOLD}Fehler: %s${NC}\n" "$*" >&2; exit 1; }

# ── Cleanup ────────────────────────────────────────────────────────────────────
_cleanup_done=0
cleanup() {
  [[ "$_cleanup_done" == "1" ]] && return
  _cleanup_done=1
  trap - EXIT INT TERM
  printf "\n%s%s⏹  Stoppe alle Dienste...%s\n" "$YELLOW" "$BOLD" "$NC"
  local f pid
  for f in "$STATE_DIR"/*.pid; do
    [[ -f "$f" ]] || continue
    pid="$(read_pid_file "$f")" || continue
    terminate_process "$pid"
  done
  sleep 2
  for f in "$STATE_DIR"/*.pid; do
    [[ -f "$f" ]] || continue
    pid="$(read_pid_file "$f")" || continue
    process_running "$pid" && force_kill_process "$pid"
    rm -f "$f"
  done
  printf "%s✓  Gestoppt.%s\n\n" "$GREEN" "$NC"
}

# ── Hilfsfunktionen ────────────────────────────────────────────────────────────
is_pid() {
  [[ "${1:-}" =~ ^[0-9]+$ ]]
}

process_running() {
  local pid="${1:-}"
  is_pid "$pid" || return 1
  kill -0 -- "-$pid" 2>/dev/null || kill -0 "$pid" 2>/dev/null
}

terminate_process() {
  local pid="${1:-}"
  is_pid "$pid" || return 0
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
}

force_kill_process() {
  local pid="${1:-}"
  is_pid "$pid" || return 0
  kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
}

read_pid_file() {
  local f="$1" pid
  [[ -f "$f" ]] || return 1
  pid="$(cat "$f" 2>/dev/null || true)"
  if is_pid "$pid"; then
    printf "%s" "$pid"
    return 0
  fi
  fail "Ignoriere ungueltige PID-Datei: $f (${pid:-leer})"
  rm -f "$f"
  return 1
}

stop_previous() {
  local f pid found=0
  for f in "$STATE_DIR"/*.pid; do
    [[ -f "$f" ]] || continue
    found=1
    pid="$(read_pid_file "$f")" || continue
    terminate_process "$pid"
  done
  if (( found == 1 )); then
    sleep 2
  fi
  for f in "$STATE_DIR"/*.pid; do
    [[ -f "$f" ]] || continue
    pid="$(read_pid_file "$f")" || continue
    process_running "$pid" && force_kill_process "$pid"
    rm -f "$f"
  done
}

start_bg() {
  local name="$1" pid; shift
  mkdir -p "$LOG_DIR"
  (cd "$PROJECT_DIR" && exec setsid "$@") >"$LOG_DIR/$name.log" 2>&1 &
  pid="$!"
  printf "%s\n" "$pid" >"$STATE_DIR/$name.pid"
}

port_listener_pids() {
  local port="$1"
  ss -H -ltnp "sport = :$port" 2>/dev/null \
    | sed -nE 's/.*pid=([0-9]+).*/\1/p' \
    | sort -u || true
}

pid_command() {
  local pid="$1"
  tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null || true
}

pid_cwd() {
  local pid="$1"
  readlink "/proc/$pid/cwd" 2>/dev/null || true
}

pid_belongs_to_project() {
  local pid="$1" cmd cwd
  cmd="$(pid_command "$pid")"
  cwd="$(pid_cwd "$pid")"
  [[ "$cmd" == *"$PROJECT_DIR"* || "$cwd" == "$PROJECT_DIR" || "$cwd" == "$PROJECT_DIR/"* ]]
}

describe_pid() {
  local pid="$1" cmd
  cmd="$(pid_command "$pid")"
  if [[ -n "$cmd" ]]; then
    printf "PID %s (%s)" "$pid" "$cmd"
  else
    printf "PID %s" "$pid"
  fi
}

stop_project_port_listeners() {
  local port pid stopped=0 foreign=0
  for port in "$@"; do
    while IFS= read -r pid; do
      [[ -n "$pid" ]] || continue
      if pid_belongs_to_project "$pid"; then
        kill -TERM "$pid" 2>/dev/null || true
        stopped=1
      else
        fail "Port $port belegt durch anderen Prozess: $(describe_pid "$pid")"
        foreign=1
      fi
    done < <(port_listener_pids "$port")
  done

  (( foreign == 0 )) || die "Benötigte Ports sind belegt."

  if (( stopped == 1 )); then
    sleep 2
    for port in "$@"; do
      while IFS= read -r pid; do
        [[ -n "$pid" ]] || continue
        if pid_belongs_to_project "$pid"; then
          kill -KILL "$pid" 2>/dev/null || true
        fi
      done < <(port_listener_pids "$port")
    done
    sleep 0.5
  fi
}

assert_ports_free() {
  local port pid occupied=0
  for port in "$@"; do
    while IFS= read -r pid; do
      [[ -n "$pid" ]] || continue
      fail "Port $port weiterhin belegt: $(describe_pid "$pid")"
      occupied=1
    done < <(port_listener_pids "$port")
  done
  (( occupied == 0 )) || die "Benötigte Ports sind nicht frei."
}

wait_health() {
  local name="$1" url="$2" pid_file="${3:-}" i=0 pid
  printf "    %-14s" "$name"
  until curl -sf --max-time 2 "$url" >/dev/null 2>&1; do
    if [[ -n "$pid_file" && -f "$pid_file" ]]; then
      pid="$(read_pid_file "$pid_file")" || {
        printf " %sABGESTÜRZT%s\n" "$RED" "$NC"
        die "$name hat keine gueltige PID — Log: $LOG_DIR/$name.log"
      }
      if ! process_running "$pid"; then
        printf " %sABGESTÜRZT%s\n" "$RED" "$NC"
        die "$name abgestürzt — Log: $LOG_DIR/$name.log"
      fi
    fi
    if (( i++ > 90 )); then
      printf " %sTIMEOUT%s\n" "$RED" "$NC"
      die "$name nicht bereit — Log: $LOG_DIR/$name.log"
    fi
    printf "."
    sleep 0.5
  done
  printf " %s✓%s\n" "$GREEN" "$NC"
}

wait_public_url() {
  local name="$1" url="$2" i=0 response body http_status curl_status
  printf "    %-14s" "$name"
  while true; do
    set +e
    response="$(curl -sS --max-time 5 --write-out $'\n%{http_code}' "$url" 2>&1)"
    curl_status="$?"
    set -e
    http_status="${response##*$'\n'}"
    body="${response%$'\n'*}"
    if [[
      "$curl_status" == "0" &&
      "$http_status" =~ ^[0-9]+$ &&
      "$http_status" -ge 200 &&
      "$http_status" -lt 400 &&
      "$body" != *"error code: 1033"*
    ]]; then
      printf " %s✓%s\n" "$GREEN" "$NC"
      return 0
    fi
    if (( i++ > 18 )); then
      printf " %sTIMEOUT%s\n" "$RED" "$NC"
      if [[ "$body" == *"error code: 1033"* ]]; then
        die "$name nicht erreichbar: Cloudflare 1033. Tunnel ist nicht aktiv oder nicht mit Cloudflare verbunden."
      fi
      die "$name nicht erreichbar: $url (HTTP ${http_status:-unbekannt}, curl $curl_status)"
    fi
    printf "."
    sleep 2
  done
}

open_browser_url() {
  local url="$1"
  [[ "${OPEN_HOST_BROWSER:-true}" == "true" ]] || return 0
  if command -v xdg-open >/dev/null; then
    xdg-open "$url" >/dev/null 2>&1 &
  elif command -v open >/dev/null; then
    open "$url" >/dev/null 2>&1 &
  fi
}

# ── HDMI-Display ───────────────────────────────────────────────────────────────
is_disabled_value() {
  case "${1:-}" in
    0 | false | FALSE | False | no | NO | No | off | OFF | Off) return 0 ;;
    *) return 1 ;;
  esac
}

xrandr_query() {
  xrandr --query 2>/dev/null || true
}

detect_hdmi_output() {
  awk '$2 == "connected" && $1 ~ /^HDMI/ { print $1; exit }'
}

detect_primary_output() {
  awk '$2 == "connected" && $3 == "primary" { print $1; exit }'
}

detect_preferred_mode() {
  local output="$1"
  awk -v output="$output" '
    $1 == output && $2 == "connected" {
      in_output = 1
      next
    }
    in_output && /^[^[:space:]]/ {
      in_output = 0
    }
    in_output && /^[[:space:]]+[0-9]+x[0-9]+/ {
      if (first == "") first = $1
      if ($0 ~ /\+/) {
        print $1
        printed = 1
        exit
      }
    }
    END {
      if (!printed && first != "") print first
    }
  '
}

append_hdmi_position_args() {
  local -n target_args="$1"
  local position="$2" output="$3" primary="$4"

  case "$position" in
    none | "")
      ;;
    primary)
      target_args+=(--primary)
      ;;
    right-of-primary)
      [[ -n "$primary" && "$primary" != "$output" ]] && target_args+=(--right-of "$primary")
      ;;
    left-of-primary)
      [[ -n "$primary" && "$primary" != "$output" ]] && target_args+=(--left-of "$primary")
      ;;
    above-primary)
      [[ -n "$primary" && "$primary" != "$output" ]] && target_args+=(--above "$primary")
      ;;
    below-primary)
      [[ -n "$primary" && "$primary" != "$output" ]] && target_args+=(--below "$primary")
      ;;
    *)
      warn "Unbekannte HDMI-Position '$position'; nutze keine Positionsaenderung."
      ;;
  esac
}

configure_hdmi_display() {
  local setup="${QUIZ_HDMI_SETUP:-auto}"
  if is_disabled_value "$setup"; then
    ok "HDMI-Anpassung deaktiviert"
    return 0
  fi

  if [[ -z "${DISPLAY:-}" ]]; then
    ok "Kein X-Display aktiv; HDMI-Anpassung uebersprungen"
    return 0
  fi

  if ! command -v xrandr >/dev/null; then
    warn "xrandr nicht gefunden; HDMI-Aufloesung bitte im Betriebssystem setzen."
    return 0
  fi

  local query output mode scale position primary
  query="$(xrandr_query)"
  output="${QUIZ_HDMI_OUTPUT:-}"
  if [[ -z "$output" ]]; then
    output="$(printf "%s\n" "$query" | detect_hdmi_output)"
  fi

  if [[ -z "$output" ]]; then
    ok "Kein verbundenes HDMI-Display erkannt"
    return 0
  fi

  if ! printf "%s\n" "$query" | awk -v output="$output" '$1 == output && $2 == "connected" { found = 1 } END { exit found ? 0 : 1 }'; then
    warn "HDMI-Ausgang '$output' ist nicht verbunden; HDMI-Anpassung uebersprungen."
    return 0
  fi

  mode="${QUIZ_HDMI_MODE:-}"
  if [[ -z "$mode" ]]; then
    mode="$(printf "%s\n" "$query" | detect_preferred_mode "$output")"
  fi
  scale="${QUIZ_HDMI_SCALE:-1x1}"
  position="${QUIZ_HDMI_POSITION:-right-of-primary}"
  primary="$(printf "%s\n" "$query" | detect_primary_output)"

  local args=(--output "$output")
  [[ -n "$mode" ]] && args+=(--mode "$mode")
  [[ -n "$scale" ]] && args+=(--scale "$scale")
  append_hdmi_position_args args "$position" "$output" "$primary"

  if xrandr "${args[@]}" >/dev/null 2>&1; then
    ok "HDMI $output auf ${mode:-aktuellen Modus}, Skalierung ${scale:-unveraendert}"
  else
    warn "HDMI-Anpassung fehlgeschlagen: xrandr ${args[*]}"
  fi
}

# ── Dashboard ──────────────────────────────────────────────────────────────────
show_dashboard() {
  local SEP="═══════════════════════════════════════════════════════"
  local server="https://api.$DOMAIN"
  local tv="https://tv.$DOMAIN"
  local host="https://host.$DOMAIN"
  local player="https://play.$DOMAIN"

  clear
  printf "\n%s%s%s%s\n" "$BLUE" "$BOLD" "$SEP" "$NC"
  printf "%s%s   🎲  PRIVATQUIZ LÄUFT  🎉%s\n" "$BLUE" "$BOLD" "$NC"
  printf "%s%s%s%s\n\n" "$BLUE" "$BOLD" "$SEP" "$NC"
  printf "   %s✓%s  Server      %s→%s  %s\n" "$GREEN" "$NC" "$DIM" "$NC" "$server"
  printf "   %s✓%s  TV-Display  %s→%s  %s\n" "$GREEN" "$NC" "$DIM" "$NC" "$tv"
  printf "   %s✓%s  Host        %s→%s  %s  %s(Start hier)%s\n" "$GREEN" "$NC" "$DIM" "$NC" "$host" "$BOLD" "$NC"
  printf "   %s✓%s  Spieler     %s→%s  %s\n" "$GREEN" "$NC" "$DIM" "$NC" "$player"
  printf "   %s✓%s  Tunnel      %s→%s  aktiv (cloudflared)\n" "$GREEN" "$NC" "$DIM" "$NC"
  printf "\n   Ablauf: Host öffnet Raum → Button \"Display öffnen\" → TV-Fenster auf HDMI ziehen.\n"
  printf "\n   ${DIM}Logs:${NC}  %s\n" "$LOG_DIR"
  printf "\n%s%s%s%s\n" "$BLUE" "$BOLD" "$SEP" "$NC"
  printf "   %s%sCtrl+C zum sauberen Stoppen%s\n" "$YELLOW" "$BOLD" "$NC"
  printf "%s%s%s%s\n\n" "$BLUE" "$BOLD" "$SEP" "$NC"

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
  command -v corepack >/dev/null || die "corepack nicht gefunden."
  command -v curl     >/dev/null || die "curl nicht gefunden."
  command -v ss       >/dev/null || die "ss nicht gefunden."
  command -v setsid   >/dev/null || die "setsid nicht gefunden."
  command -v cloudflared >/dev/null || die "cloudflared nicht gefunden (erwartet in PATH)."
  [[ -d "$PROJECT_DIR/node_modules" ]] || die "node_modules fehlt — bitte: corepack pnpm install"
  [[ -f "$CONFIG_FILE" ]] || die "Tunnel-Config fehlt: $CONFIG_FILE"
}

# ── Hauptprogramm ──────────────────────────────────────────────────────────────
main() {
  mkdir -p "$STATE_DIR"

  clear
  printf "\n${BOLD}${CYAN}Quizrunde${NC}  –  Modus: ${BOLD}Tunnel (quiz.disaai.de)${NC}\n"

  check_prereqs

  step "Passe HDMI-Display an"
  configure_hdmi_display

  step "Räume vorherigen Lauf auf"
  stop_previous
  stop_project_port_listeners 3001 5173 5174 5175
  assert_ports_free 3001 5173 5174 5175
  ok "Bereit"

  trap cleanup EXIT INT TERM

  # ── Umgebungsvariablen ────────────────────────────────────────────────────
  export HOST=0.0.0.0
  export PORT=3001
  export VITE_DISPLAY_URL="https://tv.$DOMAIN"
  export VITE_HOST_URL="https://host.$DOMAIN"
  export VITE_PLAYER_JOIN_BASE_URL="https://play.$DOMAIN"
  export VITE_SERVER_SOCKET_URL="wss://api.$DOMAIN"
  export ALLOWED_ORIGINS="http://localhost:5173,http://localhost:5174,http://localhost:5175,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175,https://tv.$DOMAIN,https://host.$DOMAIN,https://play.$DOMAIN"
  # ─────────────────────────────────────────────────────────────────────────

  step "Starte Server"
  start_bg server corepack pnpm --filter @quiz/server dev
  wait_health "Server" "http://localhost:3001/health" "$STATE_DIR/server.pid"

  step "Starte Frontends"
  start_bg display corepack pnpm --filter @quiz/web-display dev -- --host 0.0.0.0 --port 5175 --strictPort
  start_bg host    corepack pnpm --filter @quiz/web-host    dev -- --host 0.0.0.0 --port 5173 --strictPort
  start_bg player  corepack pnpm --filter @quiz/web-player  dev -- --host 0.0.0.0 --port 5174 --strictPort
  wait_health "Display" "http://localhost:5175" "$STATE_DIR/display.pid"
  wait_health "Host"    "http://localhost:5173" "$STATE_DIR/host.pid"
  wait_health "Player"  "http://localhost:5174" "$STATE_DIR/player.pid"

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

  step "Pruefe oeffentliche Tunnel-URLs"
  wait_public_url "API" "https://api.$DOMAIN/health"
  wait_public_url "TV-Display" "https://tv.$DOMAIN"
  wait_public_url "Host" "https://host.$DOMAIN"
  wait_public_url "Spieler" "https://play.$DOMAIN"

  open_browser_url "https://host.$DOMAIN"

  show_dashboard

  # Läuft weiter; meldet abgestürzte Kindprozesse
  local f pid name
  while true; do
    sleep 5
    for f in "$STATE_DIR"/*.pid; do
      [[ -f "$f" ]] || continue
      pid="$(read_pid_file "$f")" || continue
      name="$(basename "$f" .pid)"
      if ! process_running "$pid"; then
        fail "$name abgestürzt — Log: $LOG_DIR/$name.log"
        exit 1
      fi
    done
  done
}

main "$@"
