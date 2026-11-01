#!/usr/bin/env python3
"""Trama: a private, dependency-free local notes server (Python 3.10+)."""
from __future__ import annotations

import argparse
from contextlib import contextmanager, closing
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import unicodedata
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, unquote, quote, parse_qs
import webbrowser
from proofreader import Proofreader, ProofreaderError
from storage_features import StorageFeatures, setup as setup_storage, record_history, INLINE_TYPES, MAX_VAULT_REQUEST
from sync_store import SyncStore, SyncError
from auto_sync import AutoSync
from sync_preview import preview_snapshot
from proton_service import ProtonService
from translation import TranslationService, TranslationError
from dictionary import DictionaryService, DictionaryError
from learning_drafts import LearningDrafts, DraftConflict, setup_drafts
from full_backup import FullBackup, FullBackupError, MAX_FULL_BACKUP_REQUEST

ROOT = Path(__file__).resolve().parent
MAX_BODY = 32 * 1024 * 1024
EMPTY = {"version": 1, "pages": []}


class Conflict(Exception):
    pass


def validate(data):
    """Reject malformed snapshots before entering a write transaction."""
    if not isinstance(data, dict) or type(data.get("version")) is not int or data.get("version") != 1 or not isinstance(data.get("pages"), list):
        raise ValueError("Formato inválido: esperado version: 1 e uma lista pages.")
    if len(data["pages"]) > 50_000:
        raise ValueError("O grafo excede 50.000 páginas.")
    ids, titles = set(), set()
    block_count = 0

    def js_length(value):
        # The browser measures strings in UTF-16 code units, not code points.
        return len(value.encode("utf-16-le", errors="surrogatepass")) // 2

    def identity(item):
        value = item.get("id")
        if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value) or value in ids:
            raise ValueError("Cada página e bloco precisa de um ID único.")
        ids.add(value)

    for page in data["pages"]:
        if not isinstance(page, dict):
            raise ValueError("Página inválida.")
        identity(page)
        title = page.get("title")
        if not isinstance(title, str) or not title.strip() or js_length(title) > 500 or any(part in title for part in ("\n", "\r", "[[", "]]")):
            raise ValueError("O título deve ter entre 1 e 500 caracteres, sem quebras de linha ou colchetes duplos.")
        key = unicodedata.normalize("NFC", title.strip()).lower()
        if key in titles:
            raise ValueError("Títulos de página duplicados.")
        titles.add(key)
        for field in ("created", "updated"):
            value = page.get(field)
            try:
                if isinstance(value, str):
                    datetime.fromisoformat(value.replace("Z", "+00:00"))
                elif type(value) in (int, float) and math.isfinite(value):
                    datetime.fromtimestamp(value / 1000, timezone.utc)
                else:
                    raise ValueError()
            except (ValueError, OverflowError, OSError):
                raise ValueError("Data de página inválida.")
        if not isinstance(page.get("blocks"), list):
            raise ValueError("A página precisa de uma lista de blocos.")
        pending = [(block, 0) for block in page["blocks"]]
        while pending:
            block, depth = pending.pop()
            if not isinstance(block, dict) or depth >= 100:
                raise ValueError("Bloco inválido ou hierarquia com mais de 100 níveis.")
            identity(block)
            block_count += 1
            if block_count > 200_000:
                raise ValueError("O grafo excede 200.000 blocos.")
            if not isinstance(block.get("text"), str) or js_length(block["text"]) > 1_000_000 or not isinstance(block.get("children"), list):
                raise ValueError("Cada bloco precisa de text e children.")
            if not isinstance(block.get("collapsed"), bool):
                raise ValueError("O campo collapsed precisa ser booleano.")
            if "heading" in block and (type(block["heading"]) is not int or block["heading"] not in range(4)):
                raise ValueError("O nível de título precisa estar entre 0 e 3.")
            if "alignment" in block and block["alignment"] not in ("left", "center", "right"):
                raise ValueError("Alinhamento de bloco inválido.")
            if "view" in block and block["view"] not in ("bullet", "numbered", "document"):
                raise ValueError("Visualização de bloco inválida.")
            pending.extend((child, depth + 1) for child in block["children"])
    return data


