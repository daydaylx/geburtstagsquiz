#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# stop_tunnel.sh — Cloudflare Tunnel stoppen
# ==============================================================================

STATE_DIR="${STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/geburtstagsquiz-tunnel}"
PID_FILE="$STATE_DIR/tunnel.pid"

info() { printf "\n==> %s\n" "$*"; }

if [[ ! -f "$PID_FILE" ]]; then
  printf "Tunnel laeuft nicht (kein PID-File gefunden).\n"
  exit 0
fi

pid="$(cat "$PID_FILE")"

if ! kill -0 "$pid" 2>/dev/null; then
  printf "Tunnel-Prozess (PID %s) laeuft nicht mehr.\n" "$pid"
  rm -f "$PID_FILE"
  exit 0
fi

info "Stoppe Tunnel (PID %s)" "$pid"
kill -TERM "$pid" 2>/dev/null || true

for _ in {1..20}; do
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.3
done

if kill -0 "$pid" 2>/dev/null; then
  kill -KILL "$pid" 2>/dev/null || true
fi

rm -f "$PID_FILE"
info "Tunnel gestoppt"
