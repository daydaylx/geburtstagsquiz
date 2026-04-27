#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd -P)"
STATE_DIR="${STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/geburtstagsquiz-local-game-host}"

PID_FILE="$STATE_DIR/pids"
START_PID_FILE="$STATE_DIR/start.pid"
PROFILE_FILE="$STATE_DIR/hotspot-profile"
PROFILE_CREATED_FILE="$STATE_DIR/hotspot-profile-created"
UFW_RULES_FILE="$STATE_DIR/ufw-rules"

SKIP_START_PID="0"
for arg in "$@"; do
  case "$arg" in
    --from-start-trap) SKIP_START_PID="1" ;;
  esac
done

info() { printf "==> %s\n" "$*"; }
warn() { printf "WARNUNG: %s\n" "$*" >&2; }

kill_process_group_or_pid() {
  local pid="$1"
  local name="${2:-process}"

  kill -0 "$pid" 2>/dev/null || return 0
  info "Stoppe $name PID $pid"

  kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true

  for _ in {1..20}; do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.2
  done

  kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
}

stop_game_processes() {
  [[ -f "$PID_FILE" ]] || return 0

  tac "$PID_FILE" 2>/dev/null | while read -r pid name; do
    [[ -n "${pid:-}" ]] || continue
    kill_process_group_or_pid "$pid" "${name:-game}"
  done
}

remove_ufw_rules() {
  [[ -f "$UFW_RULES_FILE" ]] || return 0
  command -v ufw >/dev/null 2>&1 || return 0

  while read -r iface port; do
    [[ -n "${iface:-}" && -n "${port:-}" ]] || continue
    info "Entferne UFW-Regel fuer $iface Port $port"
    sudo ufw delete allow in on "$iface" proto tcp to any port "$port" >/dev/null 2>&1 || true
  done < "$UFW_RULES_FILE"
}

stop_hotspot() {
  [[ -f "$PROFILE_FILE" ]] || return 0
  command -v nmcli >/dev/null 2>&1 || return 0

  local profile created
  profile="$(cat "$PROFILE_FILE")"
  created="$(cat "$PROFILE_CREATED_FILE" 2>/dev/null || printf "0")"

  info "Stoppe Hotspot-Profil $profile"
  nmcli connection modify "$profile" connection.autoconnect no >/dev/null 2>&1 || true
  nmcli connection down "$profile" >/dev/null 2>&1 || true

  if [[ "$created" == "1" ]]; then
    info "Loesche vom Skript angelegtes Hotspot-Profil $profile"
    nmcli connection delete "$profile" >/dev/null 2>&1 || true
  else
    warn "Hotspot-Profil $profile war bereits vorhanden und wird nicht geloescht."
  fi
}

stop_start_script() {
  [[ "$SKIP_START_PID" == "0" ]] || return 0
  [[ -f "$START_PID_FILE" ]] || return 0

  local start_pid
  start_pid="$(cat "$START_PID_FILE" 2>/dev/null || true)"
  [[ -n "$start_pid" && "$start_pid" != "$$" ]] || return 0

  kill -0 "$start_pid" 2>/dev/null || return 0
  info "Beende laufendes Startskript PID $start_pid"
  kill -TERM "$start_pid" 2>/dev/null || true
}

cleanup_state_files() {
  rm -f "$PID_FILE" "$START_PID_FILE" "$PROFILE_FILE" "$PROFILE_CREATED_FILE" "$UFW_RULES_FILE" "$STATE_DIR/wifi-iface"
}

main() {
  stop_game_processes
  remove_ufw_rules
  stop_hotspot
  cleanup_state_files
  stop_start_script
  info "Lokaler Spiel-Host ist gestoppt."
}

main "$@"
