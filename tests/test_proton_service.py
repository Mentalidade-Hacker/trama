import io
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from proton_service import ProtonService, sign_in_url


class ProtonServiceTests(unittest.TestCase):
    def service(self):
        return ProtonService(SimpleNamespace(config={}, worker=MagicMock()))

    def process(self, code=0):
        process = MagicMock()
        process.stdout = io.StringIO('')
        process.wait.return_value = code
        process.poll.return_value = code
        return process

    def test_failed_process_launch_returns_clean_error_and_does_not_stay_waiting(self):
        service = self.service()
        with patch('proton_service.find_cli', return_value='proton-drive'), \
                patch('proton_service.subprocess.Popen', side_effect=OSError('sensitive-account-path')):
            with self.assertRaisesRegex(ValueError, 'Não foi possível abrir') as caught:
                service.login({})
        self.assertNotIn('sensitive-account-path', str(caught.exception))
        self.assertEqual(service.result['loginState'], 'error')
        service.sync.worker.wake.assert_not_called()

    def test_read_failure_finishes_with_error_and_removes_signin_url(self):
        service, process = self.service(), self.process()
        process.poll.return_value = None
        process.stdout = MagicMock()
        process.stdout.readline.side_effect = OSError('private-session-detail')
        service.process = process
        service.result = {'loginState': 'waiting', 'signInUrl': 'https://account.proton.me/test'}
        service._finish(process)
        self.assertEqual(service.result['loginState'], 'error')
        self.assertNotIn('signInUrl', service.result)
        self.assertNotIn('private-session-detail', str(service.result))
        process.kill.assert_called_once()
        process.stdout.close.assert_called_once()
        service.sync.worker.wake.assert_not_called()

    def test_timeout_wins_over_late_success_and_never_wakes_sync(self):
        service, process = self.service(), self.process()
        process.poll.return_value = None
        service.process = process
        service._timeout(process)
        process.poll.return_value = 0
        service._finish(process)
        self.assertEqual(service.result['loginState'], 'error')
        self.assertIn('tempo', service.result['message'])
        service.sync.worker.wake.assert_not_called()
        process.kill.assert_called_once()

    def test_close_wins_over_late_success_and_removes_signin_url(self):
        service, process = self.service(), self.process()
        service.process = process
        service.result = {'loginState': 'waiting', 'signInUrl': 'https://account.proton.me/test'}
        service.close()
        service._finish(process)
        self.assertEqual(service.result['loginState'], 'cancelled')
        self.assertNotIn('signInUrl', service.result)
        service.sync.worker.wake.assert_not_called()

    def test_repeated_login_during_finishing_thread_does_not_start_second_process(self):
        service = self.service()
        service.process = self.process()
        service.thread = MagicMock()
        service.thread.is_alive.return_value = True
        service.result = {'loginState': 'waiting', 'message': 'Conclua a entrada.'}
        with patch('proton_service.find_cli', return_value='proton-drive'), \
                patch('proton_service.subprocess.Popen') as launch:
            self.assertEqual(service.login({})['loginState'], 'waiting')
        launch.assert_not_called()

    def test_stale_login_thread_cannot_overwrite_new_attempt_or_wake_worker(self):
        service, old_process = self.service(), self.process()
        service.process = self.process()
        service.result = {'loginState': 'waiting', 'message': 'Nova tentativa'}
        service._finish(old_process)
        self.assertEqual(service.result, {'loginState': 'waiting', 'message': 'Nova tentativa'})
        service.sync.worker.wake.assert_not_called()

    def test_signin_url_rejects_hidden_control_characters(self):
        for value in ('https://account.proton.me/test\n', 'https://account.proton.me/\tcode',
                      ' https://account.proton.me/test', 'https://account.proton.me/test\x7f'):
            self.assertIsNone(sign_in_url(value))


if __name__ == '__main__':
    unittest.main()
