"""Exercise real Windows entry points without a Python installation on PATH."""
import base64
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


PROGRAM = Path(__file__).resolve().parents[1]
HELPERS = {
    'start.cmd': 'launch_trama.py',
    'setup-writing.cmd': 'setup_proofreader.py',
    'setup-translation.cmd': 'setup_translation.py',
    'proton-transfer.ps1': 'proton_transfer.py',
}
STUB_SOURCE = r'''
using System;
using System.IO;
using System.Reflection;
using System.Text;
class PythonStub {
    static int Main(string[] args) {
        // The legacy launcher checks the interpreter version before execution.
        if (Array.IndexOf(args, "-c") >= 0) return 0;
        string[] lines = new string[args.Length + 1];
        lines[0] = Assembly.GetExecutingAssembly().Location;
        for (int i = 0; i < args.Length; i++)
            lines[i + 1] = Convert.ToBase64String(Encoding.UTF8.GetBytes(args[i]));
        File.WriteAllLines(Environment.GetEnvironmentVariable("TRAMA_HELPER_TEST_OUTPUT"), lines, new UTF8Encoding(false));
        return Int32.Parse(Environment.GetEnvironmentVariable("TRAMA_HELPER_TEST_EXIT"));
    }
}
'''


@unittest.skipUnless(os.name == 'nt', 'Native Windows helper regression')
class BundledHelperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        windows = Path(os.environ.get('SystemRoot', r'C:\Windows'))
        compiler = next((windows / 'Microsoft.NET' / architecture / 'v4.0.30319' / 'csc.exe'
                         for architecture in ('Framework64', 'Framework')
                         if (windows / 'Microsoft.NET' / architecture / 'v4.0.30319' / 'csc.exe').is_file()), None)
        if compiler is None:
            raise unittest.SkipTest('Windows .NET Framework compiler unavailable')
        cls.fixture = tempfile.TemporaryDirectory(prefix='trama-helper-stub-')
        cls.addClassCleanup(cls.fixture.cleanup)
        directory = Path(cls.fixture.name)
        source = directory / 'PythonStub.cs'
        source.write_text(STUB_SOURCE, encoding='utf-8')
        cls.stub = directory / 'python.exe'
        compiled = subprocess.run([str(compiler), '/nologo', '/target:exe', '/out:' + str(cls.stub), str(source)],
                                  capture_output=True, text=True, timeout=30)
        if compiled.returncode:
            raise AssertionError(compiled.stdout + compiled.stderr)
        cls.native_stub = directory / 'Trama.exe'
        compiled = subprocess.run([str(compiler), '/nologo', '/target:winexe', '/out:' + str(cls.native_stub), str(source)],
                                  capture_output=True, text=True, timeout=30)
        if compiled.returncode:
            raise AssertionError(compiled.stdout + compiled.stderr)
        cls.system32 = windows / 'System32'
        cls.cmd = cls.system32 / 'cmd.exe'
        cls.powershell = cls.system32 / 'WindowsPowerShell' / 'v1.0' / 'powershell.exe'

    def application(self, directory):
        app = directory / 'App with spaces !'
        app.mkdir(parents=True)
        for helper, script in HELPERS.items():
            shutil.copy2(PROGRAM / helper, app / helper)
            (app / script).write_text('# Stub interpreter records this path.\n')
        (app / 'server.py').write_text('# Application base marker.\n')
        return app

    def runtime(self, app):
        target = app.parent / 'runtime' / 'python.exe'
        target.parent.mkdir(exist_ok=True)
        shutil.copy2(self.stub, target)
        return target

    def invoke(self, helper, app, output, *, base=None, global_python=None, code=37):
        env = dict(os.environ)
        env.pop('TRAMA_APP_ROOT', None)
        env['PATH'] = str(self.system32)
        self.assertIsNone(shutil.which('python', path=env['PATH']))
        self.assertIsNone(shutil.which('py', path=env['PATH']))
        if global_python is not None:
            env['PATH'] = str(global_python.parent) + os.pathsep + env['PATH']
        if base is not None:
            env['TRAMA_APP_ROOT'] = str(base)
        env['TRAMA_HELPER_TEST_OUTPUT'] = str(output)
        env['TRAMA_HELPER_TEST_EXIT'] = str(code)
        output.unlink(missing_ok=True)
        spaced = str(app.parent / 'Notes with spaces !')
        if helper.endswith('.ps1'):
            passed = ['upload', spaced, 'Remote folder with spaces', '-Cli', str(app.parent / 'Proton CLI.exe')]
            expected = ['upload', spaced, 'Remote folder with spaces', '--cli', str(app.parent / 'Proton CLI.exe')]
            command = [str(self.powershell), '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                       '-File', str(app / helper), *passed]
        else:
            expected = ['--data-dir' if helper == 'start.cmd' else '--directory', spaced, '--check']
            # Keep quoted paths, including literal !, intact in the invoking shell.
            arguments = subprocess.list2cmdline(expected)
            command = f'"{self.cmd}" /d /v:off /s /c ""{app / helper}" {arguments}"'
        result = subprocess.run(command, env=env, cwd=app, input='\n', capture_output=True, text=True, timeout=25)
        self.assertEqual(result.returncode, code, result.stdout + result.stderr)
        self.assertTrue(output.is_file(), result.stdout + result.stderr)
        lines = output.read_text(encoding='utf-8-sig').splitlines()
        actual = [base64.b64decode(line).decode('utf-8') for line in lines[1:]]
        return Path(lines[0]).resolve(), actual, expected

    def assert_bundled(self, helper, app, runtime, output, **options):
        used, actual, expected = self.invoke(helper, app, output, **options)
        self.assertEqual(used, runtime.resolve())
        self.assertEqual(actual[:3], ['-E', '-s', '-B'])
        self.assertEqual(Path(actual[3]).resolve(), (app / HELPERS[helper]).resolve())
        self.assertEqual(actual[4:], expected)

    def test_each_helper_uses_private_python_without_python_on_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); app = self.application(root); runtime = self.runtime(app)
            for helper in HELPERS:
                with self.subTest(helper=helper):
                    self.assert_bundled(helper, app, runtime, root / 'arguments.txt')

    def test_updated_release_uses_valid_base_runtime_before_local_or_global(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); app = self.application(root / 'Downloaded release')
            self.runtime(app)
            base = self.application(root / 'Installed Trama'); runtime = self.runtime(base)
            global_python = root / 'Global Python' / 'python.exe'; global_python.parent.mkdir()
            shutil.copy2(self.stub, global_python)
            for helper in HELPERS:
                with self.subTest(helper=helper):
                    self.assert_bundled(helper, app, runtime, root / 'arguments.txt',
                                        base=base, global_python=global_python)

    def test_invalid_base_override_falls_back_to_local_runtime(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); app = self.application(root / 'Installed Trama'); runtime = self.runtime(app)
            invalid = root / 'Not a Trama installation' / 'app'; invalid.mkdir(parents=True)
            self.runtime(invalid)
            for helper in HELPERS:
                with self.subTest(helper=helper):
                    self.assert_bundled(helper, app, runtime, root / 'arguments.txt', base=invalid)

    def test_missing_base_runtime_falls_back_to_local_runtime(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); app = self.application(root / 'Installed Trama'); runtime = self.runtime(app)
            base = self.application(root / 'Previous installation')
            for helper in HELPERS:
                with self.subTest(helper=helper):
                    self.assert_bundled(helper, app, runtime, root / 'arguments.txt', base=base, code=0)

    def test_legacy_zip_still_uses_global_python_and_preserves_arguments_and_exit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); app = self.application(root / 'Source ZIP')
            global_python = root / 'Global Python' / 'python.exe'; global_python.parent.mkdir()
            shutil.copy2(self.stub, global_python)
            for helper in HELPERS:
                with self.subTest(helper=helper):
                    used, actual, expected = self.invoke(helper, app, root / 'arguments.txt', global_python=global_python)
                    self.assertEqual(used, global_python.resolve())
                    self.assertEqual(Path(actual[0]).resolve(), (app / HELPERS[helper]).resolve())
                    self.assertEqual(actual[1:], expected)

    def test_directory_named_python_exe_is_not_used_as_an_executable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); app = self.application(root / 'Source ZIP')
            base = self.application(root / 'Previous installation')
            for candidate in (app, base):
                (candidate.parent / 'runtime' / 'python.exe').mkdir(parents=True)
            global_python = root / 'Global Python' / 'python.exe'; global_python.parent.mkdir()
            shutil.copy2(self.stub, global_python)
            for helper in HELPERS:
                with self.subTest(helper=helper):
                    used, actual, expected = self.invoke(helper, app, root / 'arguments.txt',
                                                         base=base, global_python=global_python)
                    self.assertEqual(used, global_python.resolve())
                    self.assertEqual(actual[1:], expected)

    def test_setup_helpers_prefer_native_host_and_wait_for_its_exit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); app = self.application(root / 'Installed Trama')
            self.runtime(app)
            native = app.parent / 'Trama.exe'; shutil.copy2(self.native_stub, native)
            global_python = root / 'Global Python' / 'python.exe'; global_python.parent.mkdir()
            shutil.copy2(self.stub, global_python)
            for helper, flag in (('setup-writing.cmd', '--setup-writing'), ('setup-translation.cmd', '--setup-translation')):
                with self.subTest(helper=helper):
                    used, actual, expected = self.invoke(helper, app, root / 'arguments.txt', global_python=global_python)
                    self.assertEqual(used, native.resolve())
                    self.assertEqual(actual, [flag, *expected])

    def test_setup_from_updated_release_uses_host_of_valid_base(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); app = self.application(root / 'Downloaded release')
            self.runtime(app)
            shutil.copy2(self.native_stub, app.parent / 'Trama.exe')
            base = self.application(root / 'Installed Trama')
            native = base.parent / 'Trama.exe'; shutil.copy2(self.native_stub, native)
            for helper, flag in (('setup-writing.cmd', '--setup-writing'), ('setup-translation.cmd', '--setup-translation')):
                with self.subTest(helper=helper):
                    used, actual, expected = self.invoke(helper, app, root / 'arguments.txt', base=base, code=0)
                    self.assertEqual(used, native.resolve())
                    self.assertEqual(actual, [flag, *expected])

    def test_setup_ignores_native_host_beside_invalid_base(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); app = self.application(root / 'Installed Trama'); runtime = self.runtime(app)
            invalid = root / 'Other folder' / 'app'; invalid.mkdir(parents=True)
            shutil.copy2(self.native_stub, invalid.parent / 'Trama.exe')
            for helper in ('setup-writing.cmd', 'setup-translation.cmd'):
                with self.subTest(helper=helper):
                    self.assert_bundled(helper, app, runtime, root / 'arguments.txt', base=invalid)


if __name__ == '__main__':
    unittest.main()
