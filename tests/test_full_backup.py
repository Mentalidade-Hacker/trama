import base64
import copy
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Store
from full_backup import FullBackup, FullBackupError, preferences


def graph(text="Uma nota"):
    return {"version": 1, "pages": [{"id": "page-a", "title": "Página", "created": "2026-10-31T12:00:00Z", "updated": "2026-10-31T12:00:00Z", "blocks": [{"id": "block-a", "text": text, "children": [], "collapsed": False}]}]}


def encoded(content):
    return base64.b64encode(content).decode("ascii")


def draft(text="Rascunho literal [[ação]] ((bloco)) 🙂"):
    return {"id": "draft-a", "key": "lesson-a", "tab": "writing", "language": "pt", "text": text,
            "lesson": {"id": "lesson-a", "kind": "writing", "language": "pt", "title": "Coesão", "prompt": "Escreva uma frase."}}


def changed_archive(raw, change, *, rehash=True):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        contents = {name: archive.read(name) for name in archive.namelist()}
    change(contents)
    if rehash:
        manifest = json.loads(contents["manifest.json"])
        manifest["files"] = [{"path": name, "size": len(content), "sha256": hashlib.sha256(content).hexdigest()} for name, content in contents.items() if name != "manifest.json"]
        contents["manifest.json"] = json.dumps(manifest).encode()
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in contents.items():
            archive.writestr(name, content)
    return out.getvalue()


class FullBackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.source = Store(self.root / "source")
        self.target = Store(self.root / "target")
        self.source.save(0, graph("Texto original"))
        self.source.save(1, graph("Nota com [[links]] e ((referência))"))
        self.upload(self.source, b"%PDF-1.7 attachment", "documento.pdf")
        self.source.drafts.save({"revision": 0, "epoch": self.source.drafts.read()["epoch"], "data": draft()})
        self.backup = self.target.full_backup
        self.prefs = {"theme": "dark", "textSize": 125, "proofLanguage": "pt-BR", "liveWriting": True,
                      "vocabularyHints": False, "acceptedWords": {"pt-BR": ["Trama"]}, "favorites": ["page-a"], "recent": ["page-a"]}
        self.raw = self.source.full_backup.export({"preferences": self.prefs})

    def upload(self, store, content=b"local", name="note.txt"):
        return store.features.upload({"name": name, "type": "application/pdf", "data": encoded(content)})

    def inspect(self, raw=None):
        return self.backup.inspect({"revision": self.target.revision(), "data": encoded(self.raw if raw is None else raw)})

    def restore(self, inspected=None, raw=None):
        raw = self.raw if raw is None else raw
        inspected = self.inspect(raw) if inspected is None else inspected
        return self.backup.restore({"revision": self.target.revision(), "data": encoded(raw), "inspection": inspected["inspection"], "preferencesBefore": {"theme": "light"}})

    def snapshot(self):
        return {"graph": self.target.read(), "drafts": self.target.drafts.read(), "attachments": self.target.features.list(),
                "files": {path.name: path.read_bytes() for path in self.target.features.folder.iterdir()},
                "config": self.target.sync.configuration(), "history": self.target.features.history()}

    def test_complete_round_trip_preserves_content_history_drafts_and_recovery(self):
        self.target.save(0, graph("Antes de restaurar"))
        previous_attachment = self.upload(self.target, b"old", "anexo antigo.txt")
        before = self.snapshot()
        result = self.restore()
        self.assertEqual(self.target.read()["data"], self.source.read()["data"])
        self.assertEqual(self.target.drafts.read()["records"], self.source.drafts.read()["records"])
        self.assertNotEqual(self.target.drafts.read()["epoch"], before["drafts"]["epoch"])
        self.assertEqual(result["preferences"], self.prefs)
        self.assertEqual(result["revision"], 4)
        self.assertEqual([item["revision"] for item in self.target.features.history()], [4, 3, 2])
        self.assertEqual(self.target.features.snapshot(3)["data"], graph("Texto original"))
        file = self.source.features.list()[0]
        self.assertEqual(self.target.features.list(), [file])
        self.assertEqual(self.target.features.file(file["id"])[1].read_bytes(), b"%PDF-1.7 attachment")
        self.assertTrue(all((self.target.features.folder / filename).is_file() for filename in before["files"]))
        recovery = self.backup._unpack(self.backup.recovery(result["recoveryId"]))
        self.assertEqual(recovery["graph"]["data"], graph("Antes de restaurar"))
        self.assertEqual(recovery["settings"]["preferences"], {"theme": "light"})
        self.assertEqual(recovery["attachments"][0]["id"], previous_attachment["id"])
        self.assertTrue(Path(result["recoveryPath"]).is_file())
        reopened = Store(self.target.directory)
        self.assertEqual(reopened.read(), self.target.read())
        self.assertEqual(reopened.drafts.read(), self.target.drafts.read())

    def test_restoration_disconnects_sync_and_keeps_only_local_device_identity(self):
        exchange = self.root / "exchange"
        exchange.mkdir()
        self.target.sync.configure({"folder": str(exchange), "automatic": True, "transport": "proton", "remoteFolder": "/my-files/private", "cliPath": "C:/private/proton.exe", "deviceName": "Meu computador"})
        local = self.target.sync.configuration()
        self.restore()
        actual = self.target.sync.configuration()
        self.assertEqual((actual["device"], actual["deviceName"]), (local["device"], local["deviceName"]))
        for key in ("folder", "cliPath", "base", "baseFingerprint"):
            self.assertIsNone(actual[key])
        self.assertFalse(actual["automatic"])
        self.assertEqual(actual["remoteFolder"], "/my-files/Trama")
        self.assertEqual(Store(self.target.directory).sync.configuration(), actual)

    def test_export_has_explicit_file_and_preference_allowlists(self):
        self.source.sync.config.update(deviceName="PRIVATE-COMPUTER", folder="C:/private-location", cliPath="C:/secret-cli")
        for name in (".env", "credentials.json", "proton-token.json"):
            (self.source.directory / name).write_text("SECRET-CREDENTIAL")
        raw = self.source.full_backup.export({"preferences": {**self.prefs, "token": "SECRET-CREDENTIAL"}})
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            names = archive.namelist()
            all_content = b"".join(archive.read(name) for name in names)
        self.assertEqual(set(name for name in names if not name.startswith("attachments/")), {"manifest.json", "graph.json", "history.json", "attachments.json", "drafts.json", "settings.json"})
        for secret in (b"SECRET-CREDENTIAL", b"PRIVATE-COMPUTER", b"private-location", b"secret-cli", self.source.sync.config["device"].encode()):
            self.assertNotIn(secret, all_content)

    def test_inspection_is_read_only_and_returns_verifiable_summary(self):
        before = self.snapshot()
        result = self.inspect()
        self.assertEqual(self.snapshot(), before)
        self.assertFalse(self.backup.folder.exists())
        self.assertEqual(result["summary"]["pages"], 1)
        self.assertEqual(result["summary"]["blocks"], 1)
        self.assertEqual(result["summary"]["history"], 3)
        self.assertEqual(result["summary"]["drafts"], 1)
        self.assertEqual(result["inspection"]["sha256"], hashlib.sha256(self.raw).hexdigest())

    def test_graph_attachment_draft_and_configuration_changes_invalidate_preview(self):
        changes = [lambda: self.target.save(self.target.revision(), graph("Nova nota")),
                   lambda: self.upload(self.target),
                   lambda: self.target.drafts.save({"revision": 0, "epoch": self.target.drafts.read()["epoch"], "data": draft()}),
                   lambda: self.target.sync.config.update(deviceName="Nome alterado")]
        for change in changes:
            with self.subTest(change=change):
                inspected = self.inspect()
                change()
                before = self.snapshot()
                with self.assertRaises(FullBackupError) as raised:
                    self.restore(inspected)
                self.assertEqual(raised.exception.code, "backup_stale")
                self.assertEqual(self.snapshot(), before)
                self.assertFalse(self.backup.folder.exists())

    def test_missing_preview_stale_revision_and_changed_archive_never_write(self):
        for payload in ({"revision": 0, "data": encoded(self.raw)},
                        {"revision": True, "data": encoded(self.raw), "inspection": self.inspect()["inspection"]}):
            with self.assertRaises(FullBackupError):
                self.backup.restore(payload)
        other = changed_archive(self.raw, lambda content: content.update({"settings.json": json.dumps({"preferences": {}, "sync": {"automatic": False, "transport": "folder"}}).encode()}))
        with self.assertRaises(FullBackupError) as raised:
            self.restore(self.inspect(), other)
        self.assertEqual(raised.exception.status, 409)
        self.assertEqual(self.target.revision(), 0)
        self.assertFalse(self.backup.folder.exists())

    def test_rejects_corrupt_hash_paths_unknown_files_duplicate_entries_and_symlinks(self):
        variants = [b"not a zip", changed_archive(self.raw, lambda content: content.update({"graph.json": b"{}"}), rehash=False)]
        for name in ("../outside", "/absolute", "attachments/../../x", "credentials.json"):
            variants.append(changed_archive(self.raw, lambda content, name=name: content.update({name: b"bad"})))
        duplicate = io.BytesIO(self.raw)
        with zipfile.ZipFile(duplicate, "a") as archive:
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                archive.writestr("graph.json", "{}")
        variants.append(duplicate.getvalue())
        symbolic = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(self.raw)) as source, zipfile.ZipFile(symbolic, "w") as target:
            for entry in source.infolist():
                if entry.filename == "graph.json":
                    entry.create_system = 3
                    entry.external_attr = (stat.S_IFLNK | 0o777) << 16
                target.writestr(entry, source.read(entry.filename))
        variants.append(symbolic.getvalue())
        before = self.snapshot()
        for raw in variants:
            with self.subTest(length=len(raw)), self.assertRaises(FullBackupError):
                self.inspect(raw)
            self.assertEqual(self.snapshot(), before)

    def test_rejects_invalid_history_drafts_preferences_and_attachment_metadata(self):
        mutations = [
            ("history.json", []),
            ("history.json", [{"revision": 2, "created": "2026-10-31", "data": graph("Different latest")}]),
            ("drafts.json", [{"id": "x", "data": {}}]),
            ("settings.json", {"preferences": {"token": "not allowed"}, "sync": {"automatic": False, "transport": "folder"}}),
            ("settings.json", {"preferences": {}, "sync": {"automatic": True, "transport": "folder"}}),
            ("attachments.json", []),
            ("graph.json", {"revision": True, "data": graph()}),
        ]
        for name, value in mutations:
            raw = changed_archive(self.raw, lambda content: content.update({name: json.dumps(value).encode()}))
            with self.subTest(name=name), self.assertRaises(FullBackupError):
                self.inspect(raw)
        self.assertEqual(self.target.revision(), 0)

    def test_rollback_restores_database_config_drafts_and_keeps_original_files(self):
        self.target.save(0, graph("Anterior"))
        self.upload(self.target, b"old")
        self.target.drafts.save({"revision": 0, "epoch": self.target.drafts.read()["epoch"], "data": draft("Rascunho anterior")})
        self.target.sync._save_config()
        config = self.target.sync.config_path.read_bytes()
        before = self.snapshot()
        apply = self.backup._apply_restore
        def fail(*args):
            apply(*args)
            raise sqlite3.OperationalError("simulated disk failure")
        with patch.object(self.backup, "_apply_restore", side_effect=fail), self.assertRaises(sqlite3.OperationalError):
            self.restore()
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.target.sync.config_path.read_bytes(), config)
        self.assertFalse(self.backup.journal.exists())
        self.assertEqual(len(list(self.backup.folder.glob("*.zip"))), 1)
        self.assertEqual(Store(self.target.directory).read(), before["graph"])

    def test_config_write_failure_never_commits_restore(self):
        self.target.sync._save_config()
        before = self.snapshot()
        config = self.target.sync.config_path.read_bytes()
        with patch.object(self.target.sync, "_save_config", side_effect=OSError("disk full")), self.assertRaises(OSError):
            self.restore()
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.target.sync.config_path.read_bytes(), config)
        self.assertFalse(self.backup.journal.exists())

    def test_restore_recovers_no_config_file_on_rollback(self):
        before = self.snapshot()
        self.assertFalse(self.target.sync.config_path.exists())
        with patch.object(self.backup, "_apply_restore", side_effect=RuntimeError("failure")), self.assertRaises(RuntimeError):
            self.restore()
        self.assertEqual(self.snapshot(), before)
        self.assertFalse(self.target.sync.config_path.exists())

    def interrupted_restore(self, committed):
        self.target.sync._save_config()
        old = self.target.sync.configuration()
        token = uuid.uuid4().hex
        target = {**old, "automatic": False, "folder": None, "cliPath": None, "deviceName": "Após restauração"}
        (self.target.directory / f".full-backup-old-config-{token}.json").write_bytes(self.target.sync.config_path.read_bytes())
        self.target.sync._save_config(target)
        self.backup.journal.write_text(json.dumps({"token": token, "oldConfig": old, "targetConfig": target, "oldConfigExisted": True, "oldConfigError": None}))
        if committed:
            with self.target.connect() as db:
                db.execute("INSERT OR REPLACE INTO full_backup_restore_state VALUES(1,?)", (token,))
        return old, target

    def test_startup_recovers_interruption_before_database_commit(self):
        old, _ = self.interrupted_restore(False)
        reopened = Store(self.target.directory)
        self.assertEqual(reopened.sync.configuration(), old)
        self.assertEqual(json.loads(reopened.sync.config_path.read_bytes()), old)
        self.assertFalse(reopened.full_backup.journal.exists())

    def test_startup_finishes_interruption_after_database_commit(self):
        _, target = self.interrupted_restore(True)
        reopened = Store(self.target.directory)
        self.assertEqual(reopened.sync.configuration(), target)
        self.assertFalse(reopened.full_backup.journal.exists())

    def test_failed_journal_cleanup_is_retryable_and_never_deletes_committed_attachments(self):
        original_unlink = Path.unlink
        def fail_journal(path, *args, **kwargs):
            if path == self.backup.journal:
                raise PermissionError("simulated cleanup denial")
            return original_unlink(path, *args, **kwargs)
        with patch.object(Path, "unlink", fail_journal), self.assertRaises(PermissionError):
            self.restore()
        self.assertEqual(self.target.read()["data"], self.source.read()["data"])
        ident = self.source.features.list()[0]["id"]
        self.assertEqual(self.target.features.file(ident)[1].read_bytes(), b"%PDF-1.7 attachment")
        reopened = Store(self.target.directory)
        self.assertEqual(reopened.features.file(ident)[1].read_bytes(), b"%PDF-1.7 attachment")
        self.assertFalse(reopened.full_backup.journal.exists())

    def test_size_limits_and_missing_local_attachment_fail_without_partial_export(self):
        with patch("full_backup.MAX_FULL_BACKUP_BYTES", 10), self.assertRaises(FullBackupError):
            self.source.full_backup.export()
        with patch("full_backup.MAX_FULL_BACKUP_BYTES", 10), self.assertRaises(FullBackupError):
            self.inspect()
        ident = self.source.features.list()[0]["id"]
        self.source.features.file(ident)[1].unlink()
        with self.assertRaises(FullBackupError):
            self.source.full_backup.export()
        self.assertEqual(self.target.revision(), 0)

    def test_recovery_id_rejects_traversal_and_preference_types_are_strict(self):
        for ident in ("../trama.db", "..", "f" * 32, "C:/private", None):
            with self.assertRaises(FullBackupError):
                self.backup.recovery(ident)
        for value in ({"textSize": True}, {"liveWriting": "true"}, {"acceptedWords": {"unknown": []}}, {"recent": ["../x"]}, {"theme": "invented"}):
            with self.assertRaises(FullBackupError):
                preferences(value)
        self.assertEqual(preferences({"token": "secret", "theme": "dark"}), {"theme": "dark"})


if __name__ == "__main__":
    unittest.main()
