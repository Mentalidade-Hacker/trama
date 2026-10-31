from pathlib import Path
import base64
import json
import shutil
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Store
from auto_sync import AutoSync
from sync_store import SyncError


def graph(text):
    return {"version": 1, "pages": [{"id": "shared-page", "title": "Notas", "created": "2026-10-31T12:00:00Z", "updated": "2026-10-31T12:00:00Z",
            "blocks": [{"id": "shared-block", "text": text, "children": [], "collapsed": False}]}]}


class MemoryTransport:
    def __init__(self, remote, connection):
        self.remote, self.connection = remote, connection
        self.closed = False

    def transfer(self, source, destination):
        if self.closed or not self.connection["online"]:
            raise OSError("offline fixture")
        for path in sorted(Path(source).iterdir(), key=lambda item: item.suffix == ".json"):
            if path.suffix in (".zip", ".json") and not (Path(destination) / path.name).exists():
                shutil.copyfile(path, Path(destination) / path.name)

    def download(self, folder, config):
        self.transfer(self.remote, folder)

    def upload(self, folder, config):
        self.transfer(folder, self.remote)

    def close(self):
        self.closed = True


class AutoSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.folder = self.root / "exchange"
        self.folder.mkdir()
        self.a, self.b = Store(self.root / "a"), Store(self.root / "b")
        self.workers = []

    def configure(self, store, folder=None, **extra):
        return store.sync.configure({"folder": str(folder or self.folder), "automatic": True, **extra})

    def worker(self, store, factory=None, **extra):
        options = {"folder_interval": .04, "proton_interval": .06, "debounce": .025, "lease_seconds": .2, **extra}
        worker = AutoSync(store, factory, **options)
        self.workers.append(worker)
        self.addCleanup(worker.stop)
        return worker.start()

    def save(self, store, text):
        return store.save(store.read()["revision"], graph(text))

    def eventually(self, predicate, timeout=5):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(.015)
        self.fail("Timed out: " + repr([worker.status() for worker in self.workers]))

    def bootstrap(self):
        self.configure(self.a)
        self.configure(self.b)
        self.save(self.a, "base")
        wa, wb = self.worker(self.a), self.worker(self.b)
        self.eventually(lambda: self.b.read()["data"] == graph("base"))
        return wa, wb

    def test_two_live_instances_receive_descendants_in_both_directions(self):
        wa, wb = self.bootstrap()
        self.save(self.a, "from A")
        self.eventually(lambda: self.b.read()["data"] == graph("from A"))
        self.save(self.b, "from B")
        self.eventually(lambda: self.a.read()["data"] == graph("from B"))
        self.eventually(lambda: wa.status()["state"] == wb.status()["state"] == "idle")
        self.assertEqual(len(self.a.sync.status()["heads"]), 1)
        self.assertIsNotNone(wa.status()["lastSuccess"])

    def test_attachment_without_graph_revision_change_is_transferred_once(self):
        wa, wb = self.bootstrap()
        original_graph = self.a.read()["data"]
        original_revision = self.a.read()["revision"]
        content = b"Anexo local completo\x00\xff\nSecond line"
        attachment = self.a.features.upload({"name": "attachment.bin", "type": "application/octet-stream",
                                             "data": base64.b64encode(content).decode("ascii")})
        # Attachment-only mutations wake the worker without incrementing the graph revision.
        self.assertEqual(self.a.read()["revision"], original_revision)
        self.eventually(lambda: any(item["id"] == attachment["id"] for item in self.b.features.list()))
        received, path = self.b.features.file(attachment["id"])
        self.assertEqual(received["name"], "attachment.bin")
        self.assertEqual(received["size"], len(content))
        self.assertEqual(path.read_bytes(), content)
        self.assertEqual(self.a.read()["data"], original_graph)
        self.assertEqual(self.b.read()["data"], original_graph)
        self.eventually(lambda: wa.status()["state"] == wb.status()["state"] == "idle"
                        and self.a.sync.config["base"] == self.b.sync.config["base"])
        snapshots = {path.name for path in self.folder.glob("*.json")}
        self.assertEqual(len(snapshots), 2)  # Initial graph, then the attachment-only change.
        wa.wake(); wb.wake()
        time.sleep(.18)
        self.assertEqual({path.name for path in self.folder.glob("*.json")}, snapshots)
        self.assertFalse(self.a.sync.status()["localChanges"])
        self.assertFalse(self.b.sync.status()["localChanges"])

    def test_automatic_is_opt_in_and_proton_can_create_its_dedicated_folder(self):
        self.a.sync.configure({"folder": str(self.folder)})
        self.save(self.a, "local")
        worker = self.worker(self.a)
        self.eventually(lambda: worker.status()["state"] == "disabled")
        self.assertEqual(list(self.folder.iterdir()), [])
        with self.assertRaises(SyncError):
            self.configure(self.a, automatic="true")
        with self.assertRaises(SyncError):
            self.a.sync.configure({"folder": "", "transport": "folder"})
        with self.assertRaises(SyncError):
            self.a.sync.configure({"folder": "", "transport": "proton", "remoteFolder": "/my-files/"})
        worker.stop()
        state = self.a.sync.configure({"folder": "", "transport": "proton", "automatic": False})
        self.assertEqual(state["folder"], state["defaultFolder"])
        self.assertTrue(Path(state["folder"]).is_dir())
        self.assertFalse(state["automatic"])
        self.assertEqual(state["remoteFolder"], "/my-files/Trama")

    def test_first_connection_with_existing_notes_requires_an_explicit_choice(self):
        self.configure(self.a)
        self.save(self.a, "remote")
        self.worker(self.a)
        self.eventually(lambda: self.a.sync.config.get("base") is not None)
        self.save(self.b, "local starter pages")
        self.configure(self.b)
        wb = self.worker(self.b)
        self.eventually(lambda: wb.status()["state"] == "choice_required")
        self.assertEqual(self.b.read()["data"], graph("local starter pages"))
        self.assertIsNone(self.b.sync.config["base"])
        chosen = self.b.sync.receive({"id": self.a.sync.config["base"], "revision": self.b.read()["revision"]})
        self.assertIsNotNone(chosen["recovery"])
        self.eventually(lambda: wb.status()["state"] == "idle")
        self.assertEqual(self.b.read()["data"], graph("remote"))

    def test_concurrent_edits_become_two_preserved_heads_without_auto_merge(self):
        wa, wb = self.bootstrap()
        wb.stop()
        self.save(self.a, "branch A")
        self.eventually(lambda: not self.a.sync.status()["localChanges"] and self.a.sync.status()["snapshots"][0]["contentHash"] == self.a.sync.config["baseFingerprint"])
        self.save(self.b, "branch B offline")
        wb = self.worker(self.b)
        self.eventually(lambda: wb.status()["state"] == "conflict")
        self.eventually(lambda: wa.status()["state"] == "conflict")
        self.assertEqual(self.a.read()["data"], graph("branch A"))
        self.assertEqual(self.b.read()["data"], graph("branch B offline"))
        state = self.a.sync.status(refresh=True)
        self.assertEqual(len(state["heads"]), 2)
        texts = []
        for ident in state["heads"]:
            _, archive = self.a.sync._read_snapshot(self.folder, ident, content=True)
            data, _, _ = self.a.features._unpack(archive)
            texts.append(data["pages"][0]["blocks"][0]["text"])
        self.assertCountEqual(texts, ["branch A", "branch B offline"])
        count = len(list(self.folder.glob("*.json")))
        time.sleep(.12)
        self.assertEqual(len(list(self.folder.glob("*.json"))), count)

    def test_restart_preserves_baseline_and_receives_the_next_change(self):
        wa, _ = self.bootstrap()
        base = self.a.sync.config["base"]
        wa.stop()
        reopened = Store(self.a.directory)
        self.assertEqual(reopened.sync.config["base"], base)
        self.assertTrue(reopened.sync.config["automatic"])
        self.worker(reopened)
        self.save(self.b, "after restart")
        self.eventually(lambda: reopened.read()["data"] == graph("after restart"))

    def test_editing_lease_prevents_receive_until_released(self):
        _, wb = self.bootstrap()
        wb.lease_seconds = 1.0
        wb.activity({"client": "tab-one", "busy": True})
        self.save(self.a, "new remote")
        self.eventually(lambda: any(item["id"] != self.b.sync.config["base"] for item in self.a.sync.status()["snapshots"]))
        time.sleep(.1)
        self.assertEqual(self.b.read()["data"], graph("base"))
        self.assertEqual(wb.status()["clientsBusy"], 1)
        wb.activity({"client": "tab-one", "busy": False})
        self.eventually(lambda: self.b.read()["data"] == graph("new remote"))

    def test_abandoned_browser_lease_expires_and_all_clients_must_be_idle(self):
        _, wb = self.bootstrap()
        wb.activity({"client": "tab-one", "busy": True})
        wb.activity({"client": "tab-two", "busy": True})
        wb.activity({"client": "tab-one", "busy": False})
        self.assertEqual(wb.status()["clientsBusy"], 1)
        self.save(self.a, "after lease")
        self.eventually(lambda: self.b.read()["data"] == graph("after lease"))
        self.assertEqual(wb.status()["clientsBusy"], 0)
        for invalid in ({}, {"client": "tab", "busy": "yes"}, {"client": "x" * 101, "busy": True}):
            with self.assertRaises(SyncError):
                wb.activity(invalid)

    def test_partial_archive_is_ignored_until_its_hash_matches(self):
        self.save(self.a, "whole snapshot")
        self.a.sync.configure({"folder": str(self.folder)})
        ident = self.a.sync.publish({"revision": self.a.read()["revision"]})["id"]
        path = self.folder / f"{ident}.zip"
        complete = path.read_bytes()
        path.write_bytes(complete[:20])
        self.configure(self.b)
        wb = self.worker(self.b)
        self.eventually(lambda: self.b.sync.status()["incomplete"] == 1)
        self.assertEqual(self.b.read()["data"]["pages"], [])
        path.write_bytes(complete)
        wb.wake()
        self.eventually(lambda: self.b.read()["data"] == graph("whole snapshot"))

    def test_revision_change_during_receive_never_overwrites_the_local_save(self):
        wa, wb = self.bootstrap()
        wb.stop()
        self.save(self.a, "remote revision")
        self.eventually(lambda: self.a.sync.config["base"] != self.b.sync.config["base"])
        original = self.b.features.import_vault
        raced = threading.Event()
        def racing_import(payload):
            self.b.save(payload["revision"], graph("saved in race"))
            raced.set()
            return original(payload)
        with patch.object(self.b.features, "import_vault", side_effect=racing_import):
            wb = self.worker(self.b)
            self.assertTrue(raced.wait(3))
            self.eventually(lambda: wb.status()["state"] == "conflict")
        self.assertEqual(self.b.read()["data"], graph("saved in race"))
        self.assertEqual(self.a.read()["data"], graph("remote revision"))

    def test_offline_proton_keeps_local_copy_and_retries_after_reconnection(self):
        remote, a_folder, b_folder = self.root / "cloud", self.root / "stage-a", self.root / "stage-b"
        for folder in (remote, a_folder, b_folder):
            folder.mkdir()
        connection = {"online": False}
        factory = lambda config: MemoryTransport(remote, connection)
        self.configure(self.a, a_folder, transport="proton")
        self.configure(self.b, b_folder, transport="proton")
        self.save(self.a, "written offline")
        wa, wb = self.worker(self.a, factory), self.worker(self.b, factory)
        self.eventually(lambda: len(list(a_folder.glob("*.json"))) == 1)
        self.assertEqual(list(remote.iterdir()), [])
        self.assertEqual(self.a.read()["data"], graph("written offline"))
        connection["online"] = True
        wa.wake(); wb.wake()
        self.eventually(lambda: self.b.read()["data"] == graph("written offline"))
        self.eventually(lambda: wa.status()["state"] == wb.status()["state"] == "idle")

    def test_network_does_not_hold_store_lock_or_block_status_and_shutdown_cancels(self):
        started, released = threading.Event(), threading.Event()
        class SlowTransport:
            def download(self, folder, config):
                started.set()
                released.wait(3)
            def upload(self, folder, config):
                raise AssertionError("Must not upload after shutdown")
            def close(self):
                released.set()
        self.configure(self.a, transport="proton")
        self.save(self.a, "before network")
        worker = self.worker(self.a, lambda config: SlowTransport())
        self.assertTrue(started.wait(2))
        start = time.monotonic()
        self.assertTrue(self.a.sync.status()["auto"]["busy"])
        self.assertLess(time.monotonic() - start, .15)
        self.save(self.a, "during network")
        start = time.monotonic()
        worker.stop()
        self.assertLess(time.monotonic() - start, .5)
        self.assertFalse(worker.status()["running"])
        self.assertEqual(self.a.read()["data"], graph("during network"))
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_disabling_automatic_cancels_a_blocked_download_immediately(self):
        started, released = threading.Event(), threading.Event()
        class SlowTransport:
            closed = False
            def download(self, folder, config):
                started.set()
                released.wait(3)
            def upload(self, folder, config):
                raise AssertionError("Must not upload after disabling automatic sync")
            def close(self):
                self.closed = True
                released.set()
        transport = SlowTransport()
        self.configure(self.a, transport="proton")
        self.save(self.a, "local notes")
        worker = self.worker(self.a, lambda config: transport)
        self.assertTrue(started.wait(2))
        start = time.monotonic()
        self.a.sync.configure({"folder": str(self.folder), "automatic": False})
        self.assertLess(time.monotonic() - start, .5)
        self.assertTrue(transport.closed)
        self.eventually(lambda: worker.status()["state"] == "disabled")
        self.assertEqual(self.a.read()["data"], graph("local notes"))
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_switching_connection_cancels_old_download_before_using_new_folder(self):
        started, released, next_started = threading.Event(), threading.Event(), threading.Event()
        old_uploads = []
        class ConnectionTransport:
            def __init__(self, old):
                self.old, self.closed = old, False
            def download(self, folder, config):
                if self.old:
                    started.set()
                    released.wait(3)
                else:
                    next_started.set()
            def upload(self, folder, config):
                if self.old:
                    old_uploads.append(folder)
            def close(self):
                self.closed = True
                if self.old:
                    released.set()
        old = ConnectionTransport(True)
        fresh = ConnectionTransport(False)
        self.configure(self.a, transport="proton")
        worker = self.worker(self.a, lambda config: old if config["remoteFolder"] == "/my-files/Trama" else fresh)
        self.assertTrue(started.wait(2))
        destination = self.root / "new-exchange"
        destination.mkdir()
        start = time.monotonic()
        self.a.sync.configure({"folder": str(destination), "remoteFolder": "/my-files/Another"})
        self.assertLess(time.monotonic() - start, .5)
        self.assertTrue(old.closed)
        self.assertTrue(next_started.wait(2))
        self.assertEqual(old_uploads, [])
        self.assertFalse(fresh.closed)
        self.assertEqual(worker._connection_key, worker._connection(self.a.sync.configuration()))

    def test_disabling_during_transport_creation_closes_it_before_network_use(self):
        started, released, closed = threading.Event(), threading.Event(), threading.Event()
        class UnusedTransport:
            def download(self, folder, config):
                raise AssertionError("Disabled transport must not begin a download")
            def upload(self, folder, config):
                raise AssertionError("Disabled transport must not begin an upload")
            def close(self):
                closed.set()
        def factory(config):
            started.set()
            released.wait(3)
            return UnusedTransport()
        self.configure(self.a, transport="proton")
        worker = self.worker(self.a, factory)
        self.assertTrue(started.wait(2))
        self.a.sync.configure({"folder": str(self.folder), "automatic": False})
        released.set()
        self.assertTrue(closed.wait(2))
        self.eventually(lambda: worker.status()["state"] == "disabled")
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_scan_caches_unchanged_archive_hashes_but_receive_rechecks_bytes(self):
        self.save(self.a, "cached")
        self.a.sync.configure({"folder": str(self.folder)})
        ident = self.a.sync.publish({"revision": self.a.read()["revision"]})["id"]
        self.b.sync.configure({"folder": str(self.folder)})
        opened = []
        original = Path.open
        def counted(path, *args, **kwargs):
            if path.suffix == ".zip":
                opened.append(path.name)
            return original(path, *args, **kwargs)
        with patch.object(Path, "open", counted):
            self.b.sync.status(refresh=True)
            self.b.sync.status(refresh=True)
            self.assertEqual(opened, [])
            self.b.sync.receive({"id": ident, "revision": 0})
        self.assertIn(f"{ident}.zip", opened)

    def test_connection_change_rejects_reusing_nonempty_exchange(self):
        self.a.sync.configure({"folder": str(self.folder), "transport": "proton", "automatic": False})
        self.save(self.a, "old destination")
        self.a.sync.publish({"revision": self.a.read()["revision"]})
        previous = self.a.sync.configuration()
        for extra in ({"remoteFolder": "/my-files/Different"}, {"transport": "folder"}):
            with self.assertRaises(SyncError) as caught:
                self.a.sync.configure({"folder": str(self.folder), **extra})
            self.assertEqual(caught.exception.code, "sync_connection_change")
            self.assertEqual(self.a.sync.configuration(), previous)
        fresh = self.root / "another-exchange"
        fresh.mkdir()
        state = self.a.sync.configure({"folder": str(fresh), "remoteFolder": "/my-files/Different"})
        self.assertIsNone(state["base"])
        self.assertTrue(list(self.folder.glob("*.zip")))

    def test_failed_manifest_removes_only_its_new_zip_and_does_not_block_retry(self):
        self.a.sync.configure({"folder": str(self.folder)})
        self.save(self.a, "preserved")
        original = self.a.sync._write_exclusive
        def fail_manifest(path, content):
            if path.parent == self.folder and path.suffix == ".json":
                raise OSError("disk full fixture")
            return original(path, content)
        with patch.object(self.a.sync, "_write_exclusive", side_effect=fail_manifest), self.assertRaises(OSError):
            self.a.sync.publish({"revision": self.a.read()["revision"]})
        self.assertEqual(list(self.folder.iterdir()), [])
        self.assertIsNone(self.a.sync.config["base"])
        self.a.sync.publish({"revision": self.a.read()["revision"]})
        self.assertEqual(self.a.sync.status()["incomplete"], 0)
        self.assertEqual(self.a.read()["data"], graph("preserved"))

    def test_invalid_copy_diagnostics_name_file_and_unchanged_bad_hash_is_cached(self):
        self.a.sync.configure({"folder": str(self.folder)})
        self.save(self.a, "before corruption")
        ident = self.a.sync.publish({"revision": self.a.read()["revision"]})["id"]
        archive = self.folder / f"{ident}.zip"
        archive.write_bytes(b"incomplete")
        opened, original = [], Path.open
        def counted(path, *args, **kwargs):
            if path == archive:
                opened.append(path.name)
            return original(path, *args, **kwargs)
        with patch.object(Path, "open", counted):
            first = self.a.sync.status(refresh=True)
            second = self.a.sync.status(refresh=True)
        self.assertEqual(len(opened), 1)
        self.assertEqual(first["incompleteFiles"][0]["file"], archive.name)
        self.assertEqual(second["incompleteFiles"][0]["code"], "sync_hash_mismatch")
        self.assertIn(archive.name, first["message"])
        self.assertIn("Confira", first["message"])


if __name__ == "__main__":
    unittest.main()
