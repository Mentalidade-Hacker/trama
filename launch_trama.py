#!/usr/bin/env python3
"""Stable launcher: activate a prepared release only when starting the server."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

from updater import (UpdateError, atomic_json, ensure_state, installed_version,
                     now, plain_path, pointer, read_json, release_path,
                     validate_release, version_key)

BOOT_TIMEOUT = 60


class InstallationLock:
    """An OS lock, released by the kernel even after a crash; no stale PID files."""
    def __init__(self, state):
        self.path = plain_path(Path(state) / 'running.lock')
        self.file = None

    def __enter__(self):
        stream = self.path.open('a+b')
        try:
            stream.seek(0, os.SEEK_END)
            if stream.tell() == 0:
                stream.write(b'0')
                stream.flush()
            stream.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (OSError, IOError) as exc:
            stream.close()
            raise UpdateError('O Trama já está aberto nesta instalação. Encerre-o antes de abrir novamente.') from exc
        self.file = stream
        return self

    def __exit__(self, *args):
        if self.file is not None:
            try:
                self.file.seek(0)
                if os.name == 'nt':
                    import msvcrt
                    msvcrt.locking(self.file.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(self.file.fileno(), fcntl.LOCK_UN)
            finally:
                self.file.close()
                self.file = None


def child_environment(base, health=None, token=None):
    env = os.environ.copy()
    env['TRAMA_APP_ROOT'] = str(base)
    env['TRAMA_LAUNCHED'] = '1'
    env['PYTHONDONTWRITEBYTECODE'] = '1'
    # All releases share the installed dictionary; profiles, models and Proton
    # credentials remain at their existing locations, outside updater state.
    if not env.get('TRAMA_DICTIONARY_PATH'):
        env['TRAMA_DICTIONARY_PATH'] = str(base / 'resources/dictionary.sqlite')
    env.pop('TRAMA_UPDATE_HEALTH_FILE', None)
    env.pop('TRAMA_UPDATE_HEALTH_TOKEN', None)
    if health is not None:
        env['TRAMA_UPDATE_HEALTH_FILE'] = str(health)
        env['TRAMA_UPDATE_HEALTH_TOKEN'] = token
    return env


def stop_child(child):
    if child.poll() is None:
        child.terminate()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=5)


def run_child(root, base, args, health=None, token=None, on_started=None, timeout=BOOT_TIMEOUT):
    environment = child_environment(base, health, token)
    hidden = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' and environment.get('TRAMA_NATIVE_LAUNCHER') == '1' else {}
    child = subprocess.Popen([sys.executable, '-E', '-s', '-B', '-X', 'utf8', str(root / 'server.py'), *args],
                             env=environment, **hidden)
    started = health is None
    deadline = time.monotonic() + timeout
    try:
        while not started:
            code = child.poll()
            if code is not None:
                return code, False
            value = read_json(health)
            if isinstance(value, dict) and value.get('token') == token:
                if on_started:
                    on_started()
                started = True
                break
            if time.monotonic() >= deadline:
                stop_child(child)
                return 1, False
            time.sleep(0.1)
        return child.wait(), started
    except KeyboardInterrupt:
        stop_child(child)
        return 130, started
    except BaseException:
        stop_child(child)
        raise
    finally:
        if health is not None:
            try:
                health.unlink(missing_ok=True)
            except OSError:
                # A stale unique health marker cannot confirm any later boot.
                pass


def choose_current(base, state):
    """Manual reinstall wins over an older or equivalent downloaded version."""
    base_version = installed_version(base)
    current = pointer(state, 'current')
    if current and version_key(current) > version_key(base_version):
        root = release_path(state, current)
        validate_release(root, current)
        return root, current
    return base, base_version


def record_failure(state, version, message):
    try:
        atomic_json(state / 'failure.json', {'version': version, 'at': now(), 'message': message})
    except OSError:
        # Diagnostics cannot prevent opening the last working release.
        pass


def launch(base_root=None, args=None):
    base = Path(base_root or Path(__file__).resolve().parent).resolve()
    args = list(sys.argv[1:] if args is None else args)
    # Development checkouts remain editable and never activate downloaded code.
    if (base / '.git').exists():
        return run_child(base, base, args)[0]
    try:
        state = ensure_state(base)
    except (OSError, UpdateError) as exc:
        print('Atualizações indisponíveis. Abrindo o programa instalado.', file=sys.stderr)
        return run_child(base, base, args)[0]
    try:
        with InstallationLock(state):
            try:
                return _launch_locked(base, state, args)
            except (OSError, UpdateError):
                fallback = base
                try:
                    fallback, _ = choose_current(base, state)
                except (OSError, UpdateError):
                    pass
                print('Não foi possível ler o estado de atualização. Abrindo a última versão disponível.', file=sys.stderr)
                return run_child(fallback, base, args)[0]
    except UpdateError as exc:
        print(str(exc), file=sys.stderr)
        return 1


def _launch_locked(base, state, args):
    try:
        active_root, active_version = choose_current(base, state)
    except (OSError, UpdateError) as exc:
        active_root, active_version = base, installed_version(base)
        record_failure(state, '0.0.0', 'A cópia atualizada não passou pela verificação; foi usado o programa instalado.')
        print('A atualização anterior não passou na verificação. Abrindo o programa instalado.', file=sys.stderr)
    # An interrupted activation never silently becomes current on the next run.
    booting = read_json(state / 'booting.json')
    if booting is not None:
        version = booting.get('version') if isinstance(booting, dict) else None
        try:
            version_key(version)
        except UpdateError:
            version = '0.0.0'
        record_failure(state, version, 'A ativação anterior foi interrompida; a versão anterior foi mantida.')
        (state / 'booting.json').unlink(missing_ok=True)
    pending = pointer(state, 'pending')
    if not pending or version_key(pending) <= version_key(active_version):
        if pending:
            (state / 'pending.json').unlink(missing_ok=True)
        return run_child(active_root, base, args)[0]
    try:
        candidate = release_path(state, pending)
        validate_release(candidate, pending)
    except (OSError, UpdateError):
        (state / 'pending.json').unlink(missing_ok=True)
        record_failure(state, pending, 'O pacote preparado não passou pela verificação; a versão anterior foi mantida.')
        return run_child(active_root, base, args)[0]
    token = uuid.uuid4().hex
    health = state / ('.started-' + token + '.json')
    atomic_json(state / 'booting.json', {'version': pending, 'previousVersion': active_version})
    (state / 'pending.json').unlink(missing_ok=True)

    def started():
        # Commit only after server bind, database recovery and backup succeeded.
        atomic_json(state / 'previous.json', {'version': active_version, 'base': active_root == base})
        (state / 'failure.json').unlink(missing_ok=True)
        (state / 'booting.json').unlink(missing_ok=True)
        atomic_json(state / 'current.json', {'version': pending})

    try:
        code, healthy = run_child(candidate, base, args, health, token, started)
    except (OSError, UpdateError):
        code, healthy = 1, False
    if healthy:
        return code
    record_failure(state, pending, 'A versão nova não confirmou o início; a versão anterior foi mantida.')
    (state / 'booting.json').unlink(missing_ok=True)
    # Ctrl+C is an explicit close request, not permission to restart the program.
    if code == 130:
        return code
    print('A atualização não iniciou. Abrindo novamente a versão anterior.', file=sys.stderr)
    return run_child(active_root, base, args)[0]


if __name__ == '__main__':
    sys.exit(launch())
