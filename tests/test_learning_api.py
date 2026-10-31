from contextlib import closing
import http.client
import json
import tempfile
import threading
import unittest
from unittest.mock import MagicMock
from server import Store, Server
from dictionary import DictionaryError


class LearningAPITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.server = Server(('127.0.0.1',0),Store(self.temp.name))
        self.server.dictionary = MagicMock()
        self.server.dictionary.status.return_value={'available':True,'local':True}
        self.server.dictionary.lookup.return_value={'found':True,'local':True,'entries':[]}
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.temp.cleanup()

    def request(self,path,payload=None,origin=None):
        with closing(http.client.HTTPConnection(*self.server.server_address,timeout=3)) as connection:
            headers={'Content-Type':'application/json'}
            if origin:headers['Origin']=origin
            connection.request('GET' if payload is None else 'POST',path,None if payload is None else json.dumps(payload),headers)
            response=connection.getresponse();return response.status,dict(response.getheaders()),response.read()

    def test_dictionary_routes_are_local_and_do_not_accept_cross_site_requests(self):
        status,_,raw=self.request('/api/dictionary/status');self.assertEqual(status,200);self.assertTrue(json.loads(raw)['local'])
        self.assertEqual(self.request('/api/dictionary',{'word':'ação','language':'pt'})[0],200)
        self.server.dictionary.lookup.assert_called_once_with('ação','pt')
        self.assertEqual(self.request('/api/dictionary',{'word':'secret','language':'en'},'https://other.example')[0],403)
        self.assertEqual(self.server.dictionary.lookup.call_count,1)

    def test_invalid_payload_online_flag_and_missing_resource_fail_explicitly(self):
        for payload in ([],{'word':'test','language':'en','online':True}):self.assertEqual(self.request('/api/dictionary',payload)[0],400)
        self.server.dictionary.lookup.side_effect=DictionaryError('resource missing')
        self.assertEqual(self.request('/api/dictionary',{'word':'test','language':'en'})[0],503)

    def test_wasm_permission_is_limited_to_spelling_worker_and_correct_mime(self):
        _,headers,_=self.request('/spell-worker.js');self.assertIn("'wasm-unsafe-eval'",headers['Content-Security-Policy']);self.assertNotIn("'unsafe-eval'",headers['Content-Security-Policy'])
        _,headers,_=self.request('/app.js');self.assertNotIn('wasm-unsafe-eval',headers['Content-Security-Policy'])
        status,headers,_=self.request('/vendor/spelling/hunspell/wasm/hunspell.wasm');self.assertEqual(status,200);self.assertEqual(headers['Content-type'],'application/wasm')

if __name__=='__main__':unittest.main()
