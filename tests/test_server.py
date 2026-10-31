import http.client
import base64
from contextlib import closing
import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
from types import SimpleNamespace
from unittest.mock import MagicMock
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Store, Handler, Conflict, validate
from proofreader import ProofreaderError
from translation import TranslationError


def graph(text="Olá [[Ideia]]"):
    return {"version": 1, "pages": [{"id": "page-1", "title": "Hoje", "created": "2026-10-31", "updated": "2026-10-31", "blocks": [{"id": "block-1", "text": text, "children": [], "collapsed": False}]}]}


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(self.temp.name)

    def test_persistence_and_conflict_preserve_latest(self):
        self.assertEqual(self.store.save(0, graph()), 1)
        reopened = Store(self.temp.name)
        self.assertEqual(reopened.read()["data"], graph())
        with self.assertRaises(Conflict):
            reopened.save(0, graph("stale"))
        self.assertEqual(reopened.read()["data"], graph())

    def test_duplicate_ids_and_titles_rejected_without_write(self):
        invalid = graph()
        invalid["pages"][0]["blocks"][0]["id"] = "page-1"
        with self.assertRaises(ValueError):
            self.store.save(0, invalid)
        invalid = graph()
        invalid["pages"].append({"id": "page-2", "title": "hoje", "blocks": []})
        with self.assertRaises(ValueError):
            self.store.save(0, invalid)
        self.assertEqual(self.store.read()["revision"], 0)

    def test_backup_is_consistent_and_retained(self):
        self.store.save(0, graph())
        paths = [self.store.backup() for _ in range(22)]
        self.assertEqual(len(list((Path(self.temp.name) / "backups").glob("*.db"))), 20)
        with closing(sqlite3.connect(paths[-1])) as db:
            revision, data = db.execute("SELECT revision, data FROM graph").fetchone()
        self.assertEqual((revision, json.loads(data)), (1, graph()))

    def test_parallel_stale_writes_only_one_wins(self):
        results = []
        def write(text):
            try:
                results.append(self.store.save(0, graph(text)))
            except Conflict:
                results.append("conflict")
        threads = [threading.Thread(target=write, args=(str(i),)) for i in range(2)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertCountEqual(results, [1, "conflict"])

    def test_saved_data_must_remain_readable_by_frontend(self):
        for field, value in (("id", "invalid/id"), ("text", "x" * 1_000_001), ("collapsed", None)):
            invalid = graph()
            invalid["pages"][0]["blocks"][0][field] = value
            with self.assertRaises(ValueError):
                self.store.save(0, invalid)
        for field, value in (("created", "invalid"), ("updated", None), ("title", "a[[b]]")):
            invalid = graph()
            invalid["pages"][0][field] = value
            with self.assertRaises(ValueError):
                self.store.save(0, invalid)
        self.assertEqual(self.store.read()["revision"], 0)

    def test_unicode_title_comparison_matches_frontend(self):
        data = graph()
        data["pages"][0]["title"] = "Maße"
        data["pages"].append({"id": "page-2", "title": "Masse", "created": "2026-10-31", "updated": "2026-10-31", "blocks": []})
        self.store.save(0, data)
        data["pages"][0]["title"] = "Café"
        data["pages"][1]["title"] = "Cafe\u0301"
        with self.assertRaises(ValueError):
            self.store.save(1, data)


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(self.temp.name)
        self.port = 8765
        self.server = SimpleNamespace(server_address=("127.0.0.1", self.port), store=self.store)

    def tearDown(self):
        self.temp.cleanup()

    def request(self, method, path, body=None, headers=None):
        # Exercise the real HTTP parser and route handler without requiring the
        # test runner to have permission to open a loopback network connection.
        payload = body.encode("utf-8") if body else b""
        request_headers = {"Host": f"127.0.0.1:{self.port}", "Content-Length": str(len(payload)), **(headers or {})}
        raw = (f"{method} {path} HTTP/1.1\r\n" + "".join(f"{key}: {value}\r\n" for key, value in request_headers.items()) + "\r\n").encode("ascii") + payload
        class MemorySocket:
            def __init__(self, content):
                self.content = content
                self.response = bytearray()
            def makefile(self, mode, *args):
                return io.BytesIO(self.content)
            def sendall(self, data):
                self.response.extend(data)
        request = MemorySocket(raw)
        Handler(request, ("127.0.0.1", 12345), self.server)
        response = http.client.HTTPResponse(MemorySocket(bytes(request.response)))
        response.begin()
        self.last_headers = dict(response.getheaders())
        return response.status, response.read()

    def test_save_read_export_and_conflict(self):
        headers = {"Content-Type": "application/json", "Origin": f"http://127.0.0.1:{self.port}"}
        payload = json.dumps({"revision": 0, "data": graph()})
        status, body = self.request("PUT", "/api/state", payload, headers)
        self.assertEqual((status, json.loads(body)), (200, {"revision": 1}))
        self.assertEqual(self.request("PUT", "/api/state", payload, headers)[0], 409)
        status, body = self.request("GET", "/api/export")
        self.assertEqual((status, json.loads(body)), (200, graph()))
        self.assertEqual(self.request("POST", "/api/backup", "{}", headers)[0], 200)

    def test_revision_poll_does_not_send_note_content(self):
        self.store.save(0, graph('private note'))
        status, body = self.request('GET', '/api/revision')
        self.assertEqual((status, json.loads(body)), (200, {'revision': 1}))
        self.assertNotIn(b'private note', body)

    def test_sync_activity_and_explicit_proton_login_enforce_origin(self):
        self.server.auto_sync = SimpleNamespace(activity=MagicMock(return_value={'ok': True}))
        self.server.proton = SimpleNamespace(login=MagicMock(return_value={'loginState': 'waiting'}),
                                            status=MagicMock(return_value={'installed': False, 'loginState': 'idle'}))
        headers = {'Content-Type': 'application/json', 'Origin': f'http://127.0.0.1:{self.port}'}
        self.assertEqual(self.request('POST', '/api/sync/activity', '{"client":"test", "busy":true}', headers)[0], 200)
        self.server.auto_sync.activity.assert_called_once_with({'client': 'test', 'busy': True})
        bad = {**headers, 'Origin': 'https://external.test'}
        self.assertEqual(self.request('POST', '/api/sync/proton/login', '{}', bad)[0], 403)
        self.server.proton.login.assert_not_called()
        self.assertEqual(self.request('POST', '/api/sync/proton/login', '{}', headers)[0], 200)
        status, body = self.request('GET', '/api/sync/proton/status')
        self.assertEqual((status, json.loads(body)['installed']), (200, False))

    def test_dns_rebinding_origin_and_form_writes_rejected(self):
        self.assertEqual(self.request("GET", "/api/state", headers={"Host": "evil.example"})[0], 403)
        self.assertEqual(self.request("GET", "/api/state", headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.request("GET", "/api/state", headers={"Sec-Fetch-Site": "cross-site"})[0], 403)
        self.assertEqual(self.request("PUT", "/api/state", "{}", {"Content-Type": "text/plain"})[0], 400)
        self.assertEqual(self.store.read()["revision"], 0)

    def test_encoded_path_traversal_denied(self):
        self.assertEqual(self.request("GET", "/%2e%2e/server.py")[0], 403)

    def test_invalid_json_and_missing_revision_rejected(self):
        headers = {"Content-Type": "application/json"}
        self.assertEqual(self.request("PUT", "/api/state", "{oops", headers)[0], 400)
        self.assertEqual(self.request("PUT", "/api/state", json.dumps({"data": graph()}), headers)[0], 400)

    def test_proofreader_routes_and_security(self):
        self.server.proofreader = MagicMock()
        self.server.proofreader.status.return_value = {"available": True}
        self.server.proofreader.check.return_value = {"matches": []}
        headers = {"Content-Type": "application/json"}
        payload = json.dumps({"text": "Olá", "language": "pt-BR"})
        status, body = self.request("GET", "/api/proofread/status")
        self.assertEqual((status, json.loads(body)), (200, {"available": True}))
        status, body = self.request("POST", "/api/proofread", payload, headers)
        self.assertEqual((status, json.loads(body)), (200, {"matches": []}))
        self.server.proofreader.check.assert_called_once_with({"text": "Olá", "language": "pt-BR"})
        self.assertEqual(self.request("POST", "/api/proofread", payload, {**headers, "Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.server.proofreader.check.call_count, 1)
        self.server.proofreader.check.side_effect = ProofreaderError("missing")
        self.assertEqual(self.request("POST", "/api/proofread", payload, headers)[0], 503)
        self.assertEqual(self.store.read()["revision"], 0)

    def test_attachment_routes_content_safety_and_range(self):
        headers = {"Content-Type": "application/json"}
        payload = json.dumps({"name": "evil.html", "type": "text/html", "data": base64.b64encode(b"<h1>hello</h1>").decode()})
        status, body = self.request("POST", "/api/attachments", payload, headers)
        self.assertEqual(status, 200)
        uploaded = json.loads(body)
        status, content = self.request("GET", uploaded["url"])
        self.assertEqual((status, content), (200, b"<h1>hello</h1>"))
        self.assertEqual(self.last_headers["Content-Type"], "application/octet-stream")
        self.assertIn("attachment;", self.last_headers["Content-Disposition"])
        self.assertIn("sandbox", self.last_headers["Content-Security-Policy"])
        self.assertEqual(self.request("GET", uploaded["url"], headers={"Range": "bytes=4-8"}), (206, b"hello"))
        self.assertEqual(self.request("GET", uploaded["url"], headers={"Range": "bytes=999-"})[0], 416)
        self.assertEqual(self.request("GET", "/files/../trama.db")[0], 404)
        self.assertEqual(self.request("POST", "/api/attachments", payload, {**headers, "Origin": "https://evil.example"})[0], 403)

    def test_history_and_vault_routes(self):
        self.store.save(0, graph())
        status, body = self.request("GET", "/api/history")
        self.assertEqual((status, [item["revision"] for item in json.loads(body)]), (200, [1, 0]))
        self.assertEqual(json.loads(self.request("GET", "/api/history/1")[1])["data"], graph())
        self.assertEqual(self.request("GET", "/api/history/999")[0], 404)
        status, archive = self.request("GET", "/api/vault.zip")
        self.assertEqual(status, 200)
        self.assertEqual(self.last_headers["Content-Type"], "application/zip")
        payload = json.dumps({"revision": 1, "data": base64.b64encode(archive).decode()})
        status, body = self.request("POST", "/api/vault/import", payload, {"Content-Type": "application/json"})
        self.assertEqual((status, json.loads(body)["revision"]), (200, 2))

    def test_translation_routes_local_access_and_error_status(self):
        self.server.translation = MagicMock()
        self.server.translation.status.return_value = {"available": True, "local": True, "languages": ["en", "pt"]}
        self.server.translation.translate.return_value = {"texts": ["Olá"], "local": True}
        self.assertTrue(json.loads(self.request("GET", "/api/translate/status")[1])["available"])
        payload = json.dumps({"source": "en", "target": "pt", "texts": ["Hello"]})
        headers = {"Content-Type": "application/json"}
        status, body = self.request("POST", "/api/translate", payload, headers)
        self.assertEqual((status, json.loads(body)["texts"]), (200, ["Olá"]))
        self.assertEqual(self.request("POST", "/api/translate", payload, {**headers, "Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.server.translation.translate.call_count, 1)
        self.server.translation.translate.side_effect = TranslationError("Missing runtime")
        self.assertEqual(self.request("POST", "/api/translate", payload, headers)[0], 503)
        self.assertEqual(self.store.read()["revision"], 0)


if __name__ == "__main__":
    unittest.main()
