#!/usr/bin/env bash
set -euo pipefail
SCRIPT_PATH="$(readlink -f -- "${BASH_SOURCE[0]}")"
APP_DIR="$(cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd)"
if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' 'Python 3 não encontrado. No Arch Linux: sudo pacman -S python' >&2
  exit 1
fi
exec python3 "$APP_DIR/server.py" "$@"
