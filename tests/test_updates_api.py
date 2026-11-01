import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest

from server import Store, Server


class FakeUpdates:
    def __init__(self):
        self.automatic = True
        self.checks = 0
        self.state = 'ready'
    def status(self):
        return {'state': self.state, 'currentVersion': '0.10', 'availableVersion': '0.10.1', 'automatic': self.automatic}
    def configure(self, automatic):self.automatic = automatic
    def check(self):self.checks += 1
    def stop(self):pass


class UpdateApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.store = Store(Path(self.temp.name));self.updates = FakeUpdates()
        self.server = Server(('127.0.0.1', 0), self.store, update_service=self.updates, can_close=True)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True);self.thread.start()
        self.addCleanup(self.finish)

    def finish(self):
        self.server.shutdown();self.server.server_close();self.thread.join(timeout=3)

    def request(self, path, body=None, origin=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=3)
        try:
            headers = {'Content-Type': 'application/json'}
            if origin:headers['Origin'] = origin
            connection.request('GET' if body is None else 'POST', path, None if body is None else json.dumps(body), headers)
            response = connection.getresponse();return response.status, json.loads(response.read())
        finally:connection.close()

    def test_status_and_explicit_controls_do_not_change_notes(self):
        before = self.store.read()
        status, state = self.request('/api/update/status')
        self.assertEqual(status, 200);self.assertTrue(state['canClose'])
        self.assertEqual(self.request('/api/update/settings', {'automatic':False})[0], 200)
        self.assertFalse(self.updates.automatic)
        self.assertEqual(self.request('/api/update/check', {})[0], 200);self.assertEqual(self.updates.checks, 1)
        self.assertEqual(self.store.read(), before)

    def test_updates_reject_cross_origin_and_arbitrary_download_parameters(self):
        for path in ('/api/update/check','/api/update/settings','/api/app/close'):
            self.assertEqual(self.request(path, {}, 'https://foreign.example')[0], 403)
        self.assertEqual(self.request('/api/update/status', origin='https://foreign.example')[0], 403)
        for body in ({'url':'https://foreign.example/app.zip'}, [], {'automatic':True}):
            self.assertEqual(self.request('/api/update/check', body)[0], 400)
        for body in ({'automatic':'true'}, {'automatic':True,'url':'other'}, []):
            self.assertEqual(self.request('/api/update/settings', body)[0], 400)
        self.assertEqual(self.updates.checks, 0)

    def test_close_rejects_stale_revision_and_another_editing_window(self):
        own = {'revision':self.store.revision(), 'client':'own-window'}
        self.assertEqual(self.request('/api/app/close', {**own,'revision':999})[0], 409)
        self.server.auto_sync.activity({'client':'another-window','busy':True})
        self.assertEqual(self.request('/api/app/close', own)[0], 409)
        self.assertFalse(self.server.close_requested);self.assertTrue(self.thread.is_alive())

    def test_close_requires_managed_launcher_and_valid_revision(self):
        body = {'revision':0,'client':'own-window'}
        self.server.can_close = False
        self.assertEqual(self.request('/api/app/close', body)[0], 409)
        self.assertEqual(self.request('/api/app/close', {'revision':True,'client':'own-window'})[0], 400)
        self.assertFalse(self.server.close_requested)

    def test_close_without_pending_update_stops_managed_app(self):
        self.updates.state = 'current'
        code,result = self.request('/api/app/close', {'revision':0,'client':'own-window'})
        self.assertEqual(code,200);self.assertTrue(result['ok'])
        self.thread.join(timeout=3);self.assertFalse(self.thread.is_alive())

    def test_close_after_saved_revision_preserves_graph_and_stops_server(self):
        self.store.save(0, {'version':1,'pages':[{'id':'page','title':'Saved note','created':'2026-11-01','updated':'2026-11-01','blocks':[]}]})
        before = self.store.read()
        self.server.auto_sync.activity({'client':'own-window','busy':True})
        code, result = self.request('/api/app/close', {'revision':before['revision'],'client':'own-window'})
        self.assertEqual(code, 200);self.assertTrue(result['ok'])
        self.thread.join(timeout=3);self.assertFalse(self.thread.is_alive())
        self.assertEqual(Store(Path(self.temp.name)).read(), before)


if __name__ == '__main__':unittest.main()
