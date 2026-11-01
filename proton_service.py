"""Explicit browser sign-in through the official Proton CLI; no stored tokens."""
from __future__ import annotations

import json
import os
import subprocess
import threading
from urllib.parse import urlsplit

from proton_transfer import DOWNLOAD_PAGE, find_cli


def sign_in_url(value):
    if (not isinstance(value, str) or len(value) > 8192
            or any(ord(char) <= 32 or ord(char) == 127 for char in value)):
        return None
    try:
        url = urlsplit(value)
        if url.scheme == 'https' and url.hostname in {'account.proton.me', 'account.protonmail.com'} and not url.username and not url.password and url.port in (None, 443):
            return value
    except ValueError:
        pass
    return None


class ProtonService:
    def __init__(self, sync):
        self.sync = sync
        self.lock = threading.Lock()
        self.process = None
        self.thread = None
        self.closed = False
        self.timed_out_process = None
        self.result = {'loginState': 'idle', 'message': 'Entre no Proton uma vez neste computador.'}

    def status(self):
        with self.lock:
            result = dict(self.result)
        try:
            find_cli(self.sync.config.get('cliPath') or None)
            result['installed'] = True
        except ValueError:
            result['installed'] = False
        result['downloadUrl'] = DOWNLOAD_PAGE
        return result

    def login(self, payload):
        if not isinstance(payload, dict) or not isinstance(payload.get('cliPath', ''), str):
            raise ValueError('Informe o caminho do aplicativo oficial do Proton.')
        executable = find_cli(payload.get('cliPath') or self.sync.config.get('cliPath') or None)
        if os.environ.get('PROTON_DRIVE_CREDENTIALS_STORE') == 'unsafe_file':
            raise ValueError('Configure o cofre de credenciais do sistema antes de entrar no Proton.')
        with self.lock:
            if self.closed:
                raise ValueError('O Trama está encerrando.')
            if self.thread is not None and self.thread.is_alive():
                return {**self.result, 'installed': True}
            options = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
            try:
                self.process = subprocess.Popen([executable, 'auth', 'login', '--json'],
                    stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                    text=True, encoding='utf-8', errors='replace', **options)
            except OSError:
                self.result = {'loginState': 'error', 'message': 'Não foi possível abrir a CLI oficial do Proton. Confira o executável e suas permissões.'}
                raise ValueError(self.result['message']) from None
            self.timed_out_process = None
            self.result = {'loginState': 'waiting', 'message': 'Conclua a entrada na janela oficial da Proton. Sua senha fica com a Proton.'}
            self.thread = threading.Thread(target=self._finish, args=(self.process,), name='trama-proton-login', daemon=True)
            self.thread.start()
            return {**self.result, 'installed': True}

    def _finish(self, process):
        timer = threading.Timer(300, self._timeout, args=(process,))
        timer.daemon = True
        timer.start()
        succeeded = False
        try:
            while True:
                line = process.stdout.readline(65537)
                if not line:
                    break
                if len(line) > 65536:
                    continue
                try:
                    value = json.loads(line)
                    url = sign_in_url(value.get('signInUrl')) if isinstance(value, dict) else None
                except ValueError:
                    url = None
                if url:
                    with self.lock:
                        if self.process is process:
                            self.result['signInUrl'] = url
            code = process.wait()
            succeeded = code == 0
        except (OSError, ValueError, subprocess.SubprocessError):
            # A closed pipe or failed process must not leave the UI waiting.
            # Never expose raw CLI output, which can include account details.
            pass
        finally:
            timer.cancel()
            try:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=2)
            except (OSError, ValueError, subprocess.SubprocessError):
                pass
            try:
                process.stdout.close()
            except (OSError, ValueError):
                pass
            wake = False
            with self.lock:
                if self.process is process:
                    if self.closed:
                        self.result = {'loginState': 'cancelled', 'message': 'Entrada no Proton interrompida.'}
                    elif self.timed_out_process is process:
                        self.result = {'loginState': 'error', 'message': 'O tempo para entrar no Proton terminou. Clique em Entrar no Proton para tentar novamente.'}
                    else:
                        self.result = {'loginState': 'connected' if succeeded else 'error',
                                       'message': 'Entrada concluída. A sincronização verificará o acesso à pasta do Proton quando estiver ativada.' if succeeded else 'A entrada não foi concluída. Tente novamente e confira o cofre de credenciais do sistema.'}
                        wake = succeeded
            worker = getattr(self.sync, 'worker', None)
            if wake and worker is not None:
                worker.wake()

    def _timeout(self, process):
        with self.lock:
            if self.process is process and process.poll() is None:
                self.timed_out_process = process
                try:
                    process.kill()
                except OSError:
                    pass

    def close(self):
        with self.lock:
            self.closed = True
            self.result = {'loginState': 'cancelled', 'message': 'Entrada no Proton interrompida.'}
            if self.process is not None and self.process.poll() is None:
                try:
                    self.process.kill()
                except OSError:
                    pass
        if self.thread:
            self.thread.join(timeout=2)
