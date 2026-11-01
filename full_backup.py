"""Portable, explicitly confirmed backups of application data, never credentials.

Instantiate before starting AutoSync: a small local journal reconciles the SQLite
commit with the separate sync configuration after an interrupted restoration.
"""
from __future__ import annotations

import base64
import copy
from datetime import datetime
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

from storage_features import MAX_ATTACHMENT, counts, clean_name, decode_base64, safe_type
from sync_store import stamp

FORMAT = "trama-full-backup-v1"
MAX_FULL_BACKUP_BYTES = 256 * 1024 * 1024
MAX_FULL_BACKUP_ARCHIVE = 260 * 1024 * 1024
MAX_FULL_BACKUP_REQUEST = 350 * 1024 * 1024
MAX_REVISION = 2**53 - 1024
HEX_ID = re.compile(r"[a-f0-9]{32}")
HASH = re.compile(r"[a-f0-9]{64}")
LANGUAGES = {"pt-BR", "pt-PT", "en-US", "en-GB"}
METADATA = {"graph.json", "history.json", "attachments.json", "drafts.json", "settings.json"}


class FullBackupError(ValueError):
    def __init__(self, message, status=400, code="backup_invalid"):
        super().__init__(message)
        self.status, self.code = status, code


def _json(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _loads(content):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise FullBackupError("O backup contém chaves JSON duplicadas.")
            result[key] = value
        return result
    return json.loads(content, object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(FullBackupError("Número JSON inválido.")))


def _date(value):
    if not isinstance(value, str) or len(value) > 100:
        raise FullBackupError("Data inválida no backup.")
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise FullBackupError("Data inválida no backup.") from None
    return value


def preferences(value, *, strict=False):
    """A semantic allowlist, never a dump of localStorage or account settings."""
    if not isinstance(value, dict):
        raise FullBackupError("Preferências inválidas.")
    allowed = {"theme", "textSize", "proofLanguage", "liveWriting", "vocabularyHints", "acceptedWords", "favorites", "recent"}
    if strict and set(value) - allowed:
        raise FullBackupError("O backup contém preferências não permitidas.")
    out = {}
    for key in allowed & value.keys():
        item = value[key]
        if key == "theme":
            valid = isinstance(item, str) and item in {"light", "dark", "system"}
        elif key == "textSize":
            valid = type(item) is int and 80 <= item <= 200
        elif key == "proofLanguage":
            valid = isinstance(item, str) and item in LANGUAGES
        elif key in ("liveWriting", "vocabularyHints"):
            valid = type(item) is bool
        elif key in ("favorites", "recent"):
            valid = isinstance(item, list) and len(item) <= (5000 if key == "favorites" else 20) and all(isinstance(ident, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", ident) for ident in item)
        else:
            valid = isinstance(item, dict) and not set(item) - LANGUAGES and all(isinstance(words, list) and len(words) <= 5000 and all(isinstance(word, str) and 0 < len(word) <= 200 and not any(ord(char) < 32 for char in word) for word in words) for words in item.values())
        if not valid:
            raise FullBackupError(f"Preferência inválida: {key}.")
        out[key] = copy.deepcopy(item)
    return out


class FullBackup:
    def __init__(self, store):
        self.store = store
        self.folder = store.directory / "full-backups"
        self.journal = store.directory / ".full-backup-restore.json"
        with store.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS full_backup_restore_state (id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL)")
        with store.sync.lock:
            self._recover_pending()

    def _drafts(self, db):
        return self.store.drafts.export_records(db)

    def _snapshot(self):
        with self.store.connect() as db:
            db.execute("BEGIN")
            # A full history can be much larger than the current graph. Check
            # stored byte counts before decoding all revisions into memory.
            stored_size = db.execute("SELECT COALESCE(SUM(length(CAST(data AS BLOB))),0) FROM graph").fetchone()[0]
            stored_size += db.execute("SELECT COALESCE(SUM(length(CAST(data AS BLOB))),0) FROM graph_history").fetchone()[0]
            stored_size += db.execute("SELECT COALESCE(SUM(length(CAST(data AS BLOB))),0) FROM learning_drafts").fetchone()[0]
            stored_size += db.execute("SELECT COALESCE(SUM(size),0) FROM attachments").fetchone()[0]
            if stored_size > MAX_FULL_BACKUP_BYTES:
                raise FullBackupError("O conteúdo excede o limite de 256 MB do backup completo. Nenhum arquivo foi gerado e nenhum conteúdo foi omitido.")
            revision, serialized = db.execute("SELECT revision,data FROM graph WHERE id=1").fetchone()
            history = [{"revision": row[0], "created": row[1], "data": _loads(row[2])}
                       for row in db.execute("SELECT revision,created,data FROM graph_history ORDER BY revision")]
            files = db.execute("SELECT id,name,type,size,filename,digest,created FROM attachments ORDER BY id").fetchall()
            drafts = self._drafts(db)
        return {"revision": revision, "data": _loads(serialized), "history": history, "files": files, "drafts": drafts}

    def _fingerprint(self, snapshot=None):
        snapshot = self._snapshot() if snapshot is None else snapshot
        return hashlib.sha256(_json({"snapshot": snapshot, "sync": self.store.sync.configuration()})).hexdigest()

    def export(self, payload=None):
        payload = {} if payload is None else payload
        if not isinstance(payload, dict):
            raise FullBackupError("Informe as preferências que deseja incluir.")
        prefs = preferences(payload.get("preferences", {}))
        with self.store.sync.lock:
            return self._export(prefs)

    def _export(self, prefs):
        snapshot = self._snapshot()
        self.store.serialize_data(snapshot["data"])
        if len(snapshot["history"]) > 100 or len(snapshot["files"]) > 5000:
            raise FullBackupError("O backup excede 100 revisões ou 5.000 anexos.")
        contents = {
            "graph.json": _json({"revision": snapshot["revision"], "data": snapshot["data"]}),
            "history.json": _json(snapshot["history"]),
            "drafts.json": _json(snapshot["drafts"]),
            "settings.json": _json({"preferences": prefs, "sync": {"automatic": False, "transport": self.store.sync.config.get("transport", "folder")}}),
        }
        total = sum(map(len, contents.values()))
        if total > MAX_FULL_BACKUP_BYTES:
            raise FullBackupError("O conteúdo excede o limite de 256 MB do backup completo. Nenhum arquivo foi gerado e nenhum conteúdo foi omitido.")
        attachments = []
        for ident, name, kind, size, filename, digest, created in snapshot["files"]:
            if not HEX_ID.fullmatch(ident) or not HEX_ID.fullmatch(filename):
                raise FullBackupError("Metadados locais de anexo inválidos.")
            path = self.store.features.folder / filename
            if path.is_symlink() or not path.is_file() or not 0 <= size <= MAX_ATTACHMENT or path.stat().st_size != size:
                raise FullBackupError("Um anexo local está ausente ou foi alterado. Confira os arquivos antes de criar o backup.")
            total += size
            if total > MAX_FULL_BACKUP_BYTES:
                raise FullBackupError("O conteúdo excede o limite de 256 MB do backup completo. Nenhum arquivo foi gerado e nenhum conteúdo foi omitido.")
            content = path.read_bytes()
            if hashlib.sha256(content).hexdigest() != digest:
                raise FullBackupError("Um anexo local não corresponde ao hash registrado.")
            archive_name = f"attachments/{ident}"
            contents[archive_name] = content
            attachments.append({"id": ident, "name": name, "type": kind, "size": size, "sha256": digest, "created": created, "file": archive_name})
        contents["attachments.json"] = _json(attachments)
        if sum(map(len, contents.values())) > MAX_FULL_BACKUP_BYTES:
            raise FullBackupError("O conteúdo excede o limite de 256 MB do backup completo. Nenhum arquivo foi gerado e nenhum conteúdo foi omitido.")
        manifest = {"format": FORMAT, "created": stamp(), "files": [{"path": name, "size": len(content), "sha256": hashlib.sha256(content).hexdigest()} for name, content in sorted(contents.items())]}
        result = io.BytesIO()
        with zipfile.ZipFile(result, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", _json(manifest))
            for name, content in sorted(contents.items()):
                archive.writestr(name, content)
        raw = result.getvalue()
        if len(raw) > MAX_FULL_BACKUP_ARCHIVE:
            raise FullBackupError("O arquivo de backup excede 260 MB.")
        return raw

    def _unpack(self, raw):
        try:
            if len(raw) > MAX_FULL_BACKUP_ARCHIVE:
                raise FullBackupError("O arquivo de backup excede 260 MB.")
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                infos = archive.infolist()
                names = [item.filename for item in infos]
                if len(infos) > 5006 or len(set(names)) != len(names) or sum(item.file_size for item in infos if item.filename != "manifest.json") > MAX_FULL_BACKUP_BYTES:
                    raise FullBackupError("Backup grande demais ou com entradas duplicadas.")
                for item in infos:
                    if (item.filename not in METADATA | {"manifest.json"} and not re.fullmatch(r"attachments/[a-f0-9]{32}", item.filename)
                            or stat.S_ISLNK(item.external_attr >> 16) or item.flag_bits & 1
                            or item.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
                        raise FullBackupError("O backup contém caminhos ou arquivos não permitidos.")
                if not (METADATA | {"manifest.json"}) <= set(names) or archive.getinfo("manifest.json").file_size > 2 * 1024 * 1024:
                    raise FullBackupError("Use um backup completo exportado pelo Trama.")
                manifest = _loads(archive.read("manifest.json"))
                if not isinstance(manifest, dict) or set(manifest) != {"format", "created", "files"} or manifest.get("format") != FORMAT or not isinstance(manifest.get("files"), list):
                    raise FullBackupError("Formato de backup completo inválido.")
                _date(manifest.get("created"))
                content, listed = {}, set()
                for entry in manifest["files"]:
                    if not isinstance(entry, dict) or set(entry) != {"path", "size", "sha256"}:
                        raise FullBackupError("Manifesto do backup inválido.")
                    name, size, digest = entry["path"], entry["size"], entry["sha256"]
                    if not isinstance(name, str) or name not in names or name == "manifest.json" or name in listed or type(size) is not int or size < 0 or not isinstance(digest, str) or not HASH.fullmatch(digest):
                        raise FullBackupError("Manifesto do backup inválido.")
                    listed.add(name)
                    if archive.getinfo(name).file_size != size:
                        raise FullBackupError("Tamanho de arquivo diferente do manifesto.")
                    value = archive.read(name)
                    if hashlib.sha256(value).hexdigest() != digest:
                        raise FullBackupError("A integridade do backup não confere. Nenhuma nota foi alterada.")
                    content[name] = value
                if listed != set(names) - {"manifest.json"}:
                    raise FullBackupError("Há arquivos não previstos no manifesto.")
            graph = _loads(content["graph.json"])
            if not isinstance(graph, dict) or set(graph) != {"revision", "data"} or type(graph["revision"]) is not int or not 0 <= graph["revision"] <= MAX_REVISION:
                raise FullBackupError("Estado do grafo inválido.")
            serialized = self.store.serialize_data(graph["data"])
            history = _loads(content["history.json"])
            if not isinstance(history, list) or not 1 <= len(history) <= 100:
                raise FullBackupError("O histórico deve conter entre 1 e 100 revisões.")
            last = -1
            for item in history:
                if not isinstance(item, dict) or set(item) != {"revision", "created", "data"} or type(item["revision"]) is not int or not last < item["revision"] <= graph["revision"]:
                    raise FullBackupError("Histórico inválido ou fora de ordem.")
                _date(item["created"])
                self.store.serialize_data(item["data"])
                last = item["revision"]
            if last != graph["revision"] or history[-1]["data"] != graph["data"]:
                raise FullBackupError("O histórico não corresponde ao estado atual do backup.")
            drafts = _loads(content["drafts.json"])
            drafts = self.store.drafts.validate_backup(drafts)
            settings = _loads(content["settings.json"])
            if (not isinstance(settings, dict) or set(settings) != {"preferences", "sync"}
                    or not isinstance(settings["sync"], dict) or set(settings["sync"]) != {"automatic", "transport"}
                    or settings["sync"]["automatic"] is not False or settings["sync"]["transport"] not in ("folder", "proton")):
                raise FullBackupError("Configurações não permitidas no backup.")
            settings["preferences"] = preferences(settings["preferences"], strict=True)
            entries = _loads(content["attachments.json"])
            if not isinstance(entries, list) or len(entries) > 5000:
                raise FullBackupError("Lista de anexos inválida.")
            ids, attachments = set(), []
            for entry in entries:
                if not isinstance(entry, dict) or set(entry) != {"id", "name", "type", "size", "sha256", "created", "file"}:
                    raise FullBackupError("Metadados de anexo inválidos.")
                ident = entry["id"]
                if not isinstance(ident, str) or not HEX_ID.fullmatch(ident) or ident in ids or entry["file"] != f"attachments/{ident}":
                    raise FullBackupError("Identificador de anexo inválido ou duplicado.")
                ids.add(ident)
                binary = content.get(entry["file"])
                if binary is None or type(entry["size"]) is not int or not 0 <= entry["size"] <= MAX_ATTACHMENT or len(binary) != entry["size"] or hashlib.sha256(binary).hexdigest() != entry["sha256"]:
                    raise FullBackupError("Um anexo não corresponde aos metadados do backup.")
                _date(entry["created"])
                if not isinstance(entry["type"], str) or clean_name(entry["name"]) != entry["name"]:
                    raise FullBackupError("Nome ou tipo de anexo inválido.")
                attachments.append({**entry, "type": safe_type(binary, entry["type"]), "content": binary})
            if set(content) != METADATA | {f"attachments/{ident}" for ident in ids}:
                raise FullBackupError("O backup contém anexos não declarados.")
            return {"graph": graph, "serialized": serialized, "history": history, "drafts": drafts,
                    "settings": settings, "attachments": attachments, "created": manifest["created"]}
        except FullBackupError:
            raise
        except (ValueError, TypeError, KeyError, UnicodeError, RecursionError, zipfile.BadZipFile, RuntimeError, zlib.error) as error:
            raise FullBackupError("Backup completo inválido ou corrompido: " + str(error)) from None

    @staticmethod
    def _summary(unpacked):
        pages, blocks = counts(unpacked["graph"]["data"])
        return {"pages": pages, "blocks": blocks, "attachments": len(unpacked["attachments"]),
                "attachmentBytes": sum(entry["size"] for entry in unpacked["attachments"]),
                "history": len(unpacked["history"]), "drafts": len(unpacked["drafts"]),
                "created": unpacked["created"], "preferences": sorted(unpacked["settings"]["preferences"])}

    def inspect(self, payload):
        if not isinstance(payload, dict):
            raise FullBackupError("Selecione um arquivo de backup.")
        raw = decode_base64(payload.get("data"), MAX_FULL_BACKUP_ARCHIVE)
        unpacked = self._unpack(raw)
        with self.store.sync.lock:
            snapshot = self._snapshot()
            self._check_revision(payload.get("revision"), snapshot["revision"])
            return {"summary": self._summary(unpacked), "inspection": {"sha256": hashlib.sha256(raw).hexdigest(),
                    "fingerprint": self._fingerprint(snapshot), "revision": snapshot["revision"]}}

    @staticmethod
    def _check_revision(expected, current):
        if type(expected) is not int or expected < 0:
            raise FullBackupError("Informe a revisão atual.")
        if expected != current:
            raise FullBackupError("As notas mudaram. Inspecione o backup novamente antes de restaurar.", 409, "backup_stale")

    def _write(self, path, content):
        self.store.sync._write_exclusive(path, content)

    def _sync_directory(self):
        if os.name != "nt":
            descriptor = os.open(self.store.directory, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)

    def _publish_journal(self, journal):
        # A process interrupted during the write must leave an ignored staging
        # file, never a truncated recovery record that prevents opening notes.
        temporary = self.store.directory / f".full-backup-restore-{uuid.uuid4().hex}.tmp"
        written = False
        try:
            self._write(temporary, _json(journal))
            written = True
            os.replace(temporary, self.journal)
            self._sync_directory()
        finally:
            if written:
                temporary.unlink(missing_ok=True)

    def _recover_pending(self):
        if not self.journal.exists():
            return None
        journal = _loads(self.journal.read_bytes())
        token = journal.get("token") if isinstance(journal, dict) else None
        if (not isinstance(token, str) or not HEX_ID.fullmatch(token)
                or not isinstance(journal.get("oldConfig"), dict) or not isinstance(journal.get("targetConfig"), dict)
                or type(journal.get("oldConfigExisted")) is not bool
                or journal["targetConfig"].get("automatic") is not False
                or journal["targetConfig"].get("folder") is not None or journal["targetConfig"].get("cliPath") is not None):
            raise FullBackupError("Registro de restauração inválido. Preserve a pasta de dados para recuperação.", 503, "backup_recovery")
        old_file = self.store.directory / f".full-backup-old-config-{token}.json"
        with self.store.connect() as db:
            row = db.execute("SELECT token FROM full_backup_restore_state WHERE id=1").fetchone()
        committed = bool(row and row[0] == token)
        if committed:
            target = journal["targetConfig"]
            try:
                present = _loads(self.store.sync.config_path.read_bytes())
            except (OSError, ValueError):
                present = None
            if present != target:
                self.store.sync._save_config(target)
        else:
            target = journal["oldConfig"]
            if journal["oldConfigExisted"]:
                if not old_file.is_file() or old_file.is_symlink():
                    raise FullBackupError("A configuração anterior está indisponível para recuperação.", 503, "backup_recovery")
                # Keep the saved original until the journal has been removed:
                # recovery itself must be safe to retry after another crash.
                rollback_file = self.store.directory / f".full-backup-rollback-{token}.json"
                rollback_file.unlink(missing_ok=True)
                self._write(rollback_file, old_file.read_bytes())
                os.replace(rollback_file, self.store.sync.config_path)
            else:
                self.store.sync.config_path.unlink(missing_ok=True)
        self.store.sync.config = target
        self.store.sync.config_error = None if committed else journal.get("oldConfigError")
        self.store.sync._status_cache = None
        self.store.sync._snapshot_cache.clear()
        self.store.sync._snapshot_errors.clear()
        self.journal.unlink()
        try:
            old_file.unlink(missing_ok=True)
        except OSError:
            pass  # An obsolete local safety copy cannot invalidate a commit.
        return committed

    def _apply_restore(self, db, unpacked, revision, token, written):
        db.execute("DELETE FROM attachments")
        for entry in unpacked["attachments"]:
            filename = self.store.features._write(entry["content"])
            written.append(filename)
            db.execute("INSERT INTO attachments VALUES(?,?,?,?,?,?,?)", (entry["id"], entry["name"], entry["type"], entry["size"], filename, entry["sha256"], entry["created"]))
        db.execute("DELETE FROM graph_history")
        # Imported history stays in its original order; new local revision IDs
        # remain monotonically increasing so other open windows detect the restore.
        for offset, item in enumerate(unpacked["history"], 1):
            pages, blocks = counts(item["data"])
            db.execute("INSERT INTO graph_history VALUES(?,?,?,?,?)", (revision + offset, item["created"], self.store.serialize_data(item["data"]), pages, blocks))
        restored_revision = revision + len(unpacked["history"])
        if restored_revision > MAX_REVISION:
            raise FullBackupError("O número de revisões excede o limite permitido.")
        db.execute("UPDATE graph SET revision=?,data=? WHERE id=1", (restored_revision, unpacked["serialized"]))
        self.store.drafts.replace_records(db, unpacked["drafts"])
        db.execute("INSERT OR REPLACE INTO full_backup_restore_state VALUES(1,?)", (token,))
        return restored_revision

    def restore(self, payload):
        if not isinstance(payload, dict):
            raise FullBackupError("Inspecione o backup antes de restaurar.")
        raw = decode_base64(payload.get("data"), MAX_FULL_BACKUP_ARCHIVE)
        unpacked = self._unpack(raw)
        inspection = payload.get("inspection")
        if not isinstance(inspection, dict) or any(not isinstance(inspection.get(key), str) or not HASH.fullmatch(inspection[key]) for key in ("sha256", "fingerprint")) or type(inspection.get("revision")) is not int:
            raise FullBackupError("Inspecione o backup antes de restaurar.")
        before_preferences = preferences(payload.get("preferencesBefore", {}))
        written, recovery_path, restored_revision = [], None, None
        worker = getattr(self.store.sync, "worker", None)
        with self.store.sync.lock:
            self._recover_pending()
            current = self._snapshot()
            self._check_revision(payload.get("revision"), current["revision"])
            if inspection["revision"] != current["revision"] or inspection["sha256"] != hashlib.sha256(raw).hexdigest() or inspection["fingerprint"] != self._fingerprint(current):
                raise FullBackupError("As notas, anexos, rascunhos ou configurações mudaram. Inspecione o backup novamente.", 409, "backup_stale")
            recovery = self._export(before_preferences)
            self.folder.mkdir(exist_ok=True)
            token = uuid.uuid4().hex
            recovery_path = self.folder / f"before-restore-{token}.zip"
            self._write(recovery_path, recovery)
            old = self.store.sync.configuration()
            target = {**old, "automatic": False, "folder": None, "cliPath": None, "remoteFolder": "/my-files/Trama",
                      "base": None, "baseFingerprint": None, "mergeParents": [], "transport": unpacked["settings"]["sync"]["transport"]}
            old_file = self.store.directory / f".full-backup-old-config-{token}.json"
            existed = self.store.sync.config_path.is_file()
            if existed:
                self._write(old_file, self.store.sync.config_path.read_bytes())
            journal = {"token": token, "oldConfig": old, "targetConfig": target, "oldConfigExisted": existed,
                       "oldConfigError": self.store.sync.config_error}
            committed = False
            try:
                self._publish_journal(journal)
                with self.store.connect() as db:
                    db.execute("BEGIN IMMEDIATE")
                    self.store.check_revision(db, payload["revision"])
                    self.store.sync._save_config(target)
                    self.store.sync.config = target
                    if worker is not None:
                        worker.configuration_changed()
                    restored_revision = self._apply_restore(db, unpacked, current["revision"], token, written)
                committed = True
                self._recover_pending()
            except Exception:
                # A journal-cleanup error after the database commit must never
                # remove attachment files now referenced by the restored graph.
                with self.store.connect() as db:
                    marker = db.execute("SELECT token FROM full_backup_restore_state WHERE id=1").fetchone()
                committed = committed or bool(marker and marker[0] == token)
                self._recover_pending()
                if not committed:
                    for filename in written:
                        (self.store.features.folder / filename).unlink(missing_ok=True)
                    if worker is not None:
                        worker.configuration_changed()
                    raise
                restored_revision = self.store.revision()
        if worker is not None:
            worker.configuration_changed()
        return {"revision": restored_revision, "recoveryId": token, "recoveryPath": str(recovery_path),
                "preferences": unpacked["settings"]["preferences"], "summary": self._summary(unpacked), "syncDisabled": True}

    def recovery(self, ident):
        if not isinstance(ident, str) or not HEX_ID.fullmatch(ident):
            raise FullBackupError("Cópia de recuperação não encontrada.", 404)
        path = self.folder / f"before-restore-{ident}.zip"
        if path.is_symlink() or not path.is_file():
            raise FullBackupError("Cópia de recuperação não encontrada.", 404)
        return path.read_bytes()
