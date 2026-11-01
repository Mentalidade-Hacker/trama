"""Local attachments, version history and bounded portable vault archives."""
from __future__ import annotations

import base64
import binascii
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import uuid
import zipfile
import zlib

MAX_ATTACHMENT = 20 * 1024 * 1024
MAX_VAULT_BYTES = 100 * 1024 * 1024
MAX_VAULT_ARCHIVE = 110 * 1024 * 1024
MAX_VAULT_REQUEST = 150 * 1024 * 1024
ATTACHMENT_ID = re.compile(r"^[a-f0-9]{32}$")
INLINE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp", "audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/mp4", "video/mp4", "video/webm", "audio/webm", "video/ogg", "application/pdf"}


def now():
    return datetime.now(timezone.utc).isoformat()


def counts(data):
    pending = [block for page in data["pages"] for block in page["blocks"]]
    total = 0
    while pending:
        block = pending.pop()
        total += 1
        pending.extend(block["children"])
    return len(data["pages"]), total


def setup(db):
    db.execute("CREATE TABLE IF NOT EXISTS graph_history (revision INTEGER PRIMARY KEY, created TEXT NOT NULL, data TEXT NOT NULL, pages INTEGER NOT NULL, blocks INTEGER NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL, filename TEXT NOT NULL, digest TEXT NOT NULL, created TEXT NOT NULL)")
    revision, serialized = db.execute("SELECT revision,data FROM graph WHERE id=1").fetchone()
    record_history(db, revision, serialized, json.loads(serialized))


def record_history(db, revision, serialized, data):
    pages, blocks = counts(data)
    db.execute("INSERT OR IGNORE INTO graph_history VALUES(?,?,?,?,?)", (revision, now(), serialized, pages, blocks))
    db.execute("DELETE FROM graph_history WHERE revision NOT IN (SELECT revision FROM graph_history ORDER BY revision DESC LIMIT 100)")


