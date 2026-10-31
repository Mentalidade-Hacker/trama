import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from proton_service import ProtonService, sign_in_url
from proton_transfer import BackgroundCLI, ProtonTransport, snapshot_pair, receive_files
from test_proton_transfer import pair, FakeCLI


class ProtonAutoTests(unittest.TestCase):
    def test_background_commands_are_bounded_quiet_and_do_not_login(self):
        process = MagicMock(returncode=0)
        process.communicate.return_value = ('[]', '')
        with patch('proton_transfer.subprocess.Popen', return_value=process) as launch:
            cli = BackgroundCLI('proton-drive')
            self.assertEqual(cli.names('/my-files/Trama'), set())
        argv = launch.call_args.args[0]
        self.assertEqual(argv, ['proton-drive', 'filesystem', 'list', '/my-files/Trama', '--json'])
        self.assertEqual(launch.call_args.kwargs['stdin'], subprocess.DEVNULL)
        process.communicate.assert_called_once_with(timeout=60)

    def test_timeout_kills_child_and_does_not_expose_cli_diagnostics(self):
        process = MagicMock(returncode=1)
        process.communicate.side_effect = [subprocess.TimeoutExpired('test', 60), ('', 'secret')]
        with patch('proton_transfer.subprocess.Popen', return_value=process):
            with self.assertRaisesRegex(ValueError, 'demorou'):
                BackgroundCLI('proton-drive').names('/my-files/Trama')
        process.kill.assert_called_once()
        process.communicate.side_effect = None
        process.communicate.return_value = ('sensitive output', 'authentication failed secret-token')
        with patch('proton_transfer.subprocess.Popen', return_value=process):
            with self.assertRaises(ValueError) as caught:
                BackgroundCLI('proton-drive').names('/my-files/Trama')
        self.assertNotIn('secret-token', str(caught.exception))
        self.assertIn('Entrar no Proton', str(caught.exception))

    def test_stopped_transport_cannot_start_more_processes(self):
        cli = BackgroundCLI('proton-drive')
        cli.close()
        with patch('proton_transfer.subprocess.Popen') as launch, self.assertRaises(ValueError):
            cli.names('/my-files/Trama')
        launch.assert_not_called()

    def test_automatic_transfer_refuses_plaintext_credential_setting(self):
        with patch.dict(os.environ, {'PROTON_DRIVE_CREDENTIALS_STORE': 'unsafe_file'}):
            with patch('proton_transfer.subprocess.Popen') as launch, self.assertRaises(ValueError):
                BackgroundCLI('proton-drive').names('/my-files/Trama')
        launch.assert_not_called()

    def test_cache_detects_changed_immutable_file(self):
        with tempfile.TemporaryDirectory() as folder:
            archive, _ = pair(folder)
            cache = {}
            snapshot_pair(folder, 'a' * 32, cache)
            with patch('proton_transfer.file_hash', side_effect=AssertionError('unneeded reread')):
                snapshot_pair(folder, 'a' * 32, cache)
            archive.write_bytes(b'changed')
            with self.assertRaises(ValueError):
                snapshot_pair(folder, 'a' * 32, cache)

    def test_background_download_removes_only_its_successful_staging(self):
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            pair(remote)
            other = Path(local) / '.trama-proton-recebido-user'
            other.mkdir()
            (other / 'keep').write_text('keep')
            self.assertEqual(receive_files(FakeCLI(remote), '/my-files/Trama', local, keep_staging=False), 1)
            self.assertEqual(list(Path(local).glob('.trama-proton-recebido-*')), [other])
            self.assertEqual((other / 'keep').read_text(), 'keep')

    def test_signin_urls_are_restricted_to_official_https_hosts(self):
        for url in ('https://account.proton.me/test?code=abc', 'https://account.protonmail.com/test'):
            self.assertEqual(sign_in_url(url), url)
        for url in ('javascript:alert(1)', 'https://account.proton.me.evil.test/',
                    'http://account.proton.me/', 'https://x@account.proton.me/',
                    'https://account.proton.me:444/', None):
            self.assertIsNone(sign_in_url(url))

    def test_login_is_explicit_and_does_not_save_credentials(self):
        sync = SimpleNamespace(config={}, worker=MagicMock())
        service = ProtonService(sync)
        with patch('proton_service.find_cli', return_value='proton-drive'), patch('proton_service.subprocess.Popen') as launch:
            self.assertEqual(service.status()['loginState'], 'idle')
            launch.assert_not_called()
            process = MagicMock()
            process.stdout = io.StringIO(json.dumps({'signInUrl': 'https://account.proton.me/test'}) + '\n')
            process.wait.return_value = 0
            launch.return_value = process
            service.login({})
            service.thread.join(timeout=2)
            self.assertEqual(service.status()['loginState'], 'connected')
            self.assertEqual(sync.config, {})
            self.assertNotIn('signInUrl', service.status())
            self.assertEqual(launch.call_args.args[0], ['proton-drive', 'auth', 'login', '--json'])
        service.close()
        sync.worker.wake.assert_called_once()


if __name__ == '__main__':
    unittest.main()
