#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# stop.sh — Geburtstagsquiz stoppen
# ==============================================================================

STATE_DIR="${STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/geburtstagsquiz}"

info() { printf '\n==> %s\n' "$*"; }

stopped=0
for f in "$STATE_DIR"/*.pid; do
  [[ -f "$f" ]] || continue
  pid="$(cat "$f")"
  name="$(basename "$f" .pid)"
  if kill -TERM "$pid" 2>/dev/null; then
    printf 'Stoppe %s (PID %s)\n' "$name" "$pid"
    (( stopped++ )) || true
  fi
  rm -f "$f"
done

sleep 1

[[ $stopped -gt 0 ]] && info "Alle Dienste gestoppt." || printf 'Nichts lief.\n'
