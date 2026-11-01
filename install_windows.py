"""Per-user Windows installation; never touches the graph database."""
from __future__ import annotations

import base64
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import uuid


PROGRAM_EXTENSIONS = {'.py', '.cmd', '.ps1', '.sh', '.md'}
PROGRAM_DIRECTORIES = {'web', 'resources'}
PROGRAM_METADATA = {'app-release.json'}


def _linked(path):
    info = path.lstat()
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400))


def _validate_tree(path):
    """Never copy a link/junction or follow one while preparing an installation."""
    if _linked(path):
        raise ValueError(f'A instalação não aceita links ou atalhos de pasta: {path}')
    if path.name in {'trama.db', 'trama.db-wal', 'trama.db-shm'}:
        raise ValueError(f'Foi encontrado um banco de notas dentro da pasta do programa: {path}. '
                         'Nada foi substituído. Preserve os dados e use uma pasta separada para o programa.')
    if path.is_dir():
        for child in path.iterdir():
            _validate_tree(child)
    elif not path.is_file():
        raise ValueError(f'Arquivo de programa inválido: {path}')


def _program_entry(path):
    return path.suffix.lower() in PROGRAM_EXTENSIONS or path.name in PROGRAM_METADATA | PROGRAM_DIRECTORIES


def _remove_temporary(path, destination):
    # Only this installer's UUID-named siblings can be removed recursively.
    if (path.parent.resolve() != destination.parent.resolve()
            or not path.name.startswith(f'.{destination.name}-install-') or _linked(path)):
        raise ValueError('Pasta temporária de instalação inválida; nenhum arquivo foi removido.')
    shutil.rmtree(path)


def copy_program(source, destination):
    """Stage a complete program, then replace it with rollback on ordinary errors.

    Graph data and updater state live beside the app and never enter this copy.
    Unexpected contents in an existing app are rejected rather than discarded.
    """
    source, destination = Path(source).resolve(), Path(destination).absolute()
    destination.parent.mkdir(parents=True, exist_ok=True)
    if _linked(destination.parent) or os.path.lexists(destination) and _linked(destination):
        raise ValueError('O destino do programa não pode ser um link ou atalho de pasta.')
    if source == destination.resolve():
        return destination
    if source.is_relative_to(destination.resolve()) or destination.resolve().is_relative_to(source):
        raise ValueError('Origem e destino precisam ser pastas separadas, sem uma estar dentro da outra.')
    if not (source / 'server.py').is_file() or not (source / 'web' / 'index.html').is_file():
        raise ValueError('A pasta de origem não contém um programa Trama completo (server.py e web/index.html).')
    entries = [path for path in source.iterdir() if _program_entry(path)]
    for path in entries:
        _validate_tree(path)
        if path.is_dir() != (path.name in PROGRAM_DIRECTORIES):
            raise ValueError(f'Tipo de arquivo de programa inválido: {path.name}')
    if destination.exists():
        if not destination.is_dir():
            raise ValueError('O destino do programa precisa ser uma pasta.')
        expected = {path.name for path in entries} | {'__pycache__'}
        for path in destination.iterdir():
            if path.name not in expected:
                raise ValueError(f'A pasta do programa contém dados ou arquivos não reconhecidos: {path.name}. '
                                 'Nada foi substituído. Preserve essa pasta e instale o programa em uma pasta separada.')
            _validate_tree(path)
            if path.name != '__pycache__' and path.is_dir() != (path.name in PROGRAM_DIRECTORIES):
                raise ValueError(f'O destino contém um arquivo de tipo inesperado: {path.name}. Nada foi substituído.')
    token = uuid.uuid4().hex
    stage = destination.parent / f'.{destination.name}-install-stage-{token}'
    previous = destination.parent / f'.{destination.name}-install-previous-{token}'
    stage.mkdir()
    moved_previous = installed = False
    try:
        for path in entries:
            if path.is_dir():
                shutil.copytree(path, stage / path.name)
            else:
                shutil.copy2(path, stage / path.name)
        if destination.exists():
            os.replace(destination, previous)
            moved_previous = True
        try:
            os.replace(stage, destination)
            installed = True
        except OSError:
            if moved_previous:
                os.replace(previous, destination)
                moved_previous = False
            raise
    finally:
        if stage.exists():
            _remove_temporary(stage, destination)
        if installed and previous.exists():
            try:
                _remove_temporary(previous, destination)
            except OSError:
                # A locked obsolete file must not invalidate the completed app.
                print(f'A instalação terminou. A cópia anterior permanece em: {previous}', file=sys.stderr)
    return destination


def ps_literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def install(source, local_app_data, roaming_app_data, make_shortcut=True):
    source = Path(source).resolve()
    destination = Path(local_app_data).resolve() / 'Trama' / 'app'
    copy_program(source, destination)
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
    if len(sys.argv) == 4 and sys.argv[1] == '--copy-program':
        try:
            copy_program(sys.argv[2], sys.argv[3])
            return 0
        except (OSError, ValueError) as error:
            print(f'Não foi possível instalar o programa: {error}', file=sys.stderr)
            return 1
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
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(f'Não foi possível completar a instalação: {error}\nVocê ainda pode abrir start.cmd na pasta extraída.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
