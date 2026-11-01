import copy
import json
import http.client
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from server import Store, Server
from learning_drafts import DraftConflict, LearningDrafts


def draft(text='Meu texto [[ação]] 🙂', ident='draft-a'):
    return {'id':ident,'key':'lesson-a','tab':'writing','language':'pt','text':text,
            'lesson':{'id':'lesson-a','kind':'writing','language':'pt','title':'Coesão','prompt':'Escreva uma frase.'}}


class DraftTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.path=Path(self.temp.name).resolve();self.store=Store(self.path)
        self.epoch=self.store.drafts.read()['epoch']

    def save(self, data=None, revision=0):
        return self.store.drafts.save({'epoch':self.epoch,'revision':revision,'data':data or draft()})

    def test_draft_survives_restart_without_mutating_graph(self):
        saved=self.save();again=Store(self.path)
        self.assertEqual(again.drafts.read()['records'],[saved]);self.assertEqual(again.read(),{'revision':0,'data':{'version':1,'pages':[]}})
        self.assertEqual(saved['data']['text'],'Meu texto [[ação]] 🙂')

    def test_stale_edit_rejected_and_idempotent_ack_retry(self):
        saved=self.save();self.assertEqual(self.save(),saved)
        with self.assertRaises(DraftConflict):self.save(draft('Outra janela'))
        self.assertEqual(self.store.drafts.read()['records'],[saved])
        self.assertEqual(self.save(draft('Atualizado'),1)['revision'],2)

    def test_empty_text_is_saved_as_deliberate_clear(self):
        self.save();self.save(draft(''),1)
        self.assertEqual(self.store.drafts.read()['records'][0]['data']['text'],'')

    def test_translation_length_round_trips_and_lesson_limits_stay_separate(self):
        value=draft('🙂'*10000)
        saved=self.save(value)
        self.assertEqual(Store(self.path).drafts.read()['records'][0]['data']['text'],value['text'])
        self.assertEqual(LearningDrafts.validate_backup([saved])[0],saved)
        value['lesson']['before']='x'*12001
        with self.assertRaises(ValueError):self.save(value,1)
        self.assertEqual(self.store.drafts.read()['records'],[saved])

    def test_limits_and_invalid_types_do_not_erase_prior_text(self):
        before=self.save()
        for change in ({'text':'🙂'*10001},{'text':None},{'id':'../x'},{'language':'en'},{'key':'wrong'},{'lesson':{}},{'tab':'bogus'}):
            value=draft();value.update(change)
            with self.assertRaises((ValueError,UnicodeError)):self.save(value,1)
        for revision in (True,-1,1.5,'1'):
            with self.assertRaises(ValueError):self.save(draft('other'),revision)
        self.assertEqual(self.store.drafts.read()['records'],[before])

    def test_backup_validation_and_epoch_block_stale_browser_after_restore(self):
        record=self.save()
        with self.store.connect() as db:LearningDrafts.replace_records(db,[record])
        self.assertNotEqual(self.store.drafts.read()['epoch'],self.epoch)
        with self.assertRaises(DraftConflict) as raised:self.save(draft('old browser'),1)
        self.assertEqual(raised.exception.code,'draft_epoch')
        with self.assertRaises(ValueError):LearningDrafts.validate_backup([record,record])
        bad=copy.deepcopy(record);bad['updated']='bad'
        with self.assertRaises(ValueError):LearningDrafts.validate_backup([bad])
        self.assertEqual(self.store.drafts.read()['records'],[record])

    def test_capacity_errors_leave_existing_drafts_intact(self):
        record=self.save()
        with patch('learning_drafts.MAX_RECORDS',1):
            with self.assertRaises(ValueError):self.save(draft(ident='another'))
        self.assertEqual(self.store.drafts.read()['records'],[record])

    def test_unknown_metadata_not_stored(self):
        value=draft();value['token']='secret';value['lesson']['password']='secret'
        self.assertNotIn('secret',json.dumps(self.save(value)))

    def test_http_routes_validate_origin_and_report_conflict(self):
        server=Server(('127.0.0.1',0),self.store)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            def request(body=None,origin=None):
                connection=http.client.HTTPConnection(*server.server_address,timeout=3)
                try:
                    headers={'Content-Type':'application/json'}
                    if origin:headers['Origin']=origin
                    connection.request('GET' if body is None else 'POST','/api/learning/drafts',None if body is None else json.dumps(body),headers)
                    response=connection.getresponse();return response.status,json.loads(response.read())
                finally:connection.close()
            self.assertEqual(request()[0],200)
            payload={'epoch':self.epoch,'revision':0,'data':draft()}
            self.assertEqual(request(payload,'https://foreign.example')[0],403)
            self.assertEqual(request(payload)[0],200)
            payload['data']['text']='changed'
            self.assertEqual(request(payload)[0],409)
            self.assertEqual(request([])[0],400)
        finally:server.shutdown();server.server_close();thread.join()


if __name__=='__main__':unittest.main()
