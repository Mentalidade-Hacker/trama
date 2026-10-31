"""Optional offline PT/EN translation through a separately installed runtime.

No dependency installation, model download, HTTP request, or cloud fallback is
performed by this module. The setup helper owns installation explicitly.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import threading
import time

LANGUAGES = ("en", "pt")
MAX_TEXTS = 200
MAX_CHARACTERS = 30_000
TIMEOUT = 120
INSTALL_MESSAGE = "A tradução local precisa do runtime e dos modelos PT↔EN. Execute o instalador de tradução incluído no Trama e tente novamente."


class TranslationError(Exception):
    def __init__(self, message, status=503, code="translation_unavailable"):
        super().__init__(message)
        self.status, self.code = status, code


def translation_home(data_directory):
    override = os.environ.get("TRAMA_TRANSLATION_HOME")
    return (Path(override).expanduser() if override else Path(data_directory) / "translation").resolve()


def runtime_python(home):
    return Path(home) / "runtime" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def validate_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError("Envie source, target e texts para traduzir.")
    source, target, texts = payload.get("source"), payload.get("target"), payload.get("texts")
    if not isinstance(source, str) or not isinstance(target, str) or source not in LANGUAGES or target not in LANGUAGES:
        raise ValueError("Os idiomas disponíveis são en e pt.")
    if not isinstance(texts, list) or len(texts) > MAX_TEXTS or any(not isinstance(text, str) for text in texts):
        raise ValueError("Envie uma lista de até 200 trechos de texto.")
    try:
        size = sum(len(text.encode("utf-16-le")) // 2 for text in texts)
    except UnicodeError:
        raise ValueError("O texto contém caracteres Unicode inválidos.") from None
    if size > MAX_CHARACTERS:
        raise ValueError("O conjunto excede 30.000 caracteres por tradução (unidades UTF-16).")
    return source, target, texts


class TranslationService:
    def __init__(self, data_directory):
        self.home = translation_home(data_directory)
        self.python = runtime_python(self.home)
        self.worker = Path(__file__).with_name("translation_worker.py")
        self.lock = threading.Lock()
        self.process_lock = threading.Lock()
        self.process = None
        self.closed = False
        self.cache = None
        self.cache_time = 0
        self.cache_key = None

    def _options(self):
        result = {"stdout": subprocess.PIPE, "stderr": subprocess.DEVNULL}
        if os.name == "nt":
            result["creationflags"] = subprocess.CREATE_NO_WINDOW
        return result

    def _command(self, check=False):
        return [str(self.python), "-I", "-u", "-X", "utf8", str(self.worker), "--home", str(self.home), *( ["--check"] if check else [])]

    def _layout(self):
        files = [self.python, self.worker]
        for direction in ("en_pt", "pt_en"):
            files.extend((self.home / "models" / direction / "model" / "model.bin", self.home / "models" / direction / "sentencepiece.model"))
        key = []
        for path in files:
            try:
                stat = path.stat()
                if not path.is_file():
                    return None
                key.append((str(path), stat.st_size, stat.st_mtime_ns))
            except OSError:
                return None
        return tuple(key)

    def status(self):
        state = {"available": False, "local": True, "languages": list(LANGUAGES), "home": str(self.home), "runtime": str(self.python), "maxTexts": MAX_TEXTS, "maxCharacters": MAX_CHARACTERS, "message": INSTALL_MESSAGE}
        key = self._layout()
        if key is None:
            return state
        if key == self.cache_key and self.cache is not None and time.monotonic() - self.cache_time < 30:
            return dict(self.cache)
        if not self.lock.acquire(blocking=False):
            state.update(available=True, message="Tradução local em andamento.")
            return state
        try:
            result = subprocess.run(self._command(check=True), timeout=15, **self._options())
            if result.returncode == 0:
                details = json.loads(result.stdout.decode("utf-8"))
                if isinstance(details, dict) and details.get("available") is True:
                    state.update(available=True, message="Modelos PT↔EN e runtime local disponíveis.")
            if not state["available"]:
                state["message"] = "Os arquivos de tradução existem, mas o runtime não está funcionando. Execute novamente o instalador de tradução."
        except (OSError, ValueError, subprocess.TimeoutExpired):
            state["message"] = "Não foi possível iniciar o runtime de tradução local. Execute novamente o instalador."
        finally:
            self.lock.release()
        self.cache, self.cache_key, self.cache_time = dict(state), key, time.monotonic()
        return state

    def translate(self, payload):
        source, target, texts = validate_payload(payload)
        if source == target or not texts or not any(text.strip() for text in texts):
            return {"texts": list(texts), "local": True}
        if self._layout() is None:
            raise TranslationError(INSTALL_MESSAGE)
        if not self.lock.acquire(blocking=False):
            raise TranslationError("Já há uma tradução em andamento. Aguarde a conclusão e tente novamente.", 409, "translation_busy")
        process = None
        try:
            with self.process_lock:
                if self.closed:
                    raise TranslationError("O Trama está sendo encerrado.")
                process = self.process = subprocess.Popen(self._command(), stdin=subprocess.PIPE, **self._options())
            serialized = json.dumps({"source": source, "target": target, "texts": texts}, ensure_ascii=False).encode("utf-8")
            try:
                output, _ = process.communicate(serialized, timeout=TIMEOUT)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate()
                raise TranslationError("A tradução excedeu 120 segundos. Tente uma página ou trecho menor.", 504, "translation_timeout") from None
            if not output or len(output) > 4 * 1024 * 1024:
                raise TranslationError("O motor local não retornou uma tradução válida.", 502, "translation_response")
            try:
                result = json.loads(output.decode("utf-8"))
            except (ValueError, UnicodeError):
                raise TranslationError("Resposta inválida do motor local.", 502, "translation_response") from None
            if process.returncode != 0:
                message = result.get("error") if isinstance(result, dict) else None
                # Only messages generated by our worker protocol are returned;
                # raw dependency stderr and note contents are never logged.
                raise TranslationError(message if isinstance(message, str) else "Falha no motor local. Confira os modelos e o runtime.", 503, "translation_engine")
            translated = result.get("texts") if isinstance(result, dict) else None
            if not isinstance(translated, list) or len(translated) != len(texts) or any(not isinstance(item, str) for item in translated):
                raise TranslationError("O motor retornou uma quantidade inválida de trechos.", 502, "translation_response")
            return {"texts": translated, "local": True}
        except OSError:
            raise TranslationError("Não foi possível executar o tradutor local. Confira a instalação do runtime.") from None
        finally:
            with self.process_lock:
                if self.process is process:
                    self.process = None
            self.lock.release()

    def close(self):
        with self.process_lock:
            self.closed = True
            process = self.process
            if process is not None and process.poll() is None:
                try:
                    process.terminate()
                except OSError:
                    pass
