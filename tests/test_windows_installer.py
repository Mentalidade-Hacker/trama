import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
from install_windows import install, ps_literal


class InstallerTests(unittest.TestCase):
    def test_install_and_reinstall_preserve_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'Source with spaces';source.mkdir();(source/'web').mkdir()
            (source/'web'/'index.html').write_text('test');(source/'server.py').write_text('# test')
            (source/'resources').mkdir();(source/'resources'/'dictionary.sqlite').write_bytes(b'dictionary fixture')
            local=root/'Local';data=local/'Trama'/'data';data.mkdir(parents=True);(data/'trama.db').write_bytes(b'existing graph')
            target,_=install(source,local,root/'Roaming',False)
            self.assertEqual((target/'web'/'index.html').read_text(),'test')
            self.assertEqual((target/'resources'/'dictionary.sqlite').read_bytes(),b'dictionary fixture')
            install(target,local,root/'Roaming',False)
            self.assertEqual((data/'trama.db').read_bytes(),b'existing graph')

    def test_shortcut_uses_encoded_command_and_literal_paths(self):
        self.assertEqual(ps_literal("a'b"),"'a''b'")
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'source';source.mkdir();(source/'web').mkdir()
            with patch('install_windows.subprocess.run') as run:
                install(source,root/'Local $space',root/'Roaming')
            args=run.call_args.args[0]
            self.assertEqual(args[:4],['powershell.exe','-NoProfile','-NonInteractive','-EncodedCommand'])
            self.assertTrue(run.call_args.kwargs['check'])


if __name__=='__main__':unittest.main()
