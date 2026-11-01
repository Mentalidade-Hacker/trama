import base64
import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Store, Conflict, validate
from storage_features import MAX_ATTACHMENT, MAX_VAULT_BYTES, safe_type


def graph(text="Uma nota"):
    return {"version": 1, "pages": [{"id": "page-a", "title": "Página", "created": "2026-10-31T12:00:00Z", "updated": "2026-10-31T12:00:00Z", "blocks": [{"id": "block-a", "text": text, "children": [], "collapsed": False}]}]}


def encoded(content):
    return base64.b64encode(content).decode("ascii")


class StorageFeaturesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(Path(self.temp.name) / "original")
        self.features = self.store.features

    def upload(self, content=b"data", name="note.txt", kind="text/plain"):
        return self.features.upload({"name": name, "type": kind, "data": encoded(content)})

    def test_attachments_preserve_bytes_and_sanitize_names_mime(self):
        uploaded = self.upload(b"<script>alert(1)</script>", "../../evil.html", "image/png")
        self.assertEqual(uploaded["name"], "evil.html")
        self.assertEqual(uploaded["type"], "application/octet-stream")
        metadata, path = self.features.file(uploaded["id"])
        self.assertEqual(path.read_bytes(), b"<script>alert(1)</script>")
        self.assertEqual(metadata, uploaded)
        self.assertEqual(self.features.list(), [uploaded])
        for ident in ("../trama.db", "/absolute", uploaded["id"] + "/../trama.db", "x" * 32):
            with self.assertRaises(FileNotFoundError):
                self.features.file(ident)

    def test_safe_signatures_and_upload_limits(self):
        self.assertEqual(safe_type(b"\x89PNG\r\n\x1a\nrest", "text/html"), "image/png")
        self.assertEqual(safe_type(b"<svg></svg>", "image/svg+xml"), "application/octet-stream")
        self.assertEqual(safe_type(b"%PDF-1.7", "text/html"), "application/pdf")
        self.assertEqual(safe_type(b"\x1aE\xdf\xa3media", "audio/webm;codecs=opus"), "audio/webm")
        with self.assertRaises(ValueError):
            self.features.upload({"name": "x", "data": "invalid base64!", "type": "text/plain"})
        with patch("storage_features.MAX_ATTACHMENT", 3):
            with self.assertRaises(ValueError):
                self.upload(b"four")
        self.assertEqual(self.features.list(), [])

    def test_exclusive_attachment_collision_preserves_existing_bytes(self):
        ident = uuid.uuid4()
        path = self.features.folder / ident.hex
        original = b"Original immutable attachment, never delete on collision."
        path.write_bytes(original)
        before = self.store.read()
        with patch("storage_features.uuid.uuid4", return_value=ident):
            with self.assertRaises(FileExistsError):
                self.features._write(b"replacement")
        self.assertEqual(path.read_bytes(), original)
        self.assertEqual(list(self.features.folder.iterdir()), [path])
        self.assertEqual(self.features.list(), [])
        self.assertEqual(self.store.read(), before)

    def test_history_survives_restart_and_conflict_does_not_add_revision(self):
        self.store.save(0, graph("first"))
        self.store.save(1, graph("second"))
        with self.assertRaises(Conflict):
            self.store.save(1, graph("stale"))
        reopened = Store(self.store.directory)
        self.assertEqual([r["revision"] for r in reopened.features.history()], [2, 1, 0])
        self.assertEqual(reopened.features.snapshot(1)["data"], graph("first"))
        self.assertEqual(reopened.features.history()[0]["blocks"], 1)

    def test_history_keeps_last_100(self):
        for revision in range(103):
            self.store.save(revision, graph(str(revision)))
        history = self.features.history()
        self.assertEqual(len(history), 100)
        self.assertEqual((history[0]["revision"], history[-1]["revision"]), (103, 4))
        with self.assertRaises(FileNotFoundError):
            self.features.snapshot(3)

    def test_metadata_validated_and_preserved(self):
        data = graph()
        data["pages"][0]["blocks"][0].update(heading=2, alignment="center", view="numbered")
        self.store.save(0, data)
        self.assertEqual(self.store.read()["data"], data)
        for field, value in (("heading", True), ("heading", 4), ("alignment", "justify"), ("view", "script")):
            invalid = graph()
            invalid["pages"][0]["blocks"][0][field] = value
            with self.assertRaises(ValueError):
                self.store.save(1, invalid)
        self.assertEqual(self.store.read()["revision"], 1)

    def test_vault_round_trip_restores_graph_and_attachment_ids(self):
        uploaded = self.upload(b"\x89PNG\r\n\x1a\nsample", "imagem.png", "image/png")
        data = graph(f"![imagem]({uploaded['url']})")
        self.store.save(0, data)
        archive = self.features.export_vault()
        target = Store(Path(self.temp.name) / "target")
        result = target.features.import_vault({"revision": 0, "data": encoded(archive)})
        self.assertEqual(result["revision"], 1)
        self.assertTrue(Path(result["backup"]).is_file())
        self.assertEqual(target.read()["data"], data)
        self.assertEqual(target.features.list()[0]["id"], uploaded["id"])
        self.assertEqual(target.features.file(uploaded["id"])[1].read_bytes(), b"\x89PNG\r\n\x1a\nsample")

    def test_vault_import_conflict_and_bad_archive_leave_existing_state(self):
        self.store.save(0, graph("existing"))
        source = Store(Path(self.temp.name) / "source")
        source.save(0, graph("imported"))
        source.features.upload({"name": "new.txt", "type": "text/plain", "data": encoded(b"new")})
        archive = source.features.export_vault()
        with self.assertRaises(Conflict):
            self.features.import_vault({"revision": 0, "data": encoded(archive)})
        self.assertEqual(self.store.read()["data"], graph("existing"))
        self.assertEqual(self.features.list(), [])
        self.assertEqual(list(self.features.folder.iterdir()), [])
        with self.assertRaises(ValueError):
            self.features.import_vault({"revision": 1, "data": encoded(b"not a zip")})
        self.assertEqual(self.store.read()["revision"], 1)

    def test_vault_rejects_traversal_duplicates_hash_tampering_and_bombs(self):
        self.upload(b"hello")
        original = self.features.export_vault()
        def modified(extra_name=None, tamper=False):
            result = io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(original)) as source, zipfile.ZipFile(result, "w") as target:
                for item in source.infolist():
                    content = source.read(item.filename)
                    if tamper and item.filename.startswith("attachments/"):
                        content = b"xxxxx"
                    target.writestr(item.filename, content)
                if extra_name:
                    target.writestr(extra_name, b"bad")
            return result.getvalue()
        for content in (modified("../outside"), modified("unexpected.txt"), modified(tamper=True)):
            with self.assertRaises(ValueError):
                self.features.import_vault({"revision": 0, "data": encoded(content)})
        with patch("storage_features.MAX_VAULT_BYTES", 1):
            with self.assertRaises(ValueError):
                self.features.import_vault({"revision": 0, "data": encoded(original)})
        self.assertEqual(self.store.read()["revision"], 0)

    def test_import_rolls_back_files_metadata_and_graph_on_commit_failure(self):
        source = Store(Path(self.temp.name) / "source")
        source.features.upload({"name": "new.txt", "type": "text/plain", "data": encoded(b"new")})
        source.save(0, graph("imported"))
        archive = source.features.export_vault()
        with patch.object(self.store, "write_in_transaction", side_effect=sqlite3.OperationalError("disk full")):
            with self.assertRaises(sqlite3.OperationalError):
                self.features.import_vault({"revision": 0, "data": encoded(archive)})
        self.assertEqual(self.store.read()["revision"], 0)
        self.assertEqual(self.features.list(), [])
        self.assertEqual(list(self.features.folder.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
