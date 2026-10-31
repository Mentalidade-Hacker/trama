"""Optional LanguageTool integration. Text never leaves the loopback interface.

Official startup: https://dev.languagetool.org/http-server
Arch paths: https://archlinux.org/packages/extra/any/languagetool/files/
"""
from __future__ import annotations

import http.client
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import threading
import time
from urllib.parse import urlencode

LANGUAGES = ("pt-BR", "pt-PT", "en-US", "en-GB")
MAX_TEXT = 20_000  # Java / browser UTF-16 code units.
INSTALL_MESSAGE = "O revisor local precisa do LanguageTool. No Windows, abra setup-writing.cmd; no Arch, use sudo pacman -S --needed languagetool ou bash setup-writing.sh --portable-java. Depois tente novamente."


class ProofreaderError(Exception):
    def __init__(self, message, status=503, code="proofreader_unavailable"):
        super().__init__(message)
        self.status = status
        self.code = code


def validate_request(payload):
    if not isinstance(payload, dict):
        raise ValueError("Envie um objeto com text e language.")
    text, language = payload.get("text"), payload.get("language")
    if not isinstance(text, str):
        raise ValueError("O texto para revisão precisa ser uma string.")
    if not isinstance(language, str) or language not in LANGUAGES:
        raise ValueError("Selecione pt-BR, pt-PT, en-US ou en-GB.")
    try:
        length = len(text.encode("utf-16-le")) // 2
    except UnicodeEncodeError:
        raise ValueError("O texto contém caracteres Unicode inválidos.") from None
    if length > MAX_TEXT:
        raise ValueError("Revise até 20.000 caracteres por vez (em unidades UTF-16).")
    return text, language


def writing_home(data_directory=None):
    override = os.environ.get("TRAMA_WRITING_HOME")
    if override:
        return Path(override).expanduser().resolve()
    if data_directory is None:
        explicit = os.environ.get("XDG_DATA_HOME")
        legacy = Path.home() / ".local" / "share" / "trama"
        if explicit:
            data_directory = Path(explicit) / "trama"
        elif os.name == "nt" and not (legacy / "trama.db").is_file():
            data_directory = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData/Local") / "Trama/data"
        else:
            data_directory = legacy
    return (Path(data_directory) / "writing").resolve()


def java_command(home=None):
    home = Path(home) if home is not None else writing_home()
    portable = home / "java" / "bin" / ("java.exe" if os.name == "nt" else "java")
    if portable.is_file():
        return str(portable)
    return shutil.which("java")


def find_command(home=None):
    """Return trusted local argv prefix and cwd; never download a binary."""
    home = Path(home) if home is not None else writing_home()
    java = java_command(home)
    custom = os.environ.get("TRAMA_LANGUAGETOOL_DIR")
    if custom:
        directory = Path(custom).expanduser().resolve()
        jar = directory / "languagetool-server.jar"
        if jar.is_file() and java:
            return [java, "-cp", str(jar), "org.languagetool.server.HTTPServer"], str(directory)
        return None
    directory = home / "languagetool"
    jar = directory / "languagetool-server.jar"
    if jar.is_file() and java:
        return [java, "-cp", str(jar), "org.languagetool.server.HTTPServer"], str(directory)
    executable = shutil.which("languagetool")
    if executable:
        return [executable, "--http"], None
    # The packaged launcher normally handles this; the fallback includes Arch's
    # separate resource tree as well as its jars.
    directory = Path("/usr/share/java/languagetool")
    jar = directory / "languagetool-server.jar"
    if java and jar.is_file():
        classpath = os.pathsep.join((str(jar), str(directory / "libs" / "*"), "/usr/share/languagetool"))
        return [java, "-cp", classpath, "org.languagetool.server.HTTPServer"], str(directory)
    return None


