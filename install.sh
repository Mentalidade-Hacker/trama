#!/usr/bin/env bash
set -euo pipefail
INSTALLER_PATH="$(readlink -f -- "${BASH_SOURCE[0]}")"
SOURCE_DIR="$(cd -- "$(dirname -- "$INSTALLER_PATH")" && pwd -P)"
DATA_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_DIR="$DATA_ROOT/trama/app"
BIN_DIR="$HOME/.local/bin"
if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
  printf '%s\n' 'Python 3.10 ou mais recente não encontrado. No Arch Linux: sudo pacman -S python' >&2
  exit 1
fi
# Stage the complete program before replacement; never copy user data/state.
python3 "$SOURCE_DIR/install_windows.py" --copy-program "$SOURCE_DIR" "$APP_DIR"
mkdir -p "$DATA_ROOT/applications" "$BIN_DIR"
chmod +x "$APP_DIR/start.sh" "$APP_DIR/install.sh"
# A symlink keeps paths with spaces safe and always runs the installed launcher.
ln -sfn -- "$APP_DIR/start.sh" "$BIN_DIR/trama"
# Desktop Entry quoting also escapes %, backslash, quote, dollar and backtick.
DESKTOP_EXEC="${BIN_DIR//\\/\\\\}/trama"
DESKTOP_EXEC="${DESKTOP_EXEC//\"/\\\"}"
DESKTOP_EXEC="${DESKTOP_EXEC//\$/\\\$}"
DESKTOP_EXEC="${DESKTOP_EXEC//\`/\\\`}"
DESKTOP_EXEC="${DESKTOP_EXEC//%/%%}"
cat > "$DATA_ROOT/applications/trama.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Trama
Comment=Notas conectadas no seu computador
Exec="$DESKTOP_EXEC" --desktop
Icon=accessories-text-editor
Terminal=false
Categories=Office;Utility;
StartupNotify=false
EOF
printf '%s\n' "Trama instalado em: $APP_DIR" "Abra Trama no menu de aplicativos ou execute: $BIN_DIR/trama" "Dados preservados em: $DATA_ROOT/trama/trama.db"
