"""Per-user Windows installation; never touches the graph database."""
from __future__ import annotations

import base64
import os
from pathlib import Path
import shutil
import subprocess
import sys


def ps_literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def install(source, local_app_data, roaming_app_data, make_shortcut=True):
    source = Path(source).resolve()
    destination = Path(local_app_data).resolve() / 'Trama' / 'app'
    destination.mkdir(parents=True, exist_ok=True)
    if source != destination.resolve():
        files = [p for p in source.iterdir() if p.is_file() and p.suffix in {'.py', '.cmd', '.ps1', '.sh', '.md'}]
        for path in files:
            shutil.copy2(path, destination / path.name)
        shutil.copytree(source / 'web', destination / 'web', dirs_exist_ok=True)
        if (source / 'resources').is_dir():
            shutil.copytree(source / 'resources', destination / 'resources', dirs_exist_ok=True)
    shortcut = Path(roaming_app_data).resolve() / 'Microsoft' / 'Windows' / 'Start Menu' / 'Programs' / 'Trama.lnk'
    if make_shortcut:
        shortcut.parent.mkdir(parents=True, exist_ok=True)
        script = (
            "$ErrorActionPreference = 'Stop'; "
            "$tramaShell = New-Object -ComObject WScript.Shell; "
            f"$tramaLink = $tramaShell.CreateShortcut({ps_literal(shortcut)}); "
            f"$tramaLink.TargetPath = {ps_literal(destination / 'start.cmd')}; "
            "$tramaLink.Arguments = '--desktop'; "
            f"$tramaLink.WorkingDirectory = {ps_literal(destination)}; "
            "$tramaLink.Description = 'Notas conectadas locais'; "
            "$tramaLink.WindowStyle = 7; $tramaLink.Save()"
        )
        encoded = base64.b64encode(script.encode('utf-16-le')).decode('ascii')
        subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], check=True)
    return destination, shortcut


def main():
    if os.name != 'nt':
        print('Este instalador é para Windows. No Linux, use bash install.sh.')
        return 1
    if sys.version_info < (3, 10):
        print('Instale Python 3.10 ou mais recente.')
        return 1
    try:
        target, shortcut = install(Path(__file__).parent, os.environ['LOCALAPPDATA'], os.environ['APPDATA'])
        print(f'Trama instalado em: {target}\nAtalho criado no menu Iniciar: {shortcut}\nSuas notas existentes foram preservadas.')
        return 0
    except (OSError, KeyError, subprocess.CalledProcessError) as error:
        print(f'Não foi possível completar a instalação: {error}\nVocê ainda pode abrir start.cmd na pasta extraída.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
