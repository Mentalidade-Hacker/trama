#!/usr/bin/env bash
set -euo pipefail
SCRIPT_PATH="$(readlink -f -- "${BASH_SOURCE[0]}")"
APP_DIR="$(cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd)"
exec python3 "$APP_DIR/setup_proofreader.py" "$@"
