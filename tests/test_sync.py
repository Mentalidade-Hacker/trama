import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Store, Conflict, default_data_directory
from sync_store import SyncError


def graph(text):
    return {"version": 1, "pages": [{"id": "shared-page", "title": "Sincronização", "created": "2026-10-31T12:00:00Z", "updated": "2026-10-31T12:00:00Z", "blocks": [{"id": "shared-block", "text": text, "children": [], "collapsed": False}]}]}


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.folder = self.root / "transport"
        self.folder.mkdir()
        self.a = Store(self.root / "computer-a")
        self.b = Store(self.root / "computer-b")
        self.a.sync.configure({"folder": str(self.folder)})
        self.b.sync.configure({"folder": str(self.folder)})

    def save(self, store, text):
        return store.save(store.read()["revision"], graph(text))

    def publish(self, store):
        return store.sync.publish({"revision": store.read()["revision"]})

    def receive(self, store, ident):
        return store.sync.receive({"revision": store.read()["revision"], "id": ident})

    def test_two_computers_publish_receive_and_restart(self):
        self.save(self.a, "first")
        sent = self.publish(self.a)
        self.assertFalse(sent["unchanged"])
        received = self.receive(self.b, sent["id"])
        self.assertEqual(self.b.read()["data"], graph("first"))
        self.assertTrue(Path(received["backup"]).is_file())
        self.assertEqual(self.publish(self.b)["id"], sent["id"])
        self.assertTrue(self.publish(self.b)["unchanged"])
        self.save(self.b, "second")
        second = self.publish(self.b)
        self.receive(self.a, second["id"])
        self.assertEqual(self.a.read()["data"], graph("second"))
        reopened = Store(self.a.directory)
        self.assertEqual(reopened.sync.status()["base"], second["id"])
        self.assertFalse(reopened.sync.status()["localChanges"])

    def test_unsent_edits_are_preserved_before_receive(self):
        self.save(self.a, "remote")
        sent = self.publish(self.a)
        self.save(self.b, "local unsent")
        with self.assertRaises(SyncError) as caught:
            self.publish(self.b)
        self.assertEqual(caught.exception.code, "sync_conflict")
        received = self.receive(self.b, sent["id"])
        recovery = Path(received["recovery"])
        self.assertTrue(recovery.is_file())
        recovered, _, _ = self.b.features._unpack(recovery.read_bytes())
        self.assertEqual(recovered, graph("local unsent"))
        self.assertEqual(self.b.read()["data"], graph("remote"))

    def test_conflicting_edits_block_publish_without_losing_local_data(self):
        self.save(self.a, "base")
        base = self.publish(self.a)["id"]
        self.receive(self.b, base)
        self.save(self.a, "remote edit")
        remote = self.publish(self.a)["id"]
        self.save(self.b, "local edit")
        with self.assertRaises(SyncError):
            self.publish(self.b)
        self.assertEqual(self.b.read()["data"], graph("local edit"))
        result = self.receive(self.b, remote)
        self.assertIsNotNone(result["recovery"])
        self.save(self.b, "explicit later edit")
        self.publish(self.b)
        self.assertEqual(len(self.b.sync.status()["heads"]), 1)

    def test_concurrent_fork_explicit_receive_then_publish_resolves_heads(self):
        self.save(self.a, "base")
        base = self.publish(self.a)["id"]
        self.receive(self.b, base)
        stale_view = self.b.sync.status()
        self.save(self.a, "branch A")
        branch_a = self.publish(self.a)["id"]
        self.save(self.b, "branch B")
        # Simulate both machines seeing the previous remote head before their
        # external folder transport has delivered the other's publication.
        with patch.object(self.b.sync, "status", return_value=stale_view):
            branch_b = self.publish(self.b)["id"]
        self.assertEqual(set(self.a.sync.status()["heads"]), {branch_a, branch_b})
        chosen = self.receive(self.b, branch_a)
        self.assertTrue(chosen["status"]["pendingMerge"])
        resolution = self.publish(self.b)
        self.assertEqual(resolution["status"]["heads"], [resolution["id"]])
        self.assertEqual(self.b.read()["data"], graph("branch A"))
        for ident in (base, branch_a, branch_b, resolution["id"]):
            self.assertTrue((self.folder / f"{ident}.zip").is_file())
        metadata = json.loads((self.folder / f"{resolution['id']}.json").read_text())
        self.assertEqual(set(metadata["parents"]), {branch_a, branch_b})

    def test_incomplete_snapshot_ignored_and_bad_hash_receive_rejected(self):
        self.save(self.a, "original")
        sent = self.publish(self.a)["id"]
        archive = self.folder / f"{sent}.zip"
        archive.write_bytes(archive.read_bytes()[:20])
        self.assertEqual(self.b.sync.status()["snapshots"], [])
        self.assertEqual(self.b.sync.status()["incomplete"], 1)
        with self.assertRaises(SyncError) as caught:
            self.receive(self.b, sent)
        self.assertEqual(caught.exception.code, "sync_hash_mismatch")
        self.assertEqual(self.b.read()["revision"], 0)

    def test_stale_revision_or_invalid_id_never_overwrites_notes(self):
        self.save(self.a, "one")
        with self.assertRaises(Conflict):
            self.a.sync.publish({"revision": 0})
        with self.assertRaises(SyncError):
            self.receive(self.a, "../../outside")
        self.assertEqual(self.a.read()["data"], graph("one"))

    def test_config_requires_separate_existing_directory_and_does_not_publish(self):
        with self.assertRaises(SyncError):
            self.a.sync.configure({"folder": str(self.a.directory)})
        with self.assertRaises(SyncError):
            self.a.sync.configure({"folder": str(self.root / "absent")})
        self.assertEqual(list(self.folder.iterdir()), [])
        self.assertTrue(self.a.sync.status()["configured"])

    def test_live_database_is_never_copied_to_transport(self):
        self.save(self.a, "safe")
        self.publish(self.a)
        self.assertEqual({path.suffix for path in self.folder.iterdir()}, {".zip", ".json"})
        self.assertFalse(any(path.name.endswith((".db", "-wal", "-shm")) for path in self.folder.iterdir()))

    def test_corrupt_sync_config_does_not_block_local_notes(self):
        self.save(self.a, "keep local notes")
        self.a.sync.config_path.write_text("{broken", encoding="utf-8")
        reopened = Store(self.a.directory)
        self.assertEqual(reopened.read()["data"], graph("keep local notes"))
        self.assertFalse(reopened.sync.status()["configured"])
        self.assertIn("inválida", reopened.sync.status()["message"])
        self.assertEqual(reopened.sync.config_path.read_text(), "{broken")


class DefaultDirectoryTests(unittest.TestCase):
    def test_explicit_xdg_wins(self):
        with patch.dict("server.os.environ", {"XDG_DATA_HOME": "/chosen/data"}):
            self.assertEqual(default_data_directory(), Path("/chosen/data") / "trama")

    @unittest.skipUnless(sys.platform == "win32", "Windows-specific location")
    def test_windows_prefers_legacy_database_when_present(self):
        with patch.dict("server.os.environ", {"LOCALAPPDATA": "C:/Local"}, clear=True), patch("server.Path.home", return_value=Path("C:/Person")), patch("server.Path.is_file", return_value=True):
            self.assertEqual(default_data_directory(), Path("C:/Person/.local/share/trama"))
        with patch.dict("server.os.environ", {"LOCALAPPDATA": "C:/Local"}, clear=True), patch("server.Path.home", return_value=Path("C:/Person")), patch("server.Path.is_file", return_value=False):
            self.assertEqual(default_data_directory(), Path("C:/Local/Trama/data"))


if __name__ == "__main__":
    unittest.main()
