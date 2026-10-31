#!/usr/bin/env bash
set -euo pipefail
INSTALLER_PATH="$(readlink -f -- "${BASH_SOURCE[0]}")"
SOURCE_DIR="$(cd -- "$(dirname -- "$INSTALLER_PATH")" && pwd -P)"
DATA_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_DIR="$DATA_ROOT/trama/app"
BIN_DIR="$HOME/.local/bin"
mkdir -p "$APP_DIR/web" "$DATA_ROOT/applications" "$BIN_DIR"
if [[ "$(cd -- "$APP_DIR" && pwd -P)" != "$SOURCE_DIR" ]]; then
  cp -- "$SOURCE_DIR/server.py" "$SOURCE_DIR/proofreader.py" "$SOURCE_DIR/storage_features.py" "$SOURCE_DIR/sync_store.py" "$SOURCE_DIR/start.sh" "$SOURCE_DIR/install.sh" "$APP_DIR/"
  cp -R -- "$SOURCE_DIR/web/." "$APP_DIR/web/"
  if [[ -d "$SOURCE_DIR/resources" ]]; then mkdir -p "$APP_DIR/resources"; cp -R -- "$SOURCE_DIR/resources/." "$APP_DIR/resources/"; fi
  cp -- "$SOURCE_DIR/dictionary.py" "$SOURCE_DIR/build_dictionary.py" "$SOURCE_DIR/DICTIONARY.md" "$APP_DIR/"
  if [[ -f "$SOURCE_DIR/README.md" ]]; then cp -- "$SOURCE_DIR/README.md" "$APP_DIR/"; fi
  for optional in proton-transfer.sh proton_transfer.py PROTON-DRIVE.md FEATURE-COVERAGE.md translation.py translation_worker.py setup_translation.py setup-translation.sh setup-translation.cmd TRANSLATION.md setup_proofreader.py setup-writing.sh setup-writing.cmd WRITING.md LEARNING.md; do
    if [[ -f "$SOURCE_DIR/$optional" ]]; then cp -- "$SOURCE_DIR/$optional" "$APP_DIR/"; fi
  done
fi
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
