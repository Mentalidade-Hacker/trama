import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
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

    def test_repeated_automatic_download_failures_leave_no_partial_staging(self):
        class InterruptedCLI(FakeCLI):
            def download_file(self, remote_path, folder):
                (Path(folder) / remote_path.rsplit('/', 1)[1]).write_bytes(b'partial transfer')
                raise TimeoutError('interrupted fixture')
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            pair(remote)
            kept = Path(local) / '.trama-proton-recebido-user'
            kept.mkdir()
            (kept / 'keep.txt').write_text('user data')
            existing, _ = pair(local, identifier='b' * 32, content=b'existing snapshot')
            for _ in range(3):
                with self.assertRaisesRegex(ValueError, 'temporários desta tentativa automática foram removidos'):
                    receive_files(InterruptedCLI(remote), '/my-files/Trama', local, keep_staging=False)
            self.assertEqual(list(Path(local).glob('.trama-proton-recebido-*')), [kept])
            self.assertEqual((kept / 'keep.txt').read_text(), 'user data')
            self.assertEqual(existing.read_bytes(), b'existing snapshot')

    def test_failed_manual_download_keeps_its_partial_files_for_inspection(self):
        class InterruptedCLI(FakeCLI):
            def download_file(self, remote_path, folder):
                (Path(folder) / remote_path.rsplit('/', 1)[1]).write_bytes(b'manual partial')
                raise TimeoutError('interrupted fixture')
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            pair(remote)
            with self.assertRaisesRegex(ValueError, 'preservados para inspeção'):
                receive_files(InterruptedCLI(remote), '/my-files/Trama', local)
            staging = list(Path(local).glob('.trama-proton-recebido-*'))
            self.assertEqual(len(staging), 1)
            self.assertEqual((staging[0] / ('a' * 32 + '.zip')).read_bytes(), b'manual partial')

    def test_automatic_cleanup_keeps_unexpected_files_in_its_staging(self):
        class InterruptedCLI(FakeCLI):
            def download_file(self, remote_path, folder):
                (Path(folder) / remote_path.rsplit('/', 1)[1]).write_bytes(b'partial')
                (Path(folder) / 'unexpected-user.txt').write_text('preserve')
                raise TimeoutError('interrupted fixture')
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            pair(remote)
            with self.assertRaisesRegex(ValueError, 'preservados para inspeção'):
                receive_files(InterruptedCLI(remote), '/my-files/Trama', local, keep_staging=False)
            staging = list(Path(local).glob('.trama-proton-recebido-*'))
            self.assertEqual(len(staging), 1)
            self.assertEqual([path.name for path in staging[0].iterdir()], ['unexpected-user.txt'])
            self.assertEqual((staging[0] / 'unexpected-user.txt').read_text(), 'preserve')

    def test_transfers_allow_ten_minutes_but_help_and_listing_remain_bounded(self):
        process = MagicMock(returncode=0)
        process.communicate.return_value = ('[]', '')
        with patch('proton_transfer.subprocess.Popen', return_value=process):
            cli = BackgroundCLI('proton-drive')
            cli.upload_file(Path('snapshot.zip'), '/my-files/Trama')
            process.communicate.assert_called_with(timeout=600)
            cli.download_file('/my-files/Trama/snapshot.zip', Path('local'))
            process.communicate.assert_called_with(timeout=600)
            cli.call('filesystem', 'download', '--help', capture=True)
            process.communicate.assert_called_with(timeout=60)
            cli.names('/my-files/Trama')
            process.communicate.assert_called_with(timeout=60)

    def test_shutdown_cancels_an_active_long_transfer_without_waiting_for_timeout(self):
        started, killed = threading.Event(), threading.Event()
        process = MagicMock(returncode=None)
        process.poll.return_value = None
        def communicate(timeout):
            self.assertEqual(timeout, 600)
            started.set()
            if not killed.wait(2):
                raise AssertionError('shutdown did not cancel transfer')
            process.returncode = 1
            return '', 'stopped'
        process.communicate.side_effect = communicate
        process.kill.side_effect = killed.set
        errors = []
        cli = BackgroundCLI('proton-drive')
        def download():
            try:
                cli.download_file('/my-files/Trama/snapshot.zip', Path('local'))
            except Exception as error:
                errors.append(error)
        with patch('proton_transfer.subprocess.Popen', return_value=process):
            thread = threading.Thread(target=download)
            thread.start()
            self.assertTrue(started.wait(1))
            cli.close()
            thread.join(timeout=1)
        self.assertFalse(thread.is_alive())
        process.kill.assert_called_once()
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], ValueError)

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
