"""Immutable vault snapshots in a separately synchronized folder.

This module never synchronizes a live SQLite database, contacts a cloud account,
deletes remote versions, or silently merges two independently edited graphs.
"""
from __future__ import annotations

import base64
import copy
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
        self.worker = None
        self._snapshot_cache = {}
        self._snapshot_errors = {}
        self._scan_issues = []
        self._status_cache = None
        self.config = {"folder": None, "device": uuid.uuid4().hex, "deviceName": socket.gethostname(), "base": None, "baseFingerprint": None, "mergeParents": [],
                       "automatic": False, "transport": "folder", "remoteFolder": "/my-files/Trama", "cliPath": None}
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
                options = self._options(config, self.config)
                if config.get("baseFingerprint") is not None and not re.fullmatch(r"[a-f0-9]{64}", str(config["baseFingerprint"])):
                    raise ValueError("Invalid config")
                self.config.update(config)
                self.config.update(options)
            except (OSError, ValueError, SyncError):
                # A transport configuration error must never prevent the user
                # from opening their local notes. Keep the file untouched until
                # they explicitly configure another connection.
                self.config_error = "A configuração de sincronização está inválida. As notas locais continuam disponíveis; confira sync-config.json e configure a pasta novamente."

    @staticmethod
    def _options(payload, defaults):
        automatic = payload.get("automatic", defaults.get("automatic", False))
        transport = payload.get("transport", defaults.get("transport", "folder"))
        remote = payload.get("remoteFolder", defaults.get("remoteFolder", "/my-files/Trama"))
        cli = payload.get("cliPath", defaults.get("cliPath"))
        if type(automatic) is not bool or transport not in ("folder", "proton"):
            raise SyncError("Escolha sincronização manual/automática e um transporte válido.")
        if not isinstance(remote, str) or len(remote) > 1024 or not remote.startswith("/my-files/"):
            raise SyncError("Use uma pasta remota dedicada, como /my-files/Trama.")
        remote = remote.rstrip("/")
        if remote == "/my-files" or any(part in ("", ".", "..") for part in remote.split("/")[1:]) or "\\" in remote or any(ord(char) < 32 for char in remote):
            raise SyncError("Caminho remoto inválido.")
        if cli is not None and (not isinstance(cli, str) or len(cli) > 4096 or any(ord(char) < 32 for char in cli)):
            raise SyncError("Caminho do programa Proton Drive inválido.")
        return {"automatic": automatic, "transport": transport, "remoteFolder": remote, "cliPath": cli.strip() or None if isinstance(cli, str) else None}

    def configuration(self):
        with self.lock:
            return dict(self.config)

    def _wake(self):
        if self.worker is not None:
            self.worker.wake()

    def _save_config(self):
        temporary = self.store.directory / f".sync-config-{uuid.uuid4().hex}.tmp"
        try:
            self._write_exclusive(temporary, json.dumps(self.config, ensure_ascii=False).encode("utf-8"))
            os.replace(temporary, self.config_path)
        finally:
            temporary.unlink(missing_ok=True)

    @staticmethod
    def _write_exclusive(path, content):
        created = False
        try:
            with path.open("xb") as target:
                created = True
                target.write(content)
                target.flush()
                os.fsync(target.fileno())
            if os.name != "nt":
                path.chmod(0o600)
        except Exception:
            if created:
                path.unlink(missing_ok=True)
            raise

    def _folder(self):
        value = self.config.get("folder")
        if not value:
            raise SyncError("Escolha primeiro uma pasta existente para trocar cópias do grafo.", 400, "sync_not_configured")
        folder = Path(value)
        if not folder.is_dir():
            raise SyncError("A pasta sincronizada está indisponível. Monte ou sincronize a pasta e tente novamente.", 503, "sync_folder_unavailable")
        return folder

    def configure(self, payload):
        if not isinstance(payload, dict) or not isinstance(payload.get("folder"), str):
            raise SyncError("Informe o caminho de uma pasta existente.")
        with self.lock:
            options = self._options(payload, self.config)
        if not payload["folder"].strip() and options["transport"] == "proton":
            folder = self.store.directory / "sync-exchange"
            folder.mkdir(exist_ok=True)
            folder = folder.resolve()
        elif not payload["folder"].strip():
            raise SyncError("Informe o caminho de uma pasta existente.")
        else:
            folder = Path(payload["folder"]).expanduser().resolve()
        if not folder.is_dir():
            raise SyncError("A pasta precisa existir antes de ser configurada.")
        # Never make the live DB or its parents the transport directory.
        if self.store.directory.is_relative_to(folder) or any(folder == self.store.directory / name for name in ("attachments", "backups", "sync-recovery", "app")):
            raise SyncError("Use uma pasta separada, dedicada às cópias ZIP. Não sincronize a pasta do banco SQLite em uso.")
        with self.lock:
            options = self._options(payload, self.config)
            changed_destination = any(options[key] != self.config.get(key) for key in ("transport", "remoteFolder"))
            if changed_destination and str(folder) == self.config.get("folder") and any(folder.iterdir()):
                raise SyncError("Para mudar o transporte ou a pasta remota, escolha outra pasta local vazia. As cópias da conexão anterior devem permanecer separadas e não serão apagadas.", 409, "sync_connection_change")
            changed_connection = str(folder) != self.config.get("folder") or changed_destination
            if changed_connection:
                self.config.update(folder=str(folder), base=None, baseFingerprint=None, mergeParents=[])
                self._snapshot_cache.clear()
                self._snapshot_errors.clear()
            self.config.update(options)
            self._save_config()
            self.config_error = None
            self._status_cache = None
        self._wake()
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
        def signature():
            return tuple((stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)
                         for stat in (metadata_path.stat(), archive_path.stat()))
        before = signature()
        cache_key = (str(folder), ident)
        cached = self._snapshot_cache.get(cache_key)
        if not content and cached and cached[0] == before:
            return copy.deepcopy(cached[1])
        failed = self._snapshot_errors.get(cache_key)
        if not content and failed and failed[0] == before:
            raise SyncError(failed[1], 409, "sync_hash_mismatch")
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
            message = "O arquivo da versão está incompleto ou seu hash não confere. Confira a transferência; nenhuma nota foi substituída."
            if before == signature():
                self._snapshot_errors[cache_key] = (before, message)
            raise SyncError(message, 409, "sync_hash_mismatch")
        if before != signature():
            raise SyncError("A versão ainda está sendo transferida. Aguarde a conclusão.", 409, "sync_incomplete")
        self._snapshot_cache[cache_key] = (before, copy.deepcopy(metadata))
        self._snapshot_errors.pop(cache_key, None)
        return (metadata, bytes(received)) if content else metadata

    def _scan(self, folder):
        snapshots, incomplete = [], 0
        issues = []
        manifests = set()
        for path in folder.glob("*.json"):
            if not ID.fullmatch(path.stem):
                continue
            manifests.add(path.stem)
            try:
                snapshots.append(self._read_snapshot(folder, path.stem))
            except (SyncError, OSError) as error:
                incomplete += 1
                if len(issues) < 20:
                    code = getattr(error, "code", "sync_io_error")
                    filename = f"{path.stem}.zip" if code in ("sync_hash_mismatch", "sync_incomplete") else path.name
                    issues.append({"id": path.stem, "file": filename, "code": code, "message": str(error)})
        # ZIP arrives before JSON, including transfers by external folder clients.
        for path in folder.glob("*.zip"):
            if ID.fullmatch(path.stem) and path.stem not in manifests:
                incomplete += 1
                if len(issues) < 20:
                    issues.append({"id": path.stem, "file": path.name, "code": "sync_missing_manifest", "message": "Falta o manifesto JSON desta cópia."})
        self._scan_issues = issues
        for key in list(self._snapshot_cache):
            if key[0] == str(folder) and key[1] not in manifests:
                del self._snapshot_cache[key]
        for key in list(self._snapshot_errors):
            if key[0] == str(folder) and key[1] not in manifests:
                del self._snapshot_errors[key]
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

    def _decorate(self, state):
        result = copy.deepcopy(state)
        result.update({key: self.config.get(key) for key in ("folder", "automatic", "transport", "remoteFolder", "cliPath")})
        result["configured"] = bool(self.config.get("folder"))
        result["defaultFolder"] = str(self.store.directory / "sync-exchange")
        result["auto"] = self.worker.status() if self.worker is not None else {
            "state": "disabled", "message": "Sincronização automática desativada.", "busy": False,
            "lastSuccess": None, "lastAttempt": None, "clientsBusy": 0}
        return result

    def _empty_status(self):
        return {"configured": bool(self.config.get("folder")), "device": self.config["device"], "deviceName": self.config["deviceName"],
                "base": self.config.get("base"), "heads": [], "conflict": False, "localChanges": True, "pendingMerge": False,
                "snapshots": [], "recovery": [], "incomplete": 0, "incompleteFiles": [],
                "message": self.config_error or "Aguardando a primeira verificação da pasta."}

    def status(self, refresh=False):
        # Polling the UI must never wait for network, a large ZIP hash, or export.
        # The worker refreshes this cache; explicit manual operations request fresh state.
        if not refresh and self.worker is not None and self.config.get("automatic"):
            return self._decorate(self._status_cache or self._empty_status())
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
            self._status_cache = {"configured": configured, "folder": self.config.get("folder"), "device": self.config["device"], "deviceName": self.config["deviceName"], "base": base, "heads": heads,
                    "conflict": len(heads) > 1, "localChanges": fingerprint != self.config.get("baseFingerprint"), "pendingMerge": pending,
                    "snapshots": snapshots, "recovery": self._recoveries(), "transport": "folder", "incomplete": incomplete,
                    "incompleteFiles": list(self._scan_issues) if incomplete else [], "message": message}
            if self.config.get("automatic"):
                self._status_cache["message"] = "Sincronização automática ativa. Alterações concorrentes são preservadas para escolha."
            if incomplete:
                self._status_cache["message"] += " " + self._incomplete_message(self._status_cache)
            return self._decorate(self._status_cache)

    def _revision(self, expected):
        with self.store.connect() as db:
            self.store.check_revision(db, expected)

    def publish(self, payload):
        if not isinstance(payload, dict):
            raise SyncError("Informe a revisão atual.")
        with self.lock:
            self._revision(payload.get("revision"))
            folder = self._folder()
            state = self.status(refresh=True)
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
            ident = self._publish_snapshot(folder, fingerprint, revision, data, sorted(heads))
            self._wake()
            return {"id": ident, "unchanged": False, "status": self.status(refresh=True)}

    def _publish_snapshot(self, folder, fingerprint, revision, data, parents):
        archive = self.store.features.export_vault()
        # Never label bytes from one revision with the fingerprint of another.
        after, after_revision, _ = self._fingerprint()
        if after != fingerprint or after_revision != revision:
            raise SyncError("As notas ou anexos mudaram durante a preparação. Salve e envie novamente.", 409, "sync_changed")
        ident = uuid.uuid4().hex
        pages, blocks = counts(data)
        metadata = {"format": FORMAT, "id": ident, "device": self.config["device"], "deviceName": self.config["deviceName"], "created": stamp(), "sha256": hashlib.sha256(archive).hexdigest(), "contentHash": fingerprint,
                    "parent": self.config.get("base"), "parents": sorted(set(parents)), "revision": revision, "pages": pages, "blocks": blocks}
        archive_path = folder / f"{ident}.zip"
        self._write_exclusive(archive_path, archive)
        try:
            # Manifest last: partial transfers can never become an accepted version.
            self._write_exclusive(folder / f"{ident}.json", json.dumps(metadata, ensure_ascii=False).encode("utf-8"))
        except Exception:
            # Only the new immutable ZIP created by this operation is removed.
            # A failed manifest must not strand our own worker behind an orphan.
            archive_path.unlink(missing_ok=True)
            raise
        self.config.update(base=ident, baseFingerprint=fingerprint, mergeParents=[])
        self._save_config()
        return ident

    def _preserve_local(self, fingerprint, revision):
        self.recovery_folder.mkdir(exist_ok=True)
        ident = uuid.uuid4().hex
        archive = self.store.features.export_vault()
        self._write_exclusive(self.recovery_folder / f"{ident}.zip", archive)
        self._write_exclusive(self.recovery_folder / f"{ident}.json", json.dumps({"id": ident, "created": stamp(), "revision": revision, "contentHash": fingerprint, "sha256": hashlib.sha256(archive).hexdigest(), "reason": "Antes de receber outra versão"}, ensure_ascii=False).encode("utf-8"))
        return str(self.recovery_folder / f"{ident}.zip")

    def receive(self, payload, *, automatic=False, guard=None):
        if not isinstance(payload, dict):
            raise SyncError("Informe id e revision para receber uma versão.")
        with self.lock:
            self._revision(payload.get("revision"))
            folder = self._folder()
            metadata, archive = self._read_snapshot(folder, payload.get("id"), content=True)
            # Validate every member before creating a recovery or replacing any
            # state. The archive import validates again inside its own flow.
            self.store.features._unpack(archive)
            state = self.status(refresh=True)
            fingerprint, revision, _ = self._fingerprint()
            recovery = None
            if fingerprint != self.config.get("baseFingerprint"):
                recovery = self._preserve_local(fingerprint, revision)
            if automatic and guard is not None and not guard():
                raise SyncError("Há uma edição em andamento. A versão recebida será aplicada depois.", 409, "sync_editing")
            result = self.store.features.import_vault({"revision": payload["revision"], "data": base64.b64encode(archive).decode("ascii")})
            new_fingerprint, new_revision, _ = self._fingerprint()
            # All currently observed heads are acknowledged only by this
            # explicit Receive operation. A subsequent publish can resolve the
            # fork with a new immutable commit; it does not merge note contents.
            self.config.update(base=metadata["id"], baseFingerprint=new_fingerprint if new_revision == result["revision"] else None,
                               mergeParents=[] if automatic else state["heads"])
            self._save_config()
            self._wake()
            return {"revision": result["revision"], "id": metadata["id"], "backup": result["backup"], "recovery": recovery, "status": self.status(refresh=True)}

    @staticmethod
    def _incomplete_message(state):
        names = ", ".join(item["file"] for item in state.get("incompleteFiles", [])[:3])
        return f"Há {state['incomplete']} cópia(s) incompleta(s) ou inválida(s){': ' + names if names else ''}. Confira a pasta e a transferência; se não concluir, separe os arquivos problemáticos antes de tentar novamente. Nenhuma nota foi substituída."

    @staticmethod
    def _descendant(ident, ancestor, snapshots):
        by_id = {item["id"]: item for item in snapshots}
        pending, visited = [ident], set()
        while pending:
            current = pending.pop()
            if current == ancestor:
                return True
            if current in visited:
                continue
            visited.add(current)
            pending.extend(by_id.get(current, {}).get("parents", []))
        return False

    def reconcile_auto(self, can_receive=lambda: True, can_publish=lambda fingerprint: True, active=lambda: True):
        """One local reconciliation. The caller performs network work separately.

        Saves/imports share this RLock. Concurrent histories become separate,
        immutable heads; only an explicit Receive can acknowledge those heads.
        """
        def outcome(state, message, **extra):
            return {"state": state, "message": message, **extra}

        with self.lock:
            if not self.config.get("automatic") or not active():
                return outcome("disabled", "Sincronização automática desativada.")
            folder = self._folder()
            state = self.status(refresh=True)
            fingerprint, revision, data = self._fingerprint()
            heads, base = set(state["heads"]), self.config.get("base")
            changed = fingerprint != self.config.get("baseFingerprint")
            acknowledged = set(self.config.get("mergeParents", []))
            snapshots = state["snapshots"]
            # A truly empty graph has no attachment metadata either. Demo pages
            # are user-visible content and are never silently treated as empty.
            with self.store.connect() as db:
                has_attachments = bool(db.execute("SELECT 1 FROM attachments LIMIT 1").fetchone())
            empty = not data.get("pages") and not has_attachments
            if state["incomplete"]:
                return outcome("waiting", self._incomplete_message(state))
            if snapshots and not heads:
                return outcome("conflict", "O histórico recebido não possui uma versão final válida. Confira as cópias antes de escolher.")
            if base is None:
                if heads:
                    if not empty:
                        return outcome("choice_required", "Este computador já contém notas. Escolha explicitamente qual versão receber; nada será substituído automaticamente.")
                    if len(heads) != 1:
                        return outcome("conflict", "Há versões diferentes na pasta. Escolha a versão desejada; todas foram preservadas.")
                    if not can_receive() or not active():
                        return outcome("waiting", "Aguardando o término da edição antes de receber notas.")
                    received = self.receive({"id": next(iter(heads)), "revision": revision}, automatic=True, guard=lambda: active() and can_receive())
                    return outcome("idle", "Notas recebidas automaticamente.", received=received["id"], revision=received["revision"])
                if empty:
                    return outcome("waiting", "Aguardando notas deste computador ou uma versão enviada pelo outro.")
                if not can_publish(fingerprint) or not active():
                    return outcome("waiting", "Aguardando as últimas alterações serem salvas.")
                ident = self._publish_snapshot(folder, fingerprint, revision, data, [])
                self.status(refresh=True)
                return outcome("idle", "Primeira cópia publicada automaticamente.", published=ident)
            if heads == {base} or acknowledged and heads == acknowledged:
                needs_merge_commit = bool(acknowledged - {base})
                if not changed and not needs_merge_commit:
                    return outcome("idle", "A pasta local está atualizada. O envio para a nuvem depende do transporte escolhido.")
                if not can_publish(fingerprint) or not active():
                    return outcome("waiting", "Aguardando as últimas alterações serem salvas.")
                ident = self._publish_snapshot(folder, fingerprint, revision, data, heads)
                self.status(refresh=True)
                return outcome("idle", "Alterações publicadas automaticamente.", published=ident)
            if len(heads) == 1 and not changed and self._descendant(next(iter(heads)), base, snapshots):
                if not can_receive() or not active():
                    return outcome("waiting", "Aguardando o término da edição antes de receber notas.")
                received = self.receive({"id": next(iter(heads)), "revision": revision}, automatic=True, guard=lambda: active() and can_receive())
                return outcome("idle", "Notas atualizadas a partir do outro computador.", received=received["id"], revision=received["revision"])
            if changed:
                if not can_publish(fingerprint) or not active():
                    return outcome("waiting", "Aguardando o salvamento antes de preservar as alterações concorrentes.")
                # Preserve this branch without claiming the remote head as a
                # parent. Upload may proceed, but no current-head pointer exists
                # to silently select a winner on either device.
                ident = self._publish_snapshot(folder, fingerprint, revision, data, [base])
                self.status(refresh=True)
                return outcome("conflict", "As alterações dos dois computadores foram preservadas em versões separadas. Escolha como continuar.", published=ident)
            return outcome("conflict", "Há históricos diferentes ou ancestrais ainda ausentes. As notas locais foram preservadas; escolha a versão desejada.")
