#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# setup_tunnel.sh - sicherer Cloudflare-Tunnel-Check fuer quiz.disaai.de
# ==============================================================================
# Dieses Skript erstellt keine Tunnel, keine DNS-Routen und schreibt keine
# Credentials. Es prueft nur cloudflared lesend und verweist auf die Beispiel-
# konfiguration in deploy/cloudflare-tunnel.example.yml.
# ==============================================================================

PROJECT_DIR="${PROJECT_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd -P)"

DOMAIN="${DOMAIN:-quiz.disaai.de}"
TUNNEL_NAME="${TUNNEL_NAME:-geburtstagsquiz}"
EXAMPLE_CONFIG="$PROJECT_DIR/deploy/cloudflare-tunnel.example.yml"
LOCAL_CONFIG="$PROJECT_DIR/.cloudflared/config.yml"

info() { printf "\n==> %s\n" "$*"; }
warn() { printf "WARNUNG: %s\n" "$*" >&2; }

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

main() {
  info "Cloudflare-Tunnel-Setup fuer $DOMAIN wird nur vorbereitet"

  if [[ ! -f "$EXAMPLE_CONFIG" ]]; then
    warn "Beispielkonfiguration fehlt: $EXAMPLE_CONFIG"
  else
    info "Beispielkonfiguration vorhanden: $EXAMPLE_CONFIG"
  fi

  local cloudflared_bin=""
  if cloudflared_bin="$(find_cloudflared)"; then
    info "cloudflared gefunden: $cloudflared_bin"
    "$cloudflared_bin" --version || true

    info "Tunnel-Liste wird nur lesend abgefragt"
    "$cloudflared_bin" tunnel list || warn "Tunnel-Liste nicht lesbar. Ggf. zuerst: cloudflared tunnel login"
  else
    warn "cloudflared nicht gefunden. Installieren oder lokal als $PROJECT_DIR/cloudflared ablegen."
  fi

  printf "\n============================================================\n"
  printf " TUNNEL VORBEREITET - KEINE CLOUDFLARE-AENDERUNGEN\n"
  printf "============================================================\n"
  printf "Ziel-Subdomains:\n"
  printf "  https://tv.%s\n" "$DOMAIN"
  printf "  https://host.%s\n" "$DOMAIN"
  printf "  https://play.%s\n" "$DOMAIN"
  printf "  wss://api.%s\n" "$DOMAIN"
  printf "------------------------------------------------------------\n"
  printf "Beispielconfig:     %s\n" "$EXAMPLE_CONFIG"
  printf "Lokale echte Config: %s (ignoriert, nicht committen)\n" "$LOCAL_CONFIG"
  printf "Tunnel-Name:        %s\n" "$TUNNEL_NAME"
  printf "------------------------------------------------------------\n"
  printf "Dieses Skript erstellt KEINEN Tunnel und KEINE DNS-Routen.\n"
  printf "Echte Cloudflare-Aenderungen nur manuell mit explizitem [CONFIRM].\n"
  printf "============================================================\n"
}

main "$@"