def clean_name(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("O anexo precisa de um nome.")
    value = value.replace("\\", "/").split("/")[-1]
    value = "".join(c for c in value if ord(c) >= 32 and c not in '\x7f\r\n').strip()[:240]
    return value or "anexo"


def safe_type(content, declared):
    # SVG and HTML are intentionally never rendered as documents. A supplied
    # MIME type cannot turn arbitrary bytes into an inline image or document.
    declared = declared.partition(";")[0].strip().lower() if isinstance(declared, str) else ""
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return "image/webp"
    if content.startswith(b"RIFF") and content[8:12] == b"WAVE":
        return "audio/wav"
    if content.startswith(b"%PDF-"):
        return "application/pdf"
    if content.startswith(b"fLaC"):
        return "audio/flac"
    if content.startswith(b"ID3") or len(content) > 1 and content[0] == 255 and content[1] & 224 == 224:
        return "audio/mpeg"
    if content.startswith(b"OggS"):
        return "video/ogg" if declared == "video/ogg" else "audio/ogg"
    if len(content) >= 12 and content[4:8] == b"ftyp":
        return "audio/mp4" if declared == "audio/mp4" else "video/mp4"
    if content.startswith(b"\x1aE\xdf\xa3") and declared in ("video/webm", "audio/webm"):
        return declared
    return "application/octet-stream"


def decode_base64(value, maximum):
    if not isinstance(value, str) or len(value) > ((maximum + 2) // 3) * 4:
        raise ValueError("Arquivo ausente ou maior que o limite permitido.")
    try:
        content = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("Conteúdo base64 inválido.") from None
    if len(content) > maximum:
        raise ValueError("Arquivo maior que o limite permitido.")
    return content


def public(row):
    return {"id": row[0], "name": row[1], "type": row[2], "size": row[3], "url": f"/files/{row[0]}", "created": row[6]}


class StorageFeatures:
    def __init__(self, store):
        self.store = store
        self.folder = store.directory / "attachments"
        self.folder.mkdir(exist_ok=True)

    def _write(self, content):
        filename = uuid.uuid4().hex
        path = self.folder / filename
        # Exclusive create + immutable storage names keep imports atomic even
        # while another tab reads an attachment from the old vault.
        created = False
        try:
            with path.open("xb") as file:
                created = True
                file.write(content)
                file.flush()
                os.fsync(file.fileno())
            if os.name != "nt":
                path.chmod(0o600)
        except Exception:
            if created:
                path.unlink(missing_ok=True)
            raise
        return filename

    def upload(self, payload):
        with self.store.sync.lock:
            result = self._upload(payload)
        worker = getattr(self.store.sync, 'worker', None)
        if worker is not None:
            worker.wake()
        return result

    def _upload(self, payload):
        if not isinstance(payload, dict):
            raise ValueError("Envie name, type e data para anexar um arquivo.")
        name = clean_name(payload.get("name"))
        content = decode_base64(payload.get("data"), MAX_ATTACHMENT)
        declared = payload.get("type", "")
        if not isinstance(declared, str):
            raise ValueError("Tipo de arquivo inválido.")
        kind = safe_type(content, declared)
        filename = self._write(content)
        row = (uuid.uuid4().hex, name, kind, len(content), filename, hashlib.sha256(content).hexdigest(), now())
        try:
            with self.store.connect() as db:
                db.execute("INSERT INTO attachments VALUES(?,?,?,?,?,?,?)", row)
        except Exception:
            (self.folder / filename).unlink(missing_ok=True)
            raise
        return public(row)

    def list(self):
        with self.store.connect() as db:
            rows = db.execute("SELECT * FROM attachments ORDER BY created DESC").fetchall()
        return [public(row) for row in rows]

    def file(self, ident):
        if not ATTACHMENT_ID.fullmatch(ident):
            raise FileNotFoundError("Anexo não encontrado.")
        with self.store.connect() as db:
            row = db.execute("SELECT * FROM attachments WHERE id=?", (ident,)).fetchone()
        if row is None or not ATTACHMENT_ID.fullmatch(row[4]):
            raise FileNotFoundError("Anexo não encontrado.")
        path = (self.folder / row[4]).resolve()
        if path.parent != self.folder.resolve() or not path.is_file():
            raise FileNotFoundError("Anexo não encontrado.")
        return public(row), path

    def history(self):
        with self.store.connect() as db:
            rows = db.execute("SELECT revision,created,pages,blocks FROM graph_history ORDER BY revision DESC").fetchall()
        return [dict(zip(("revision", "created", "pages", "blocks"), row)) for row in rows]

    def snapshot(self, revision):
        with self.store.connect() as db:
            row = db.execute("SELECT revision,data FROM graph_history WHERE revision=?", (revision,)).fetchone()
        if row is None:
            raise FileNotFoundError("Esta versão não está mais no histórico.")
        return {"revision": row[0], "data": json.loads(row[1])}

    def export_vault(self):
        # One DB read transaction makes graph and manifest a coherent snapshot.
        with self.store.connect() as db:
            db.execute("BEGIN")
            serialized = db.execute("SELECT data FROM graph WHERE id=1").fetchone()[0]
            rows = db.execute("SELECT * FROM attachments ORDER BY id").fetchall()
        manifest = {"version": 1, "files": [{**public(row), "file": f"attachments/{row[0]}", "sha256": row[5]} for row in rows]}
        manifest_bytes = json.dumps(manifest, ensure_ascii=False).encode("utf-8")
        state_bytes = serialized.encode("utf-8")
        if len(rows) > 5000 or sum(row[3] for row in rows) + len(manifest_bytes) + len(state_bytes) > MAX_VAULT_BYTES:
            raise ValueError("O cofre excede o limite de exportação de 100 MB ou 5.000 anexos. Copie a pasta de dados com o Trama fechado para um backup completo.")
        result = io.BytesIO()
        with zipfile.ZipFile(result, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("state.json", state_bytes)
            archive.writestr("attachments.json", manifest_bytes)
            for row in rows:
                _, path = self.file(row[0])
                content = path.read_bytes()
                if len(content) != row[3] or hashlib.sha256(content).hexdigest() != row[5]:
                    raise ValueError("Um anexo foi alterado fora do Trama; exportação interrompida.")
                archive.writestr(f"attachments/{row[0]}", content)
        return result.getvalue()

    def _unpack(self, content):
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                infos = archive.infolist()
                names = [item.filename for item in infos]
                if len(infos) > 5002 or len(set(names)) != len(names):
                    raise ValueError("Arquivo ZIP com entradas duplicadas ou anexos demais.")
                if sum(item.file_size for item in infos) > MAX_VAULT_BYTES:
                    raise ValueError("O conteúdo descompactado excede 100 MB.")
                for item in infos:
                    parts = item.filename.split("/")
                    if item.filename.startswith("/") or "\\" in item.filename or any(p in ("", ".", "..") for p in parts) or stat.S_ISLNK(item.external_attr >> 16) or item.flag_bits & 1:
                        raise ValueError("O ZIP contém caminhos ou entradas não permitidos.")
                    if item.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                        raise ValueError("Compressão ZIP não suportada.")
                if not {"state.json", "attachments.json"}.issubset(names):
                    raise ValueError("Use um cofre ZIP exportado pelo Trama.")
                if archive.getinfo("state.json").file_size > 32 * 1024 * 1024 or archive.getinfo("attachments.json").file_size > 8 * 1024 * 1024:
                    raise ValueError("Metadados do cofre grandes demais.")
                data = json.loads(archive.read("state.json"))
                serialized = self.store.serialize_data(data)
                manifest = json.loads(archive.read("attachments.json"))
                if not isinstance(manifest, dict) or manifest.get("version") != 1 or not isinstance(manifest.get("files"), list) or len(manifest["files"]) > 5000:
                    raise ValueError("Lista de anexos inválida.")
                expected = {"state.json", "attachments.json"}
                entries, identifiers = [], set()
                for entry in manifest["files"]:
                    if not isinstance(entry, dict):
                        raise ValueError("Metadados de anexo inválidos.")
                    ident = entry.get("id")
                    if not isinstance(ident, str) or not ATTACHMENT_ID.fullmatch(ident) or ident in identifiers:
                        raise ValueError("ID de anexo inválido ou duplicado.")
                    identifiers.add(ident)
                    filename = f"attachments/{ident}"
                    if entry.get("file") != filename or filename not in names:
                        raise ValueError("Arquivo de anexo ausente ou caminho inválido.")
                    info = archive.getinfo(filename)
                    if info.file_size > MAX_ATTACHMENT or type(entry.get("size")) is not int or entry["size"] != info.file_size:
                        raise ValueError("Tamanho de anexo inválido (máximo de 20 MB).")
                    attachment = archive.read(filename)
                    digest = hashlib.sha256(attachment).hexdigest()
                    if digest != entry.get("sha256"):
                        raise ValueError("Um anexo não corresponde ao hash declarado.")
                    name = clean_name(entry.get("name"))
                    declared = entry.get("type", "")
                    if not isinstance(declared, str):
                        raise ValueError("Tipo de anexo inválido.")
                    entries.append((ident, name, safe_type(attachment, declared), attachment, digest))
                    expected.add(filename)
                if set(names) != expected:
                    raise ValueError("O ZIP contém arquivos não previstos no manifesto.")
                return data, serialized, entries
        except (zipfile.BadZipFile, UnicodeError, json.JSONDecodeError, KeyError, RuntimeError, zlib.error):
            raise ValueError("Cofre ZIP inválido ou corrompido.") from None

    def import_vault(self, payload):
        with self.store.sync.lock:
            return self._import_vault(payload)

    def _import_vault(self, payload):
        if not isinstance(payload, dict) or type(payload.get("revision")) is not int or payload["revision"] < 0:
            raise ValueError("Informe a revisão atual ao importar o cofre.")
        content = decode_base64(payload.get("data"), MAX_VAULT_ARCHIVE)
        data, serialized, entries = self._unpack(content)
        backup_path = self.store.backup()
        written = []
        try:
            with self.store.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                # Check the graph revision before touching attachment storage.
                self.store.check_revision(db, payload["revision"])
                for ident, name, kind, attachment, digest in entries:
                    existing = db.execute("SELECT digest FROM attachments WHERE id=?", (ident,)).fetchone()
                    if existing:
                        if existing[0] != digest:
                            raise ValueError("O cofre contém um ID de anexo com conteúdo diferente. Importe em uma pasta de dados vazia.")
                        continue
                    filename = self._write(attachment)
                    written.append(filename)
                    db.execute("INSERT INTO attachments VALUES(?,?,?,?,?,?,?)", (ident, name, kind, len(attachment), filename, digest, now()))
                revision = self.store.write_in_transaction(db, payload["revision"], serialized, data)
        except Exception:
            for filename in written:
                (self.folder / filename).unlink(missing_ok=True)
            raise
        # Old binaries and metadata are retained so past snapshots stay usable.
        return {"revision": revision, "backup": backup_path, "attachments": len(entries), "data": data}