class Store:
    def __init__(self, directory):
        self.directory = Path(directory).expanduser().resolve()
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / "trama.db"
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS graph (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, data TEXT NOT NULL)")
            db.execute("INSERT OR IGNORE INTO graph VALUES(1, 0, ?)", (json.dumps(EMPTY),))
            setup_storage(db)
            setup_drafts(db)
        if os.name != "nt":
            self.path.chmod(0o600)
        self.features = StorageFeatures(self)
        self.sync = SyncStore(self)
        self.drafts = LearningDrafts(self)
        self.full_backup = FullBackup(self)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        try:
            with db:
                yield db
        finally:
            db.close()

    def read(self):
        with self.connect() as db:
            revision, data = db.execute("SELECT revision, data FROM graph WHERE id=1").fetchone()
        return {"revision": revision, "data": json.loads(data)}

    def revision(self):
        with self.connect() as db:
            return db.execute("SELECT revision FROM graph WHERE id=1").fetchone()[0]

    def serialize_data(self, data):
        validate(data)
        serialized = json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        if len(serialized.encode("utf-8")) > MAX_BODY:
            raise ValueError("O grafo excede o limite de 32 MB.")
        return serialized

    def check_revision(self, db, revision):
        if type(revision) is not int or revision < 0:
            raise ValueError("A revisão precisa ser um número inteiro.")
        current = db.execute("SELECT revision FROM graph WHERE id=1").fetchone()[0]
        if current != revision:
            raise Conflict("As notas foram alteradas em outra janela. Exporte suas alterações e recarregue antes de continuar.")
        return current

    def write_in_transaction(self, db, revision, serialized, data):
        current = self.check_revision(db, revision)
        db.execute("UPDATE graph SET revision=?, data=? WHERE id=1", (current + 1, serialized))
        record_history(db, current + 1, serialized, data)
        return current + 1

    def save(self, revision, data):
        serialized = self.serialize_data(data)
        with self.sync.lock, self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            new_revision = self.write_in_transaction(db, revision, serialized, data)
        worker = getattr(self.sync, 'worker', None)
        if worker is not None:
            worker.wake()
        return new_revision

    def backup(self):
        folder = self.directory / "backups"
        folder.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        destination = folder / f"trama-{stamp}.db"
        with self.connect() as source, closing(sqlite3.connect(destination)) as target:
            source.backup(target)
        if os.name != "nt":
            destination.chmod(0o600)
        for old in sorted(folder.glob("trama-????????T????????????Z.db"))[:-20]:
            old.unlink(missing_ok=True)
        return str(destination)


