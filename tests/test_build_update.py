from pathlib import Path
import json
import tempfile
import unittest
import zipfile

from build_update import build
from updater import validate_release


class BuildUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.source=self.root/'source';self.source.mkdir()
        self.files={'server.py':'# server\n','updater.py':'# updater\n','launch_trama.py':'# launcher\n',
                    'web/index.html':'<p>Trama</p>','web/app.js':'// app\n','start.sh':'#!/bin/bash\n',
                    'resources/dictionary.sqlite':'dictionary bytes','trama.db':'personal notes',
                    'tests/test_private.py':'# test\n','.env':'secret','sync-config.json':'credentials'}
        for name,content in self.files.items():
            path=self.source/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content,encoding='utf-8')

    def test_small_update_includes_verified_program_and_excludes_personal_data_and_dictionary(self):
        result=build(self.source,self.root/'out','0.10',self.files)
        with zipfile.ZipFile(result['file']) as archive:
            self.assertEqual(set(archive.namelist()),{'trama/'+name for name in ('server.py','updater.py','launch_trama.py','web/index.html','web/app.js','start.sh','app-release.json')})
            archive.extractall(self.root/'extracted')
        manifest=validate_release(self.root/'extracted/trama','0.10')
        self.assertEqual(json.loads((self.source/'app-release.json').read_text(encoding='utf-8')),manifest)
        self.assertEqual((self.source/'trama.db').read_text(),'personal notes')

    def test_untracked_runtime_files_are_not_added_to_published_manifest(self):
        result=build(self.source,self.root/'out','0.10',[name for name in self.files if name!='start.sh'])
        with zipfile.ZipFile(result['file']) as archive:self.assertNotIn('trama/start.sh',archive.namelist())

    def test_bad_version_and_missing_required_files_fail_without_output(self):
        for version,names in (('../0.10',self.files),('0.10',['server.py'])):
            with self.assertRaises(ValueError):build(self.source,self.root/'out',version,names)
        self.assertFalse((self.source/'app-release.json').exists())


if __name__=='__main__':unittest.main()
