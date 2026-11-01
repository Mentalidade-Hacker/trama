import copy
import base64
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Store, Conflict
from sync_store import SyncError
from sync_preview import compare_graphs, preview_snapshot


def page(ident="page", text="Nota", title="Ideias"):
    return {"id": ident, "title": title, "created": "2026-10-31", "updated": "2026-10-31", "blocks": [
        {"id": ident + "-block", "text": text, "children": [], "collapsed": False}]}


def graph(*pages):
    return {"version": 1, "pages": list(pages)}


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.folder = self.root / "exchange"
        self.folder.mkdir()
        self.local, self.remote = Store(self.root / "local"), Store(self.root / "remote")
        for store in (self.local, self.remote):
            store.sync.configure({"folder": str(self.folder)})
        self.local.save(0, graph(page(text="Minha nota"), page("removed", "Só aqui", "Local")))
        self.remote.save(0, graph(page(text="Nota remota"), page("added", "Chegando", "Remota")))
        self.ident = self.remote.sync.publish({"revision": 1})["id"]

    def test_preview_compares_without_mutating_notes_backups_or_exchange(self):
        before = self.local.read()
        files = {path.name: path.read_bytes() for path in self.folder.iterdir()}
        config = self.local.sync.config_path.read_bytes()
        backup_count = len(list((self.local.directory / "backups").glob("*.db")))
        result = preview_snapshot(self.local, {"id": self.ident, "revision": 1})
        self.assertEqual(result["changes"], {"addedPages": 1, "removedPages": 1, "changedPages": 1,
                         "unchangedPages": 0, "addedBlocks": 1, "removedBlocks": 1, "changedBlocks": 1})
        self.assertEqual(result["blockChanges"][1]["before"], "Minha nota")
        self.assertEqual(result["blockChanges"][1]["after"], "Nota remota")
        self.assertEqual(result["preview"]["heads"], [self.ident])
        self.assertTrue(result["safeToReceive"])
        self.assertEqual(self.local.read(), before)
        self.assertEqual(self.local.sync.config_path.read_bytes(), config)
        self.assertEqual({p.name: p.read_bytes() for p in self.folder.iterdir()}, files)
        self.assertEqual(len(list((self.local.directory / "backups").glob("*.db"))), backup_count)
        self.assertFalse(self.local.sync.recovery_folder.exists())

    def test_corrupt_archive_stale_revision_and_invalid_id_never_offer_preview(self):
        with self.assertRaises(Conflict):
            preview_snapshot(self.local, {"id": self.ident, "revision": 0})
        with self.assertRaises(SyncError):
            preview_snapshot(self.local, {"id": "../outside", "revision": 1})
        (self.folder / (self.ident + ".zip")).write_bytes(b"damaged")
        with self.assertRaises(SyncError):
            preview_snapshot(self.local, {"id": self.ident, "revision": 1})
        self.assertEqual(self.local.read()["data"]["pages"][0]["blocks"][0]["text"], "Minha nota")

    def test_move_and_heading_changes_are_detected_without_claiming_new_blocks(self):
        original = graph(page())
        original["pages"][0]["blocks"].append({"id": "second", "text": "Outra", "children": []})
        incoming = copy.deepcopy(original)
        second = incoming["pages"][0]["blocks"].pop()
        incoming["pages"][0]["blocks"][0]["children"].append(second)
        incoming["pages"][0]["blocks"][0]["heading"] = 2
        diff = compare_graphs(original, incoming)
        self.assertEqual(diff["changes"]["changedBlocks"], 2)
        self.assertEqual(diff["changes"]["addedBlocks"], 0)
        self.assertEqual(diff["changes"]["removedBlocks"], 0)

    def test_preview_is_bounded_but_totals_include_every_change(self):
        original = graph()
        incoming = graph(*(page(str(i), "x" * 1000, "Página " + str(i)) for i in range(130)))
        diff = compare_graphs(original, incoming)
        self.assertEqual(diff["changes"]["addedPages"], 130)
        self.assertEqual(len(diff["pages"]), 100)
        self.assertEqual(len(diff["blockChanges"]), 20)
        self.assertTrue(diff["truncated"] and diff["blocksTruncated"])
        self.assertTrue(all(len(item["after"]) == 300 for item in diff["blockChanges"]))

    def test_timestamps_alone_do_not_claim_content_changes(self):
        old = graph(page())
        new = copy.deepcopy(old)
        new["pages"][0]["updated"] = "2026-11-01"
        self.assertEqual(compare_graphs(old, new)["changes"]["unchangedPages"], 1)

    def test_attachment_preview_reports_retention_and_blocks_digest_conflicts(self):
        def upload(store, content):
            return store.features.upload({"name": "nota.txt", "type": "text/plain",
                                          "data": base64.b64encode(content).decode()})
        local_file = upload(self.local, b"local")
        remote_file = upload(self.remote, b"remote")
        ident = self.remote.sync.publish({"revision": 1})["id"]
        out = preview_snapshot(self.local, {"id": ident, "revision": 1})
        self.assertEqual(out["attachments"], {"incoming": 1, "local": 1, "added": 1, "changed": 0, "keptLocal": 1})
        with self.local.connect() as db:
            db.execute("UPDATE attachments SET id=? WHERE id=?", (remote_file["id"], local_file["id"]))
        out = preview_snapshot(self.local, {"id": ident, "revision": 1})
        self.assertEqual(out["attachments"]["changed"], 1)
        self.assertFalse(out["safeToReceive"])


if __name__ == "__main__":
    unittest.main()