class Handler(SimpleHTTPRequestHandler):
    server_version = "Trama/0.9.1"
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".wasm": "application/wasm"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "web"), **kwargs)

    def log_message(self, fmt, *args):
        # Avoid logging note titles, searches, and content.
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN" if getattr(self, "attachment_response", False) else "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        policy = "default-src 'none'; sandbox; frame-ancestors 'self'; base-uri 'none'" if getattr(self, "attachment_response", False) else "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self'; frame-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        if urlsplit(self.path).path == "/spell-worker.js":
            policy = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; object-src 'none'; base-uri 'none'"
        self.send_header("Content-Security-Policy", policy)
        super().end_headers()

    def json_response(self, status, value, filename=None):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if filename:
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(body)

    def allowed(self):
        port = self.server.server_address[1]
        hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        host = self.headers.get("Host", "")
        if host not in hosts:
            self.json_response(403, {"error": "Host não autorizado."})
            return False
        origin = self.headers.get("Origin")
        if origin is not None and origin != f"http://{host}":
            self.json_response(403, {"error": "Origem não autorizada."})
            return False
        if self.headers.get("Sec-Fetch-Site") == "cross-site":
            self.json_response(403, {"error": "Acesso entre sites não autorizado."})
            return False
        return True

    def read_json(self, maximum=MAX_BODY):
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
            raise ValueError("Envie Content-Type: application/json.")
        if self.headers.get("Transfer-Encoding"):
            raise ValueError("Transfer-Encoding não suportado.")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("Tamanho inválido.") from None
        if not 0 < length <= maximum:
            raise ValueError(f"O corpo JSON precisa ter entre 1 byte e {maximum // (1024 * 1024)} MB.")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"), parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Número inválido.")))
        except (UnicodeDecodeError, json.JSONDecodeError, RecursionError):
            raise ValueError("JSON inválido.") from None

    def do_GET(self):
        if not self.allowed():
            return
        path = urlsplit(self.path).path
        if path.startswith('/api/full-backup/recovery/'):
            try:
                body = self.server.store.full_backup.recovery(path.removeprefix('/api/full-backup/recovery/'))
                self.send_response(200)
                self.send_header('Content-Type', 'application/zip')
                self.send_header('Content-Disposition', 'attachment; filename="trama-recuperacao.zip"')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except FullBackupError as exc:
                self.json_response(exc.status, {'error': str(exc), 'code': exc.code})
            except (ValueError, OSError, sqlite3.Error):
                self.json_response(400, {'error': 'Não foi possível abrir a cópia de recuperação.'})
            return
        if path == "/api/learning/drafts":
            try:
                self.json_response(200, self.server.store.drafts.read())
            except (OSError, sqlite3.Error):
                self.json_response(503, {"error": "Não foi possível ler os rascunhos no disco."})
            return
        if path == "/api/revision":
            self.json_response(200, {"revision": self.server.store.revision()})
            return
        if path == "/api/sync/proton/status":
            self.json_response(200, self.server.proton.status())
            return
        if path == "/api/dictionary/status":
            self.json_response(200, self.server.dictionary.status())
            return
        if path == "/api/translate/status":
            self.json_response(200, self.server.translation.status())
            return
        if path == "/api/sync/status":
            try:
                self.json_response(200, self.server.store.sync.status())
            except (OSError, sqlite3.Error, SyncError) as exc:
                self.json_response(503, {"error": str(exc), "code": "sync_unavailable"})
            return
        if path in ("/api/attachments", "/api/history", "/api/vault.zip") or path.startswith(("/files/", "/api/history/")):
            self.storage_get(path)
            return
        if path == "/api/state":
            self.json_response(200, self.server.store.read())
        elif path == "/api/proofread/status":
            self.json_response(200, self.server.proofreader.status())
        elif path == "/api/export":
            self.json_response(200, self.server.store.read()["data"], "trama.json")
        elif path.startswith("/api/"):
            self.json_response(404, {"error": "Rota desconhecida."})
        else:
            # Resolve symlinks as well as .. before handing off static files.
            base = (ROOT / "web").resolve()
            candidate = (base / unquote(path).lstrip("/")).resolve()
            if not candidate.is_relative_to(base):
                self.json_response(403, {"error": "Caminho não autorizado."})
                return
            if candidate.is_dir() and not (candidate / "index.html").is_file():
                self.json_response(404, {"error": "Arquivo não encontrado."})
                return
            super().do_GET()

    def storage_get(self, path):
        try:
            features = self.server.store.features
            if path == "/api/attachments":
                self.json_response(200, features.list())
            elif path == "/api/history":
                self.json_response(200, features.history())
            elif path.startswith("/api/history/"):
                ident = path.removeprefix("/api/history/")
                if not ident.isdecimal():
                    raise FileNotFoundError("Versão não encontrada.")
                self.json_response(200, features.snapshot(int(ident)))
            elif path == "/api/vault.zip":
                body = features.export_vault()
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", 'attachment; filename="trama-vault.zip"')
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                metadata, file_path = features.file(path.removeprefix("/files/"))
                self.serve_attachment(metadata, file_path)
        except FileNotFoundError as exc:
            self.json_response(404, {"error": str(exc)})
        except ValueError as exc:
            self.json_response(400, {"error": str(exc)})
        except (OSError, sqlite3.Error):
            self.json_response(500, {"error": "Não foi possível ler o armazenamento local."})

    def serve_attachment(self, metadata, file_path):
        size = file_path.stat().st_size
        start, end, status = 0, size - 1, 200
        requested = self.headers.get("Range")
        if requested:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested)
            if not match or not any(match.groups()):
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            left, right = match.groups()
            if left:
                start = int(left)
                end = min(int(right), size - 1) if right else size - 1
            else:
                start = max(0, size - int(right))
            if start > end or start >= size:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            status = 206
        inline = metadata["type"] in INLINE_TYPES and parse_qs(urlsplit(self.path).query).get("download") != ["1"]
        name = quote(metadata["name"], safe="")
        self.attachment_response = True
        self.send_response(status)
        self.send_header("Content-Type", metadata["type"])
        self.send_header("Content-Disposition", f"{'inline' if inline else 'attachment'}; filename=\"anexo\"; filename*=UTF-8''{name}")
        self.send_header("Content-Length", str(max(0, end - start + 1)))
        self.send_header("Accept-Ranges", "bytes")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        with file_path.open("rb") as file:
            file.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = file.read(min(65536, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def do_HEAD(self):
        # Deliberately use the same authorization as all other routes.
        if self.allowed():
            self.send_response(405)
            self.send_header("Allow", "GET, PUT, POST")
            self.end_headers()

    def mutate(self, backup=False):
        if not self.allowed():
            return
        route = "/api/backup" if backup else "/api/state"
        if urlsplit(self.path).path != route:
            self.json_response(404, {"error": "Rota desconhecida."})
            return
        try:
            payload = self.read_json()
            if not isinstance(payload, dict):
                raise ValueError("Esperado um objeto JSON.")
            if backup:
                self.json_response(200, {"path": self.server.store.backup()})
            else:
                revision = self.server.store.save(payload.get("revision"), payload.get("data"))
                self.json_response(200, {"revision": revision})
        except Conflict as exc:
            self.json_response(409, {"error": str(exc), "revision": self.server.store.read()["revision"]})
        except (ValueError, RecursionError) as exc:
            self.json_response(400, {"error": str(exc) or "Dados inválidos."})
        except (sqlite3.Error, OSError):
            self.json_response(500, {"error": "Não foi possível gravar no disco. Confira espaço livre e permissões; suas notas anteriores foram preservadas."})

    def do_PUT(self):
        self.mutate()

    def do_POST(self):
        path = urlsplit(self.path).path
        if path in ('/api/full-backup/export', '/api/full-backup/inspect', '/api/full-backup/restore'):
            if not self.allowed():
                return
            try:
                payload = self.read_json(MAX_FULL_BACKUP_REQUEST if path != '/api/full-backup/export' else MAX_BODY)
                service = self.server.store.full_backup
                if path == '/api/full-backup/export':
                    body = service.export(payload)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/zip')
                    self.send_header('Content-Disposition', 'attachment; filename="trama-backup-completo.zip"')
                    self.send_header('Content-Length', str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                else:
                    self.json_response(200, (service.inspect if path.endswith('/inspect') else service.restore)(payload))
            except FullBackupError as exc:
                self.json_response(exc.status, {'error': str(exc), 'code': exc.code})
            except Conflict as exc:
                self.json_response(409, {'error': str(exc), 'code': 'backup_revision_conflict'})
            except (ValueError, TypeError, RecursionError) as exc:
                self.json_response(400, {'error': str(exc) or 'Backup inválido.'})
            except (OSError, sqlite3.Error):
                self.json_response(503, {'error': 'Não foi possível concluir o backup ou a restauração. Confira espaço livre e permissões.'})
            return
        if path == "/api/learning/drafts":
            if not self.allowed():
                return
            try:
                self.json_response(200, self.server.store.drafts.save(self.read_json(256 * 1024)))
            except DraftConflict as exc:
                self.json_response(409, {"error": str(exc), "code": exc.code})
            except (ValueError, TypeError, RecursionError) as exc:
                self.json_response(400, {"error": str(exc) or "Rascunho inválido."})
            except (OSError, sqlite3.Error):
                self.json_response(503, {"error": "Não foi possível gravar o rascunho no computador. A cópia do navegador continua disponível."})
            return
        if path in ("/api/sync/activity", "/api/sync/proton/login"):
            if not self.allowed():
                return
            try:
                payload = self.read_json(16 * 1024)
                if path == "/api/sync/activity":
                    result = self.server.auto_sync.activity(payload)
                else:
                    result = self.server.proton.login(payload)
                self.json_response(200, result or {"ok": True})
            except (ValueError, SyncError) as exc:
                self.json_response(400, {"error": str(exc)})
            except OSError:
                self.json_response(503, {"error": "Não foi possível abrir o aplicativo oficial do Proton. Confira o caminho e tente novamente."})
            return
        if path == "/api/dictionary":
            if not self.allowed():
                return
            try:
                payload = self.read_json(4096)
                if not isinstance(payload, dict) or payload.get("online"):
                    raise ValueError("Envie word e language. O dicionário usa apenas a base local.")
                self.json_response(200, self.server.dictionary.lookup(payload.get("word"), payload.get("language")))
            except DictionaryError as exc:
                self.json_response(exc.status, {"error": str(exc), "code": exc.code})
            except (ValueError, RecursionError) as exc:
                self.json_response(400, {"error": str(exc)})
            return
        if path == "/api/translate":
            if not self.allowed():
                return
            try:
                self.json_response(200, self.server.translation.translate(self.read_json()))
            except TranslationError as exc:
                self.json_response(exc.status, {"error": str(exc), "code": exc.code})
            except (ValueError, RecursionError) as exc:
                self.json_response(400, {"error": str(exc) or "Pedido de tradução inválido.", "code": "translation_invalid"})
            return
        if path in ("/api/sync/config", "/api/sync/publish", "/api/sync/receive", "/api/sync/check", "/api/sync/preview"):
            if not self.allowed():
                return
            try:
                payload = self.read_json()
                if path == "/api/sync/check":
                    if not isinstance(payload, dict):
                        raise ValueError("Pedido de sincronização inválido.")
                    self.json_response(200, self.server.auto_sync.request_check())
                elif path == "/api/sync/preview":
                    self.json_response(200, preview_snapshot(self.server.store, payload))
                else:
                    action = {"/api/sync/config": self.server.store.sync.configure, "/api/sync/publish": self.server.store.sync.publish, "/api/sync/receive": self.server.store.sync.receive}[path]
                    self.json_response(200, action(payload))
            except SyncError as exc:
                result = {"error": str(exc), "code": exc.code}
                if exc.state is not None:
                    result["status"] = exc.state
                self.json_response(exc.status, result)
            except Conflict as exc:
                self.json_response(409, {"error": str(exc), "code": "sync_revision_conflict"})
            except (ValueError, RecursionError) as exc:
                self.json_response(400, {"error": str(exc), "code": "sync_invalid"})
            except (OSError, sqlite3.Error):
                self.json_response(503, {"error": "A pasta ou o disco está indisponível. Nenhuma versão remota foi apagada; confira o armazenamento e tente novamente.", "code": "sync_unavailable"})
            return
        if path in ("/api/attachments", "/api/vault/import"):
            if not self.allowed():
                return
            try:
                if path == "/api/attachments":
                    result = self.server.store.features.upload(self.read_json())
                else:
                    result = self.server.store.features.import_vault(self.read_json(MAX_VAULT_REQUEST))
                self.json_response(200, result)
            except Conflict as exc:
                self.json_response(409, {"error": str(exc), "revision": self.server.store.read()["revision"]})
            except (ValueError, RecursionError) as exc:
                self.json_response(400, {"error": str(exc) or "Arquivo inválido."})
            except (OSError, sqlite3.Error):
                self.json_response(500, {"error": "Não foi possível gravar o anexo ou cofre. As notas anteriores foram preservadas."})
            return
        if urlsplit(self.path).path == "/api/proofread":
            if not self.allowed():
                return
            try:
                self.json_response(200, self.server.proofreader.check(self.read_json()))
            except ProofreaderError as exc:
                self.json_response(exc.status, {"error": str(exc), "code": exc.code})
            except (ValueError, RecursionError) as exc:
                self.json_response(400, {"error": str(exc) or "Dados de revisão inválidos."})
            except OSError:
                self.json_response(503, {"error": "Não foi possível iniciar o revisor local. Confira o LanguageTool e o Java."})
            return
        self.mutate(backup=True)


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, store):
        self.store = store
        self.proofreader = Proofreader(store.directory)
        self.dictionary = DictionaryService()
        self.translation = TranslationService(store.directory)
        super().__init__(address, Handler)
        self.proton = ProtonService(store.sync)
        self.auto_sync = AutoSync(store)
        self.auto_sync.start()

    def server_close(self):
        if hasattr(self, 'auto_sync'):
            self.auto_sync.stop()
        if hasattr(self, 'proton'):
            self.proton.close()
        self.translation.close()
        self.proofreader.close()
        super().server_close()


def open_window(url, desktop=False):
    if desktop:
        if os.name == "nt":
            candidates = []
            for variable in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
                base = os.environ.get(variable)
                if base:
                    candidates.extend((Path(base) / "Microsoft/Edge/Application/msedge.exe", Path(base) / "Google/Chrome/Application/chrome.exe"))
            for executable in candidates:
                if executable.is_file():
                    subprocess.Popen([str(executable), f"--app={url}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    return
        for name in ("chromium", "chromium-browser", "google-chrome-stable", "google-chrome"):
            executable = shutil.which(name)
            if executable:
                subprocess.Popen([executable, f"--app={url}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return
    webbrowser.open(url)


def default_data_directory():
    explicit = os.environ.get("XDG_DATA_HOME")
    if explicit:
        return Path(explicit) / "trama"
    legacy = Path.home() / ".local" / "share" / "trama"
    if os.name == "nt":
        if (legacy / "trama.db").is_file():
            return legacy
        return Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "Trama" / "data"
    return legacy


def main():
    parser = argparse.ArgumentParser(description="Trama — notas conectadas, somente neste computador.")
    parser.add_argument("--port", type=int, default=8765)
    default_data = default_data_directory()
    parser.add_argument("--data-dir", type=Path, default=default_data)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--desktop", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("A porta precisa estar entre 1 e 65535.")
    try:
        store = Store(args.data_dir)
        server = Server(("127.0.0.1", args.port), store)
        store.backup()
    except (OSError, sqlite3.Error) as exc:
        print(f"Não foi possível iniciar o Trama: {exc}\nSe a porta estiver ocupada, feche a outra instância ou use --port 8766.", file=sys.stderr)
        return 1
    url = f"http://127.0.0.1:{args.port}"
    print(f"Trama: {url}\nNotas: {store.path}\nCtrl+C encerra o servidor.", flush=True)
    if not args.no_browser:
        open_window(url, args.desktop)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nTrama encerrado.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