class Proofreader:
    def __init__(self, data_directory=None, *, writing_directory=None):
        self.home = Path(writing_directory).expanduser().resolve() if writing_directory is not None else writing_home(data_directory)
        self.process = None
        self.port = None
        self.lock = threading.RLock()
        self.closed = False
        self.busy = False

    def status(self):
        available = find_command(self.home) is not None
        process = self.process
        running = process is not None and process.poll() is None
        return {"available": available, "running": running, "busy": self.busy, "local": True, "home": str(self.home),
                "languages": list(LANGUAGES), "maxCharacters": MAX_TEXT,
                "message": "LanguageTool local disponível." if available else INSTALL_MESSAGE}

    def _request(self, method, path, body=None, timeout=35):
        # HTTPConnection avoids environment proxies and automatic redirects.
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=timeout)
        try:
            headers = {"Content-Type": "application/x-www-form-urlencoded; charset=utf-8"} if body is not None else {}
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            content = response.read(8 * 1024 * 1024 + 1)
            if len(content) > 8 * 1024 * 1024 or response.status != 200:
                raise ProofreaderError("O LanguageTool local não conseguiu revisar este texto. Tente um trecho menor.", 502, "proofreader_response")
            try:
                return json.loads(content.decode("utf-8"))
            except (ValueError, UnicodeError):
                raise ProofreaderError("Resposta inválida do LanguageTool local.", 502, "proofreader_response") from None
        finally:
            connection.close()

    def _start(self):
        if self.closed:
            raise ProofreaderError("O Trama está sendo encerrado.")
        if self.process is not None and self.process.poll() is None:
            return
        found = find_command(self.home)
        if not found:
            raise ProofreaderError(INSTALL_MESSAGE)
        command, directory = found
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as reservation:
            reservation.bind(("127.0.0.1", 0))
            self.port = reservation.getsockname()[1]
        options = {"cwd": directory, "stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
        if os.name == "nt":
            options["creationflags"] = subprocess.CREATE_NO_WINDOW
        else:
            options["start_new_session"] = True
        try:
            # No --public and no --allow-origin: only Trama's backend accesses it.
            self.process = subprocess.Popen([*command, "--port", str(self.port)], **options)
        except OSError:
            raise ProofreaderError("Não foi possível iniciar o LanguageTool local. Confira a instalação do pacote e do Java.") from None
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                self._stop()
                raise ProofreaderError("O LanguageTool encerrou ao iniciar. Confira o Java e a instalação do pacote languagetool.")
            try:
                languages = self._request("GET", "/v2/languages", timeout=1)
                if isinstance(languages, list) and any(isinstance(item, dict) and item.get("code") == "en" for item in languages):
                    if self.process.poll() is None:
                        return
            except (OSError, http.client.HTTPException, ProofreaderError):
                pass
            time.sleep(0.2)
        self._stop()
        raise ProofreaderError("O LanguageTool demorou mais de 25 segundos para iniciar. Tente novamente.", 504, "proofreader_timeout")

    def check(self, payload):
        text, language = validate_request(payload)
        if not text.strip():
            return {"matches": [], "language": {"code": language}, "local": True}
        if not self.lock.acquire(blocking=False):
            raise ProofreaderError("Já há uma revisão em andamento. Aguarde e envie o texto mais recente.", 409, "proofreader_busy")
        self.busy = True
        try:
            self._start()
            body = urlencode({"text": text, "language": language}).encode("utf-8")
            try:
                result = self._request("POST", "/v2/check", body=body, timeout=35)
            except (OSError, http.client.HTTPException):
                raise ProofreaderError("O revisor local não respondeu a tempo. Tente novamente ou revise um trecho menor.", 504, "proofreader_timeout") from None
            if not isinstance(result, dict) or not isinstance(result.get("matches"), list):
                raise ProofreaderError("Resposta inválida do LanguageTool local.", 502, "proofreader_response")
            # Offsets are intentionally passed through in Java UTF-16 units,
            # matching JavaScript string.slice and selectionStart.
            return result
        finally:
            self.busy = False
            self.lock.release()

    def _stop(self):
        process, self.process = self.process, None
        if process is None:
            return
        try:
            if os.name != "nt":
                os.killpg(process.pid, signal.SIGTERM)
            elif process.poll() is None:
                process.terminate()
            process.wait(timeout=3)
        except (ProcessLookupError, OSError):
            pass
        except subprocess.TimeoutExpired:
            try:
                if os.name != "nt":
                    os.killpg(process.pid, signal.SIGKILL)
                else:
                    process.kill()
                process.wait(timeout=3)
            except (OSError, subprocess.TimeoutExpired):
                pass
        self.port = None

    def close(self):
        with self.lock:
            self.closed = True
            self._stop()
