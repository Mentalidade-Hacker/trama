import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import launch_trama as L
import updater as U
from test_updater import make_release


class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.base = make_release(self.root / 'Trama')
        self.state = U.ensure_state(self.base)

    def candidate(self, version='0.11'):
        root = make_release(U.release_path(self.state, version), version)
        U.atomic_json(self.state / 'pending.json', {'version': version})
        return root

    def test_installation_lock_prevents_second_launcher(self):
        with L.InstallationLock(self.state), self.assertRaises(U.UpdateError):
            with L.InstallationLock(self.state):
                pass
        with L.InstallationLock(self.state):
            pass

    def test_successful_health_commits_current_keeps_previous_and_passes_arguments(self):
        candidate = self.candidate()
        def child(root, base, args, health=None, token=None, on_started=None):
            self.assertEqual(root, candidate)
            self.assertEqual(base, self.base)
            self.assertEqual(args, ['--port', '12345', '--no-browser'])
            self.assertIsNone(U.pointer(self.state, 'current'))
            on_started()
            return 0, True
        with patch.object(L, 'run_child', side_effect=child):
            self.assertEqual(L.launch(self.base, ['--port', '12345', '--no-browser']), 0)
        self.assertEqual(U.pointer(self.state, 'current'), '0.11')
        self.assertEqual(U.read_json(self.state / 'previous.json'), {'version': '0.10', 'base': True})
        self.assertIsNone(U.pointer(self.state, 'pending'))
        self.assertTrue((self.base / 'server.py').exists())

    def test_failed_boot_rolls_back_without_moving_data_or_dictionary(self):
        self.candidate()
        data = self.root / 'profile'
        data.mkdir()
        (data / 'trama.db').write_bytes(b'notes')
        dictionary = self.base / 'resources/dictionary.sqlite'
        dictionary.write_bytes(b'dictionary')
        with patch.object(L, 'run_child', side_effect=[(1, False), (0, True)]) as run:
            self.assertEqual(L.launch(self.base, ['--data-dir', str(data)]), 0)
        self.assertEqual(run.call_args_list[1].args[0], self.base)
        self.assertIsNone(U.pointer(self.state, 'current'))
        self.assertEqual(U.read_json(self.state / 'failure.json')['version'], '0.11')
        self.assertEqual((data / 'trama.db').read_bytes(), b'notes')
        self.assertEqual(dictionary.read_bytes(), b'dictionary')

    def test_failed_activation_keeps_current_release_as_fallback(self):
        old = make_release(U.release_path(self.state, '0.11'), '0.11')
        U.atomic_json(self.state / 'current.json', {'version': '0.11'})
        self.candidate('0.12')
        with patch.object(L, 'run_child', side_effect=[(1, False), (0, True)]) as run:
            L.launch(self.base, [])
        self.assertEqual(run.call_args_list[1].args[0], old)
        self.assertEqual(U.pointer(self.state, 'current'), '0.11')

    def test_failed_diagnostic_write_does_not_downgrade_fallback_to_base(self):
        old = make_release(U.release_path(self.state, '0.11'), '0.11')
        U.atomic_json(self.state / 'current.json', {'version': '0.11'})
        self.candidate('0.12')
        real_write = U.atomic_json
        def write(path, value):
            if path.name == 'failure.json':
                raise OSError('disk full')
            return real_write(path, value)
        with patch.object(L, 'atomic_json', side_effect=write), patch.object(L, 'run_child', side_effect=[(1, False), (0, True)]) as run:
            self.assertEqual(L.launch(self.base, []), 0)
        self.assertEqual(run.call_args_list[1].args[0], old)

    def test_manual_reinstall_newer_base_wins_over_old_active_and_pending(self):
        make_release(self.base, '0.13')
        make_release(U.release_path(self.state, '0.11'), '0.11')
        U.atomic_json(self.state / 'current.json', {'version': '0.11'})
        self.candidate('0.12')
        with patch.object(L, 'run_child', return_value=(0, True)) as run:
            L.launch(self.base, [])
        self.assertEqual(run.call_args.args[0], self.base)
        self.assertIsNone(U.pointer(self.state, 'pending'))

    def test_corrupt_pending_or_state_never_blocks_installed_app(self):
        for name in ('pending', 'booting', 'current'):
            with self.subTest(name=name):
                target = self.state / (name + '.json')
                target.write_text('{partial')
                with patch.object(L, 'run_child', return_value=(0, True)) as run:
                    self.assertEqual(L.launch(self.base, []), 0)
                run.assert_called_once()
                self.assertEqual(run.call_args.args[0], self.base)
                target.unlink()

    def test_tampered_candidate_never_executes(self):
        candidate = self.candidate()
        (candidate / 'server.py').write_bytes(b'print("changed")')
        with patch.object(L, 'run_child', return_value=(0, True)) as run:
            L.launch(self.base, [])
        run.assert_called_once()
        self.assertEqual(run.call_args.args[0], self.base)

    def test_interrupted_activation_does_not_promote_unconfirmed_release(self):
        self.candidate()
        (self.state / 'pending.json').unlink()
        U.atomic_json(self.state / 'booting.json', {'version': '0.11', 'previousVersion': '0.10'})
        with patch.object(L, 'run_child', return_value=(0, True)) as run:
            L.launch(self.base, [])
        self.assertEqual(run.call_args.args[0], self.base)
        self.assertIsNone(U.pointer(self.state, 'current'))
        self.assertEqual(U.read_json(self.state / 'failure.json')['version'], '0.11')

    def test_current_commit_failure_stops_candidate_and_reopens_previous(self):
        self.candidate()
        real_write = U.atomic_json
        def write(path, value):
            if path.name == 'current.json':
                raise OSError('disk unavailable')
            return real_write(path, value)
        calls = []
        def child(root, base, args, health=None, token=None, on_started=None):
            calls.append(root)
            if on_started:
                on_started()
            return 0, True
        with patch.object(L, 'atomic_json', side_effect=write), patch.object(L, 'run_child', side_effect=child):
            self.assertEqual(L.launch(self.base, []), 0)
        self.assertEqual(calls[-1], self.base)
        self.assertIsNone(U.pointer(self.state, 'current'))

    def test_environment_reuses_dictionary_and_never_redirects_profile(self):
        with patch.dict(os.environ, {}, clear=True):
            env = L.child_environment(self.base)
        self.assertEqual(env['TRAMA_APP_ROOT'], str(self.base))
        self.assertEqual(env['TRAMA_DICTIONARY_PATH'], str(self.base / 'resources/dictionary.sqlite'))
        self.assertEqual(env['TRAMA_LAUNCHED'], '1')
        self.assertNotIn('XDG_DATA_HOME', env)
        self.assertNotIn('TRAMA_TRANSLATION_HOME', env)

    def test_real_child_health_handshake_and_exitcode(self):
        code = b'import os,json,pathlib,sys,time\np=pathlib.Path(os.environ["TRAMA_UPDATE_HEALTH_FILE"])\np.write_text(json.dumps({"token":os.environ["TRAMA_UPDATE_HEALTH_TOKEN"]}))\nwhile not p.with_suffix(".ack").exists(): time.sleep(0.01)\nsys.exit(7)\n'
        (self.base / 'server.py').write_bytes(code)
        health = self.state / '.started-test.json'
        confirmed = []
        def confirm():
            confirmed.append(True)
            health.with_suffix('.ack').write_text('confirmed')
        result = L.run_child(self.base, self.base, [], health, 'a' * 32, confirm, timeout=10)
        self.assertEqual(result, (7, True))
        self.assertEqual(confirmed, [True])
        self.assertFalse(health.exists())

    def test_child_already_dead_is_not_accepted_even_with_health_marker(self):
        from unittest.mock import MagicMock
        health = self.state / '.started-dead.json'
        U.atomic_json(health, {'token': 'a' * 32})
        child = MagicMock()
        child.poll.return_value = 7
        with patch.object(L.subprocess, 'Popen', return_value=child):
            result = L.run_child(self.base, self.base, [], health, 'a' * 32, lambda: self.fail('dead child promoted'))
        self.assertEqual(result, (7, False))

    def test_real_child_timeout_terminates_before_fallback(self):
        (self.base / 'server.py').write_text('import time\ntime.sleep(10)\n')
        result = L.run_child(self.base, self.base, [], self.state / '.started-test.json', 'a' * 32, timeout=0.1)
        self.assertEqual(result, (1, False))

    def test_explicit_interrupt_does_not_restart_previous_program(self):
        self.candidate()
        with patch.object(L, 'run_child', return_value=(130, False)) as run:
            self.assertEqual(L.launch(self.base, []), 130)
        run.assert_called_once()


if __name__ == '__main__':
    unittest.main()
