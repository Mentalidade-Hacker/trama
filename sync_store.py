"""Manual immutable vault snapshots in a separately synchronized folder.

This module never synchronizes a live SQLite database, contacts a cloud account,
deletes remote versions, or silently merges two independently edited graphs.
"""
from __future__ import annotations

import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import threading
import uuid

from storage_features import MAX_VAULT_ARCHIVE, counts

ID = re.compile(r"^[a-f0-9]{32}$")
FORMAT = "trama-sync-v1"


class SyncError(Exception):
    def __init__(self, message, status=400, code="sync_invalid", state=None):
        super().__init__(message)
        self.status, self.code, self.state = status, code, state


def stamp():
    return datetime.now(timezone.utc).isoformat()


class SyncStore:
    def __init__(self, store):
        self.store = store
        self.lock = threading.RLock()
        self.config_path = store.directory / "sync-config.json"
        self.recovery_folder = store.directory / "sync-recovery"
        self.config_error = None
        self.config = {"folder": None, "device": uuid.uuid4().hex, "deviceName": socket.gethostname(), "base": None, "baseFingerprint": None, "mergeParents": []}
        if self.config_path.is_file():
            try:
                config = json.loads(self.config_path.read_text(encoding="utf-8"))
                if not isinstance(config, dict) or not isinstance(config.get("device"), str) or not ID.fullmatch(config["device"]) or config.get("folder") is not None and not isinstance(config.get("folder"), str):
                    raise ValueError("Invalid config")
                parents = config.get("mergeParents", [])
                if not isinstance(parents, list) or any(not isinstance(ident, str) or not ID.fullmatch(ident) for ident in parents):
                    raise ValueError("Invalid config")
                if config.get("base") is not None and (not isinstance(config["base"], str) or not ID.fullmatch(config["base"])):
                    raise ValueError("Invalid config")
                self.config.update(config)
            except (OSError, ValueError):
                # A transport configuration error must never prevent the user
                # from opening their local notes. Keep the file untouched until
                # they explicitly configure another connection.
                self.config_error = "A configuração de sincronização está inválida. As notas locais continuam disponíveis; confira sync-config.json e configure a pasta novamente."

    def _save_config(self):
        temporary = self.store.directory / f".sync-config-{uuid.uuid4().hex}.tmp"
        try:
            self._write_exclusive(temporary, json.dumps(self.config, ensure_ascii=False).encode("utf-8"))
            os.replace(temporary, self.config_path)
        finally:
            temporary.unlink(missing_ok=True)

    @staticmethod
    def _write_exclusive(path, content):
        with path.open("xb") as target:
            target.write(content)
            target.flush()
            os.fsync(target.fileno())
        if os.name != "nt":
            path.chmod(0o600)

    def _folder(self):
        value = self.config.get("folder")
        if not value:
            raise SyncError("Escolha primeiro uma pasta existente para trocar cópias do grafo.", 400, "sync_not_configured")
        folder = Path(value)
        if not folder.is_dir():
            raise SyncError("A pasta sincronizada está indisponível. Monte ou sincronize a pasta e tente novamente.", 503, "sync_folder_unavailable")
        return folder

    def configure(self, payload):
        if not isinstance(payload, dict) or not isinstance(payload.get("folder"), str) or not payload["folder"].strip():
            raise SyncError("Informe o caminho de uma pasta existente.")
        folder = Path(payload["folder"]).expanduser().resolve()
        if not folder.is_dir():
            raise SyncError("A pasta precisa existir antes de ser configurada.")
        # Never make the live DB or its parents the transport directory.
        if self.store.directory.is_relative_to(folder) or any(folder == self.store.directory / name for name in ("attachments", "backups", "sync-recovery", "app")):
            raise SyncError("Use uma pasta separada, dedicada às cópias ZIP. Não sincronize a pasta do banco SQLite em uso.")
        with self.lock:
            if str(folder) != self.config.get("folder"):
                self.config.update(folder=str(folder), base=None, baseFingerprint=None, mergeParents=[])
            self._save_config()
            self.config_error = None
            return self.status()

    def _fingerprint(self):
        with self.store.connect() as db:
            db.execute("BEGIN")
            revision, serialized = db.execute("SELECT revision,data FROM graph WHERE id=1").fetchone()
            attachments = db.execute("SELECT id,name,type,size,digest FROM attachments ORDER BY id").fetchall()
        data = json.loads(serialized)
        canonical = json.dumps({"data": data, "attachments": attachments}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest(), revision, data

    def _read_snapshot(self, folder, ident, content=False):
        if not isinstance(ident, str) or not ID.fullmatch(ident):
            raise SyncError("Identificador de versão inválido.")
        metadata_path, archive_path = folder / f"{ident}.json", folder / f"{ident}.zip"
        if metadata_path.is_symlink() or archive_path.is_symlink() or not metadata_path.is_file() or not archive_path.is_file():
            raise SyncError("Essa versão ainda não foi transferida por completo.", 409, "sync_incomplete")
        if metadata_path.stat().st_size > 64 * 1024 or archive_path.stat().st_size > MAX_VAULT_ARCHIVE:
            raise SyncError("Versão sincronizada excede os limites permitidos.")
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise SyncError("Metadados da versão inválidos.") from None
        if not isinstance(metadata, dict) or metadata.get("format") != FORMAT or metadata.get("id") != ident:
            raise SyncError("Formato de versão sincronizada inválido.")
        for field in ("sha256", "contentHash"):
            if not isinstance(metadata.get(field), str) or not re.fullmatch(r"[a-f0-9]{64}", metadata[field]):
                raise SyncError("Hash da versão inválido.")
        parents = metadata.get("parents", [metadata["parent"]] if metadata.get("parent") else [])
        if not isinstance(parents, list) or len(parents) > 1000 or any(not isinstance(parent, str) or not ID.fullmatch(parent) or parent == ident for parent in parents):
            raise SyncError("Ancestrais da versão inválidos.")
        if not isinstance(metadata.get("created"), str) or not isinstance(metadata.get("device"), str) or not ID.fullmatch(metadata["device"]) or type(metadata.get("revision")) is not int:
            raise SyncError("Metadados de origem inválidos.")
        metadata["parents"] = list(dict.fromkeys(parents))
        # Hash files while scanning as a transport may expose a partial ZIP.
        digest = hashlib.sha256()
        received = bytearray() if content else None
        total = 0
        with archive_path.open("rb") as archive:
            for chunk in iter(lambda: archive.read(1024 * 1024), b""):
                total += len(chunk)
                if total > MAX_VAULT_ARCHIVE:
                    raise SyncError("Versão sincronizada excede os limites permitidos.")
                digest.update(chunk)
                if received is not None:
                    received.extend(chunk)
        if digest.hexdigest() != metadata["sha256"]:
            raise SyncError("O arquivo da versão está incompleto ou seu hash não confere. Aguarde a transferência; nenhuma nota foi substituída.", 409, "sync_hash_mismatch")
        return (metadata, bytes(received)) if content else metadata

    def _scan(self, folder):
        snapshots, incomplete = [], 0
        for path in folder.glob("*.json"):
            if not ID.fullmatch(path.stem):
                continue
            try:
                snapshots.append(self._read_snapshot(folder, path.stem))
            except (SyncError, OSError):
                incomplete += 1
        snapshots.sort(key=lambda item: (item["created"], item["id"]), reverse=True)
        identifiers = {item["id"] for item in snapshots}
        parents = {parent for item in snapshots for parent in item["parents"]}
        return snapshots, sorted(identifiers - parents), incomplete

    def _recoveries(self):
        if not self.recovery_folder.is_dir():
            return []
        result = []
        for path in self.recovery_folder.glob("*.json"):
            try:
                entry = json.loads(path.read_text(encoding="utf-8"))
                archive = self.recovery_folder / f"{path.stem}.zip"
                if archive.is_file():
                    result.append({"id": path.stem, "created": entry["created"], "path": str(archive)})
            except (OSError, ValueError, KeyError):
                pass
        return sorted(result, key=lambda item: item["created"], reverse=True)

    def status(self):
        with self.lock:
            fingerprint, _, data = self._fingerprint()
            snapshots, heads, incomplete = [], [], 0
            configured = bool(self.config.get("folder"))
            message = "Escolha uma pasta dedicada, transferida pelo Proton Drive ou por outro serviço. Nenhuma cópia é enviada automaticamente."
            if self.config_error:
                message = self.config_error
            if configured:
                try:
                    snapshots, heads, incomplete = self._scan(self._folder())
                    message = "Cópias são enviadas e recebidas somente pelos botões. O transporte da pasta é externo ao Trama."
                    if incomplete:
                        message += f" {incomplete} versão(ões) incompleta(s) ou inválida(s) foram ignoradas."
                except SyncError as exc:
                    message = str(exc)
            base = self.config.get("base")
            acknowledged = set(self.config.get("mergeParents", []))
            pending = len(acknowledged) > 1 and set(heads) == acknowledged
            return {"configured": configured, "folder": self.config.get("folder"), "device": self.config["device"], "deviceName": self.config["deviceName"], "base": base, "heads": heads,
                    "conflict": len(heads) > 1, "localChanges": fingerprint != self.config.get("baseFingerprint"), "pendingMerge": pending,
                    "snapshots": snapshots, "recovery": self._recoveries(), "transport": "folder", "incomplete": incomplete, "message": message}

    def _revision(self, expected):
        with self.store.connect() as db:
            self.store.check_revision(db, expected)

    def publish(self, payload):
        if not isinstance(payload, dict):
            raise SyncError("Informe a revisão atual.")
        with self.lock:
            self._revision(payload.get("revision"))
            folder = self._folder()
            state = self.status()
            heads, base = set(state["heads"]), self.config.get("base")
            acknowledged = set(self.config.get("mergeParents", []))
            allowed = (not heads and base is None) or heads == ({base} if base else set()) or bool(acknowledged) and heads == acknowledged
            if not allowed:
                raise SyncError("Há uma versão de outro computador ou um conflito. Receba explicitamente a versão desejada antes de enviar outra cópia; as alternativas serão preservadas.", 409, "sync_conflict", state)
            fingerprint, revision, data = self._fingerprint()
            if revision != payload["revision"]:
                self._revision(payload["revision"])
            pending_merge = len(heads) > 1 or bool(acknowledged - ({base} if base else set()))
            if base and fingerprint == self.config.get("baseFingerprint") and not pending_merge:
                return {"id": base, "unchanged": True, "status": state}
            archive = self.store.features.export_vault()
            # Recheck after exporting: do not label a copy with a different
            # graph revision or attachment set than the bytes it contains.
            after, after_revision, _ = self._fingerprint()
            if after != fingerprint or after_revision != revision:
                raise SyncError("As notas ou anexos mudaram durante a preparação. Salve e envie novamente.", 409, "sync_changed")
            ident = uuid.uuid4().hex
            pages, blocks = counts(data)
            metadata = {"format": FORMAT, "id": ident, "device": self.config["device"], "deviceName": self.config["deviceName"], "created": stamp(), "sha256": hashlib.sha256(archive).hexdigest(), "contentHash": fingerprint,
                        "parent": base, "parents": sorted(heads), "revision": revision, "pages": pages, "blocks": blocks}
            self._write_exclusive(folder / f"{ident}.zip", archive)
            # Publish the manifest last: an incomplete pair is never visible
            # as a restorable snapshot to the other machine.
            self._write_exclusive(folder / f"{ident}.json", json.dumps(metadata, ensure_ascii=False).encode("utf-8"))
            self.config.update(base=ident, baseFingerprint=fingerprint, mergeParents=[])
            self._save_config()
            return {"id": ident, "unchanged": False, "status": self.status()}

    def _preserve_local(self, fingerprint, revision):
        self.recovery_folder.mkdir(exist_ok=True)
        ident = uuid.uuid4().hex
        archive = self.store.features.export_vault()
        self._write_exclusive(self.recovery_folder / f"{ident}.zip", archive)
        self._write_exclusive(self.recovery_folder / f"{ident}.json", json.dumps({"id": ident, "created": stamp(), "revision": revision, "contentHash": fingerprint, "sha256": hashlib.sha256(archive).hexdigest(), "reason": "Antes de receber outra versão"}, ensure_ascii=False).encode("utf-8"))
        return str(self.recovery_folder / f"{ident}.zip")

    def receive(self, payload):
        if not isinstance(payload, dict):
            raise SyncError("Informe id e revision para receber uma versão.")
        with self.lock:
            self._revision(payload.get("revision"))
            folder = self._folder()
            metadata, archive = self._read_snapshot(folder, payload.get("id"), content=True)
            # Validate every member before creating a recovery or replacing any
            # state. The archive import validates again inside its own flow.
            self.store.features._unpack(archive)
            state = self.status()
            fingerprint, revision, _ = self._fingerprint()
            recovery = None
            if fingerprint != self.config.get("baseFingerprint"):
                recovery = self._preserve_local(fingerprint, revision)
            result = self.store.features.import_vault({"revision": payload["revision"], "data": base64.b64encode(archive).decode("ascii")})
            new_fingerprint, _, _ = self._fingerprint()
            # All currently observed heads are acknowledged only by this
            # explicit Receive operation. A subsequent publish can resolve the
            # fork with a new immutable commit; it does not merge note contents.
            self.config.update(base=metadata["id"], baseFingerprint=new_fingerprint, mergeParents=state["heads"])
            self._save_config()
            return {"revision": result["revision"], "id": metadata["id"], "backup": result["backup"], "recovery": recovery, "status": self.status()}
