#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd -P)"

export OPEN_DISPLAY_BROWSER="${OPEN_DISPLAY_BROWSER:-1}"
export OPEN_HOST_BROWSER="${OPEN_HOST_BROWSER:-0}"
export STOP_CONFLICTING_PROJECT_PROCESSES="${STOP_CONFLICTING_PROJECT_PROCESSES:-1}"
export FORCE_PORT_CLEANUP="${FORCE_PORT_CLEANUP:-1}"

exec "$PROJECT_DIR/start_local_game_host.sh" "$@"
