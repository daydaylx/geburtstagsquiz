#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd -P)"

HOTSPOT_SSID="${HOTSPOT_SSID:-Geburtstagsquiz-Offen}"
HOTSPOT_PROFILE="${HOTSPOT_PROFILE:-geburtstagsquiz-hotspot}"
WIFI_IFACE="${WIFI_IFACE:-}"
HOTSPOT_CHANNEL="${HOTSPOT_CHANNEL:-1}"
HOTSPOT_IPV4_ADDR="${HOTSPOT_IPV4_ADDR:-10.42.0.1}"
HOTSPOT_WATCHDOG_INTERVAL_SECONDS="${HOTSPOT_WATCHDOG_INTERVAL_SECONDS:-5}"

PORT="${PORT:-3001}"
HOST_WEB_PORT="${HOST_WEB_PORT:-5173}"
PLAYER_WEB_PORT="${PLAYER_WEB_PORT:-5174}"

START_COMMAND="${START_COMMAND:-}"
OPEN_HOST_BROWSER="${OPEN_HOST_BROWSER:-1}"
STOP_CONFLICTING_PROJECT_PROCESSES="${STOP_CONFLICTING_PROJECT_PROCESSES:-1}"
FORCE_PORT_CLEANUP="${FORCE_PORT_CLEANUP:-0}"

for arg in "$@"; do
  case "$arg" in
    --force-port-cleanup) FORCE_PORT_CLEANUP="1" ;;
  esac
done

STATE_DIR="${STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/geburtstagsquiz-local-game-host}"
LOG_DIR="$STATE_DIR/logs"
PID_FILE="$STATE_DIR/pids"
START_PID_FILE="$STATE_DIR/start.pid"
PROFILE_FILE="$STATE_DIR/hotspot-profile"
PROFILE_CREATED_FILE="$STATE_DIR/hotspot-profile-created"
IFACE_FILE="$STATE_DIR/wifi-iface"
UFW_RULES_FILE="$STATE_DIR/ufw-rules"

HOTSPOT_IP=""

sudo() {
  if [[ -n "${SUDO_ASKPASS:-}" ]]; then
    command sudo -A "$@"
  else
    command sudo "$@"
  fi
}

info() { printf "\n==> %s\n" "$*"; }
warn() { printf "WARNUNG: %s\n" "$*" >&2; }
die() { printf "FEHLER: %s\n" "$*" >&2; exit 1; }

is_private_ipv4() {
  local ip="$1"

  [[ "$ip" =~ ^10\. ]] && return 0
  [[ "$ip" =~ ^192\.168\. ]] && return 0
  [[ "$ip" =~ ^172\.(1[6-9]|2[0-9]|3[01])\. ]] && return 0

  return 1
}

