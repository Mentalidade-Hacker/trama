import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import build_windows as package


class WindowsPackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'source with spaces'
        self.runtime = self.root / 'official runtime with spaces'
        self.source.mkdir()
        self.runtime.mkdir()
        files = {}
        for name in package.REQUIRED_APP | {'resources/README.md', 'web/vendor/library/LICENSE.txt'}:
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            raw = ('# public ' + name).encode()
            path.write_bytes(raw)
            files[name] = {'size': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        self.manifest = {'schema': 1, 'repository': 'Mentalidade-Hacker/trama', 'version': '0.10.1', 'files': files}
        self.save_manifest()
        (self.source / 'resources/dictionary.sqlite').write_bytes(b'SQLite format 3\0dictionary fixture')
        for name in package.REQUIRED_RUNTIME | {'python314.dll', 'Lib/json/__init__.py'}:
            path = self.runtime / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'official runtime fixture')
        (self.source / 'windows').mkdir()
        for name in ('TramaLauncher.cs', 'trama.iss'):
            (self.source / 'windows' / name).write_text('compiler fixture')
        self.iscc = self.root / 'Inno Setup' / 'ISCC.exe'
        self.iscc.parent.mkdir()
        self.iscc.write_bytes(b'tool')
        self.csc = self.root / 'csc.exe'
        self.csc.write_bytes(b'tool')
        self.details = {'version': '3.14.10', 'bits': 64, 'platform': 'win32'}

    def save_manifest(self):
        (self.source / 'app-release.json').write_text(json.dumps(self.manifest))

    def prepare(self):
        return package.prepare_payload(self.source, self.runtime, self.root / 'stage', '0.10.1', self.details)

    def test_manifest_modules_dictionary_licenses_and_runtime_are_complete_without_personal_state(self):
        for name in ('trama.db', 'credentials.json', '.env'):
            (self.source / name).write_bytes(b'private')
        for name in ('data', '.app-updates', '.git'):
            (self.source / name).mkdir()
            (self.source / name / 'private.json').write_bytes(b'private')
        (self.runtime / 'Lib/__pycache__').mkdir()
        (self.runtime / 'Lib/__pycache__/evil.pyc').write_bytes(b'cache')
        result = self.prepare()
        stage = self.root / 'stage'
        for name in package.REQUIRED_APP:
            self.assertEqual((stage / 'app' / name).read_bytes(), (self.source / name).read_bytes())
        self.assertEqual((stage / 'app/resources/dictionary.sqlite').read_bytes(), (self.source / 'resources/dictionary.sqlite').read_bytes())
        self.assertTrue((stage / 'runtime/LICENSE.txt').is_file())
        self.assertTrue((stage / 'runtime/Lib/venv/__init__.py').is_file())
        self.assertFalse((stage / 'runtime/Lib/__pycache__').exists())
        self.assertFalse((stage / 'app/data').exists())
        self.assertFalse((stage / 'app/.app-updates').exists())
        self.assertFalse((stage / 'app/credentials.json').exists())
        self.assertGreater(result['runtimeFiles'], 4)

    def test_manifest_tampering_aborts(self):
        (self.source / 'server.py').write_text('# changed after review')
        with self.assertRaisesRegex(ValueError, 'diverge'):
            self.prepare()

    def test_missing_module_previously_omitted_by_installer_is_rejected(self):
        del self.manifest['files']['full_backup.py']
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'omitiu módulos'):
            self.prepare()

    def test_dictionary_missing_or_invalid_is_rejected(self):
        dictionary = self.source / 'resources/dictionary.sqlite'
        dictionary.unlink()
        with self.assertRaisesRegex(ValueError, 'ausente'):
            self.prepare()
        dictionary.write_bytes(b'not sqlite')
        with self.assertRaisesRegex(ValueError, 'SQLite'):
            self.prepare()

    def test_runtime_license_missing_is_rejected(self):
        (self.runtime / 'LICENSE.txt').unlink()
        with self.assertRaisesRegex(ValueError, 'LICENSE'):
            self.prepare()

    def test_source_links_never_enter_the_installer(self):
        target = self.source / 'server.py'
        original = self.root / 'outside.py'
        target.rename(original)
        try:
            target.symlink_to(original)
        except OSError:
            self.skipTest('Creating symlinks is unavailable in this Windows environment')
        with self.assertRaisesRegex(ValueError, 'link'):
            self.prepare()

    def test_runtime_hidden_state_rejected_and_stage_cannot_overlap_source(self):
        (self.runtime / '.credentials').write_bytes(b'secret')
        with self.assertRaisesRegex(ValueError, 'oculto'):
            self.prepare()
        (self.runtime / '.credentials').unlink()
        with self.assertRaisesRegex(ValueError, 'dentro da origem'):
            package.prepare_payload(self.source, self.runtime, self.source / 'stage', '0.10.1', self.details)

    def test_runtime_probe_is_isolated_and_rejects_32_bit(self):
        calls = []
        def runner(args, **kwargs):
            calls.append((args, kwargs))
            return subprocess.CompletedProcess(args, 0, json.dumps(dict(self.details, bits=32)))
        with self.assertRaisesRegex(ValueError, 'x64'):
            package.probe_runtime(self.runtime, runner)
        self.assertEqual(calls[0][0][1:4], ['-I', '-B', '-c'])
        self.assertTrue(calls[0][1]['check'])

    def test_inventory_covers_directory_boundaries_without_own_or_data_paths(self):
        self.prepare()
        stage = self.root / 'stage'
        (stage / 'Trama.exe').write_bytes(b'MZ')
        inventory = package.write_inventory(stage).read_text().splitlines()
        self.assertIn('app/web/', inventory)
        self.assertIn('app/resources/dictionary.sqlite', inventory)
        self.assertIn('trama.exe', inventory)
        self.assertNotIn('install-files.txt', inventory)
        self.assertFalse(any(name.startswith(('data/', '.app-updates/')) for name in inventory))

    def compiler(self, fail=False):
        calls = []
        def runner(args, **kwargs):
            calls.append(args)
            if '-c' in args:
                return subprocess.CompletedProcess(args, 0, json.dumps(self.details))
            if str(self.csc) == args[0]:
                Path(next(arg[5:] for arg in args if arg.startswith('/out:'))).write_bytes(b'MZlauncher')
            else:
                if fail:
                    raise subprocess.CalledProcessError(1, args)
                output = Path(next(arg[len('/DOutputDir='):] for arg in args if arg.startswith('/DOutputDir=')))
                (output / 'trama-v0.10.1-windows-setup.exe').write_bytes(b'MZinstaller')
            return subprocess.CompletedProcess(args, 0)
        return runner, calls

    def test_builder_uses_argument_lists_preserves_spaces_and_keeps_single_installer(self):
        runner, calls = self.compiler()
        output = self.root / 'release output'
        result = package.build(self.source, self.runtime, self.iscc, self.csc, output, version=self.manifest['version'], work=self.root / 'work', runner=runner)
        self.assertEqual(Path(result['file']).read_bytes(), b'MZinstaller')
        self.assertEqual(len(list(output.iterdir())), 1)
        self.assertEqual(list((self.root / 'work').iterdir()), [])
        self.assertIn('/platform:x64', calls[1])
        self.assertEqual(calls[2][0], str(self.iscc))
        self.assertEqual(calls[2][-1], str(self.source / 'windows/trama.iss'))

    def test_compile_failure_keeps_previous_release_and_cleans_only_new_stage(self):
        runner, _ = self.compiler(fail=True)
        output = self.root / 'output'
        output.mkdir()
        old = output / 'trama-v0.10.1-windows-setup.exe'
        old.write_bytes(b'MZprevious release')
        with self.assertRaises(subprocess.CalledProcessError):
            package.build(self.source, self.runtime, self.iscc, self.csc, output, version=self.manifest['version'], work=self.root / 'work', runner=runner)
        self.assertEqual(old.read_bytes(), b'MZprevious release')
        self.assertEqual(list((self.root / 'work').iterdir()), [])
        self.assertTrue((self.source / 'server.py').is_file())

    def test_inno_contract_does_not_delete_personal_directories_and_requires_safe_preflight(self):
        source = (Path(__file__).resolve().parents[1] / 'windows/trama.iss').read_text(encoding='utf-8')
        self.assertNotIn('[UninstallDelete]', source)
        self.assertNotIn('[InstallDelete]', source)
        self.assertIn('PrivilegesRequired=lowest', source)
        self.assertIn('ExitCode <> 0', source)
        self.assertIn("InstallingName = 'Local\\Trama.Program.Installing'", source)
        self.assertIn('running.lock', source)
        self.assertIn("CompareText(Name, 'logs') = 0", source)
        self.assertIn('--setup-writing', source)
        self.assertIn('--setup-translation', source)
        self.assertIn('CloseApplications=no', source)


if __name__ == '__main__':
    unittest.main()
