import base64
import http.client
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Store, Server


def graph(text):
    return {"version": 1, "pages": [{"id": "page", "title": "Backup HTTP", "created": "2026-10-31", "updated": "2026-10-31", "blocks": [{"id": "block", "text": text, "children": [], "collapsed": False}]}]}


class FullBackupAPITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(Path(self.temp.name).resolve())
        self.store.save(0, graph("Arquivo original"))
        self.store.features.upload({"name": "arquivo.txt", "type": "text/plain", "data": base64.b64encode(b"attachment").decode()})
        self.server = Server(("127.0.0.1", 0), self.store)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def request(self, path, payload=None, *, origin=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=10)
        try:
            headers = {"Content-Type": "application/json"}
            if origin is not None:
                headers["Origin"] = origin
            connection.request("GET" if payload is None else "POST", "/api/full-backup/" + path,
                               None if payload is None else json.dumps(payload), headers)
            response = connection.getresponse()
            content = response.read()
            return response.status, dict(response.getheaders()), json.loads(content) if "application/json" in response.getheader("Content-Type", "") else content
        finally:
            connection.close()

    def archive(self):
        status, headers, raw = self.request("export", {"preferences": {"theme": "dark"}})
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "application/zip")
        self.assertIn("attachment;", headers["Content-Disposition"])
        self.assertEqual(int(headers["Content-Length"]), len(raw))
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            self.assertEqual(archive.testzip(), None)
            self.assertIn("drafts.json", archive.namelist())
        return base64.b64encode(raw).decode()

    def test_export_inspect_restore_recovery_over_real_http(self):
        encoded = self.archive()
        self.store.save(1, graph("Alteração posterior"))
        status, _, inspected = self.request("inspect", {"revision": 2, "data": encoded})
        self.assertEqual(status, 200)
        self.assertEqual(inspected["summary"]["attachments"], 1)
        self.assertEqual(self.store.revision(), 2)
        status, _, result = self.request("restore", {"revision": 2, "data": encoded, "inspection": inspected["inspection"], "preferencesBefore": {"theme": "light"}})
        self.assertEqual(status, 200)
        self.assertEqual(self.store.read()["data"], graph("Arquivo original"))
        self.assertTrue(result["syncDisabled"])
        status, headers, recovery = self.request("recovery/" + result["recoveryId"])
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "application/zip")
        with zipfile.ZipFile(io.BytesIO(recovery)) as archive:
            self.assertEqual(json.loads(archive.read("graph.json"))["data"], graph("Alteração posterior"))
            self.assertEqual(json.loads(archive.read("settings.json"))["preferences"], {"theme": "light"})

    def test_stale_inspection_and_restore_return_409_without_mutation(self):
        encoded = self.archive()
        status, _, inspected = self.request("inspect", {"revision": 1, "data": encoded})
        self.assertEqual(status, 200)
        self.store.save(1, graph("Outra janela"))
        for path, payload in (("inspect", {"revision": 1, "data": encoded}), ("restore", {"revision": 2, "data": encoded, "inspection": inspected["inspection"]})):
            status, _, result = self.request(path, payload)
            self.assertEqual(status, 409)
            self.assertEqual(result["code"], "backup_stale")
        self.assertEqual(self.store.read()["data"], graph("Outra janela"))
        self.assertFalse(self.store.full_backup.folder.exists())

    def test_foreign_origins_cannot_export_inspect_restore_or_read_recovery(self):
        before = self.store.read()
        for path, payload in (("export", {}), ("inspect", {}), ("restore", {}), ("recovery/" + "a" * 32, None)):
            status, _, result = self.request(path, payload, origin="https://foreign.example")
            self.assertEqual(status, 403)
            self.assertIn("Origem", result["error"])
        self.assertEqual(self.store.read(), before)

    def test_malformed_requests_return_400_and_recovery_ids_are_bounded(self):
        before = self.store.read()
        for path, payload in (("export", {"preferences": {"textSize": True}}), ("inspect", {}),
                              ("inspect", {"revision": 1, "data": base64.b64encode(b"bad zip").decode()}),
                              ("restore", {"revision": 1, "data": self.archive()})):
            status, _, result = self.request(path, payload)
            self.assertEqual(status, 400)
            self.assertIsInstance(result["error"], str)
        status, _, _ = self.request("recovery/not-an-id")
        self.assertEqual(status, 404)
        self.assertEqual(self.store.read(), before)


if __name__ == "__main__":
    unittest.main()