detect_hotspot_ip() {
  local addr
  local -a candidates=()
  local hotspot_prefix="${HOTSPOT_IPV4_ADDR%.*}."

  while IFS= read -r addr; do
    [[ -n "$addr" ]] || continue
    candidates+=("$addr")
  done < <(nmcli -g IP4.ADDRESS device show "$WIFI_IFACE" 2>/dev/null | cut -d/ -f1)

  if [[ ${#candidates[@]} -eq 0 ]]; then
    while IFS= read -r addr; do
      [[ -n "$addr" ]] || continue
      candidates+=("$addr")
    done < <(ip -4 -o addr show dev "$WIFI_IFACE" scope global 2>/dev/null | awk '{ split($4,a,"/"); print a[1] }')
  fi

  for addr in "${candidates[@]}"; do
    if [[ "$addr" == "$HOTSPOT_IPV4_ADDR" ]]; then
      printf "%s\n" "$addr"
      return 0
    fi
  done

  for addr in "${candidates[@]}"; do
    if [[ "$addr" == "$hotspot_prefix"* ]]; then
      printf "%s\n" "$addr"
      return 0
    fi
  done

  for addr in "${candidates[@]}"; do
    if is_private_ipv4 "$addr"; then
      printf "%s\n" "$addr"
      return 0
    fi
  done

  if [[ ${#candidates[@]} -gt 0 ]]; then
    printf "%s\n" "${candidates[0]}"
    return 0
  fi

  return 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 fehlt. Bitte installieren oder Pfad pruefen."
}

cleanup_on_exit() {
  local code=$?
  trap - EXIT INT TERM

  if [[ -x "$PROJECT_DIR/stop_local_game_host.sh" ]]; then
    "$PROJECT_DIR/stop_local_game_host.sh" --from-start-trap || true
  fi

  exit "$code"
}

stop_previous_script_run() {
  if [[ -f "$PID_FILE" || -f "$PROFILE_FILE" || -f "$UFW_RULES_FILE" ]]; then
    info "Raeume alten lokalen Spiel-Host-Lauf auf"
    "$PROJECT_DIR/stop_local_game_host.sh" --from-start-restart || true
  fi
}

check_prerequisites() {
  need_cmd nmcli
  need_cmd iw
  need_cmd ip
  need_cmd ss
  need_cmd corepack

  systemctl is-active --quiet NetworkManager 2>/dev/null ||
    die "NetworkManager ist nicht aktiv. Bitte NetworkManager starten."

  [[ -f "$PROJECT_DIR/package.json" ]] ||
    die "Kein package.json in PROJECT_DIR=$PROJECT_DIR gefunden."

  corepack pnpm --version >/dev/null 2>&1 ||
    die "pnpm ist ueber corepack nicht verfuegbar."

  [[ -d "$PROJECT_DIR/node_modules" ]] ||
    die "node_modules fehlt. Einmal ausfuehren: corepack pnpm install"

  if [[ -z "$START_COMMAND" ]]; then
    [[ -f "$PROJECT_DIR/apps/server/package.json" &&
       -f "$PROJECT_DIR/apps/web-host/package.json" &&
       -f "$PROJECT_DIR/apps/web-player/package.json" ]] ||
      die "Projektstruktur fuer Server/Web-Host/Web-Player nicht gefunden."
  fi
}

detect_wifi_iface() {
  if [[ -n "$WIFI_IFACE" ]]; then
    nmcli -t -f DEVICE,TYPE device status |
      awk -F: -v dev="$WIFI_IFACE" '$1 == dev && $2 == "wifi" { found=1 } END { exit !found }' ||
      die "WIFI_IFACE=$WIFI_IFACE ist kein NetworkManager-WLAN-Geraet."
  else
    WIFI_IFACE="$(
      nmcli -t -f DEVICE,TYPE,STATE device status |
        awk -F: '
          $2 == "wifi" && $3 == "disconnected" { disconnected = $1; exit }
          $2 == "wifi" && $3 == "unavailable" { fallback = fallback ? fallback : $1 }
          $2 == "wifi" && $3 == "connected" { connected = connected ? connected : $1 }
          END {
            if (disconnected) {
              print disconnected
            } else if (fallback) {
              print fallback
            } else if (connected) {
              print connected
            }
          }
        '
    )"
  fi

  [[ -n "$WIFI_IFACE" ]] || die "Kein WLAN-Adapter gefunden."
  iw dev "$WIFI_IFACE" info >/dev/null 2>&1 ||
    die "WLAN-Adapter $WIFI_IFACE ist fuer iw nicht nutzbar."

  iw list | grep -qE '^[[:space:]]*\* AP$' ||
    die "WLAN-Hardware/Treiber meldet keinen AP-/Hotspot-Modus."

  mkdir -p "$STATE_DIR"
  printf "%s\n" "$WIFI_IFACE" > "$IFACE_FILE"
}

port_pids() {
  local port="$1"

  ss -H -ltnp 2>/dev/null |
    awk -v suffix=":$port" '$4 ~ suffix "$" { print }' |
    grep -oE 'pid=[0-9]+' |
    cut -d= -f2 |
    sort -u || true
}

pid_belongs_to_project() {
  local pid="$1"
  local cmdline=""
  local cwd=""

  [[ -r "/proc/$pid/cmdline" ]] || return 1
  cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  [[ "$cmdline" == *"$PROJECT_DIR"* ]] && return 0

  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  [[ "$cwd" == "$PROJECT_DIR"* ]]
}

stop_pid() {
  local pid="$1"

  kill -TERM "$pid" 2>/dev/null || true
  for _ in {1..20}; do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.2
  done

  kill -KILL "$pid" 2>/dev/null || true
}

ensure_ports_free() {
  local ports=("$PORT" "$HOST_WEB_PORT" "$PLAYER_WEB_PORT")
  local port pid
  local -a pids

  for port in "${ports[@]}"; do
    mapfile -t pids < <(port_pids "$port")
    [[ ${#pids[@]} -eq 0 ]] && continue

    for pid in "${pids[@]}"; do
      if [[ "$STOP_CONFLICTING_PROJECT_PROCESSES" == "1" ]] && pid_belongs_to_project "$pid"; then
        warn "Stoppe vorhandenen Projektprozess PID $pid auf Port $port"
        stop_pid "$pid"
      elif [[ "$FORCE_PORT_CLEANUP" == "1" ]]; then
        warn "Stoppe Prozess PID $pid auf Port $port wegen --force-port-cleanup"
        stop_pid "$pid"
      else
        die "Port $port ist belegt durch PID $pid. Stoppe den Prozess oder starte mit --force-port-cleanup."
      fi
    done
  done

  for port in "${ports[@]}"; do
    mapfile -t pids < <(port_pids "$port")
    [[ ${#pids[@]} -eq 0 ]] || die "Port $port ist weiterhin belegt."
  done
}

start_hotspot() {
  info "Starte Hotspot $HOTSPOT_SSID auf $WIFI_IFACE"

  nmcli radio wifi on >/dev/null 2>&1 || true

  if nmcli -t -f NAME connection show | grep -Fxq "$HOTSPOT_PROFILE"; then
    info "Erzeuge Hotspot-Profil $HOTSPOT_PROFILE sauber neu"
    nmcli connection down "$HOTSPOT_PROFILE" >/dev/null 2>&1 || true
    nmcli connection delete "$HOTSPOT_PROFILE" >/dev/null ||
      die "Altes Hotspot-Profil $HOTSPOT_PROFILE konnte nicht geloescht werden."
  fi

  nmcli connection add type wifi ifname "$WIFI_IFACE" con-name "$HOTSPOT_PROFILE" autoconnect no ssid "$HOTSPOT_SSID" >/dev/null

  printf "%s\n" "$HOTSPOT_PROFILE" > "$PROFILE_FILE"
  printf "%s\n" "1" > "$PROFILE_CREATED_FILE"

  nmcli connection modify "$HOTSPOT_PROFILE" \
    connection.autoconnect yes \
    connection.autoconnect-priority 100 \
    connection.interface-name "$WIFI_IFACE" \
    802-11-wireless.mode ap \
    802-11-wireless.band bg \
    802-11-wireless.channel "$HOTSPOT_CHANNEL" \
    802-11-wireless.hidden no \
    802-11-wireless.ssid "$HOTSPOT_SSID" \
    ipv4.method shared \
    ipv4.addresses "$HOTSPOT_IPV4_ADDR/24" \
    ipv6.method disabled

  nmcli connection modify "$HOTSPOT_PROFILE" remove 802-11-wireless-security >/dev/null 2>&1 || true

  nmcli connection modify "$HOTSPOT_PROFILE" 802-11-wireless.powersave 2 >/dev/null 2>&1 ||
    warn "Konnte WLAN-Powersave im NetworkManager-Profil nicht deaktivieren."

  nmcli connection down "$HOTSPOT_PROFILE" >/dev/null 2>&1 || true
  nmcli connection up "$HOTSPOT_PROFILE" >/dev/null ||
    die "Hotspot konnte nicht gestartet werden."

  local ip_addr=""
  for _ in {1..40}; do
    ip_addr="$(detect_hotspot_ip 2>/dev/null || true)"
    [[ -n "$ip_addr" ]] && break

    ip_addr="$(ip -4 -o addr show dev "$WIFI_IFACE" scope global 2>/dev/null | awk '{ split($4,a,"/"); print a[1]; exit }')"
    [[ -n "$ip_addr" ]] && break

    sleep 0.5
  done

  [[ -n "$ip_addr" ]] || die "Keine lokale Hotspot-IP auf $WIFI_IFACE erhalten."
  HOTSPOT_IP="$ip_addr"
}

start_hotspot_watchdog() {
  info "Starte Hotspot-Watchdog"

  (
    while true; do
      sleep "$HOTSPOT_WATCHDOG_INTERVAL_SECONDS"

      if ! nmcli -t -f NAME,DEVICE connection show --active |
        awk -F: -v profile="$HOTSPOT_PROFILE" -v iface="$WIFI_IFACE" '$1 == profile && $2 == iface { found=1 } END { exit !found }'; then
        printf "%s Hotspot-Profil nicht aktiv; starte neu.\n" "$(date -Is)"
        nmcli radio wifi on >/dev/null 2>&1 || true
        nmcli connection up "$HOTSPOT_PROFILE" >/dev/null 2>&1 ||
          printf "%s Hotspot-Neustart fehlgeschlagen.\n" "$(date -Is)"
        continue
      fi

      if ! ip -4 -o addr show dev "$WIFI_IFACE" scope global 2>/dev/null |
        awk -v expected="$HOTSPOT_IPV4_ADDR" '{ split($4, addr, "/"); if (addr[1] == expected) found=1 } END { exit !found }'; then
        printf "%s Hotspot-IP fehlt; erneuere Verbindung.\n" "$(date -Is)"
        nmcli connection up "$HOTSPOT_PROFILE" >/dev/null 2>&1 ||
          printf "%s Hotspot-IP-Erneuerung fehlgeschlagen.\n" "$(date -Is)"
      fi
    done
  ) > "$LOG_DIR/hotspot-watchdog.log" 2>&1 &

  printf "%s %s\n" "$!" "hotspot-watchdog" >> "$PID_FILE"
}

ufw_active() {
  command -v ufw >/dev/null 2>&1 || return 1

  if sudo -n ufw status 2>/dev/null | grep -q "Status: active"; then
    return 0
  fi

  systemctl is-active --quiet ufw 2>/dev/null
}

ensure_ufw_sudo_ready() {
  ufw_active || return 0

  need_cmd sudo

  if sudo -n true 2>/dev/null; then
    return 0
  fi

  if [[ -t 0 ]]; then
    info "UFW ist aktiv; sudo-Passwort wird fuer lokale Portfreigaben benoetigt"
    sudo -v || die "sudo-Bestaetigung fuer UFW fehlgeschlagen."
    return 0
  fi

  die "UFW ist aktiv, aber sudo kann hier kein Passwort abfragen. Bitte in einem Terminal starten oder UFW-Regeln manuell setzen."
}

configure_ufw() {
  : > "$UFW_RULES_FILE"

  if ! ufw_active; then
    rm -f "$UFW_RULES_FILE"
    return 0
  fi

  info "UFW ist aktiv; gebe nur die Spielports auf $WIFI_IFACE frei"

  local port output
  for port in "$PORT" "$HOST_WEB_PORT" "$PLAYER_WEB_PORT"; do
    output="$(sudo ufw allow in on "$WIFI_IFACE" proto tcp to any port "$port" comment "geburtstagsquiz local" 2>&1)" ||
      die "UFW-Regel fuer Port $port konnte nicht gesetzt werden: $output"

    printf "%s\n" "$output"
    if grep -Eq "Rule added|Rules updated" <<<"$output"; then
      printf "%s %s\n" "$WIFI_IFACE" "$port" >> "$UFW_RULES_FILE"
    fi
  done
}

start_one() {
  local name="$1"
  local cmd="$2"

  info "Starte $name"
  (
    cd "$PROJECT_DIR"
    if command -v setsid >/dev/null 2>&1; then
      exec setsid bash -lc "$cmd"
    else
      exec bash -lc "$cmd"
    fi
  ) > "$LOG_DIR/$name.log" 2>&1 &

  printf "%s %s\n" "$!" "$name" >> "$PID_FILE"
}

start_game_servers() {
  mkdir -p "$LOG_DIR"
  : > "$PID_FILE"

  export HOST="0.0.0.0"
  export PORT
  export VITE_PUBLIC_HOST="$HOTSPOT_IP"
  export VITE_SERVER_PORT="$PORT"
  export VITE_PLAYER_PORT="$PLAYER_WEB_PORT"

  if [[ -n "$START_COMMAND" ]]; then
    start_one "game" "$START_COMMAND"
  else
    start_one "server" "corepack pnpm --filter @quiz/server run dev"
    start_one "web-host" "corepack pnpm --filter @quiz/web-host run dev -- --host 0.0.0.0 --port $HOST_WEB_PORT --strictPort"
    start_one "web-player" "corepack pnpm --filter @quiz/web-player run dev -- --host 0.0.0.0 --port $PLAYER_WEB_PORT --strictPort"
  fi
}

check_child_processes() {
  local pid name

  [[ -f "$PID_FILE" ]] || return 0
  while read -r pid name; do
    [[ -n "${pid:-}" ]] || continue
    kill -0 "$pid" 2>/dev/null || die "$name ist beendet. Logs: $LOG_DIR/$name.log"
  done < "$PID_FILE"
}

wait_http() {
  local name="$1"
  local url="$2"

  if ! command -v curl >/dev/null 2>&1; then
    warn "curl fehlt; ueberspringe HTTP-Check fuer $name"
    return 0
  fi

  for _ in {1..80}; do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi

    check_child_processes
    sleep 0.5
  done

  die "$name ist nicht erreichbar: $url"
}

print_qr_if_available() {
  local player_url="$1"
  local qrcode_pkg="$PROJECT_DIR/apps/web-host/node_modules/qrcode/lib/index.js"

  if [[ -f "$qrcode_pkg" ]]; then
    printf "\nQR fuer Spieler-URL:\n"
    QRCODE_PKG_PATH="$qrcode_pkg" PLAYER_URL="$player_url" node --input-type=module <<'NODE' || true
import process from "node:process";
import { pathToFileURL } from "node:url";

const qrcodeModuleUrl = pathToFileURL(process.env.QRCODE_PKG_PATH ?? "");
const qrcode = (await import(qrcodeModuleUrl.href)).default;
const qr = await qrcode.toString(process.env.PLAYER_URL ?? "", {
  type: "utf8",
  small: true,
});

process.stdout.write(`${qr}\n`);
NODE
  else
    warn "QR-Code-CLI nicht gefunden; Link wird nur als Text ausgegeben."
  fi
}

main() {
  check_prerequisites
  stop_previous_script_run

  mkdir -p "$STATE_DIR" "$LOG_DIR"
  printf "%s\n" "$$" > "$START_PID_FILE"
  trap cleanup_on_exit EXIT INT TERM

  detect_wifi_iface
  ensure_ufw_sudo_ready
  ensure_ports_free
  start_hotspot
  configure_ufw
  start_game_servers
  start_hotspot_watchdog

  local host_url="http://$HOTSPOT_IP:$HOST_WEB_PORT"
  local player_url="http://$HOTSPOT_IP:$PLAYER_WEB_PORT"
  local server_url="http://$HOTSPOT_IP:$PORT"

  wait_http "Server" "$server_url"
  wait_http "Host-UI" "$host_url"
  wait_http "Player-UI" "$player_url"

  if [[ "$OPEN_HOST_BROWSER" == "1" ]] && command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$host_url" >/dev/null 2>&1 || true
  fi

  printf "\n============================================================\n"
  printf " GEBURTSTAGSQUIZ LAEUFT\n"
  printf "============================================================\n"
  printf "Hotspot-Name:      %s\n" "$HOTSPOT_SSID"
  printf "Hotspot-Passwort:  keines (offen)\n"
  printf "WLAN-Interface:    %s\n" "$WIFI_IFACE"
  printf "Lokale IP:         %s\n" "$HOTSPOT_IP"
  printf "Server-Port:       %s\n" "$PORT"
  printf "Host-URL:          %s\n" "$host_url"
  printf "Spieler-URL:       %s\n" "$player_url"
  printf "Healthcheck:       curl %s\n" "$server_url"
  printf "Logs:              %s\n" "$LOG_DIR"
  printf "Stoppen:           Ctrl+C oder ./stop_local_game_host.sh\n"
  printf "============================================================\n"

  print_qr_if_available "$player_url"

  printf "\nHinweis: Raum im Host-Browser erstellen; der Hostscreen zeigt danach den Join-QR mit Raumcode.\n"
  printf "Terminal offen lassen. Ctrl+C stoppt Server und Hotspot sauber.\n"

  while true; do
    sleep 3600 &
    wait $!
  done
}

main "$@"
