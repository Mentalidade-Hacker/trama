import os
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
from install_windows import copy_program, install, ps_literal


class InstallerTests(unittest.TestCase):
    def fixture(self, root):
        source = root / 'Source with spaces'
        (source / 'web').mkdir(parents=True)
        (source / 'web' / 'index.html').write_text('new web')
        for name in ('server.py', 'learning_drafts.py', 'full_backup.py', 'future_module.py', 'launch_trama.py', 'updater.py', 'start.sh', 'start.cmd', 'install.sh'):
            (source / name).write_text(f'new {name}')
        (source / 'app-release.json').write_text('{"schema":1,"version":"0.10"}')
        (source / 'resources').mkdir()
        (source / 'resources' / 'dictionary.sqlite').write_bytes(b'dictionary fixture')
        return source

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
            (source/'server.py').write_text('# test');(source/'web'/'index.html').write_text('test')
            with patch('install_windows.subprocess.run') as run:
                install(source,root/'Local $space',root/'Roaming')
            args=run.call_args.args[0]
            self.assertEqual(args[:4],['powershell.exe','-NoProfile','-NonInteractive','-EncodedCommand'])
            self.assertTrue(run.call_args.kwargs['check'])

    def test_complete_program_and_manifest_are_copied_but_source_data_and_updater_state_are_not(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=self.fixture(root);destination=root/'Installed app'
            (source/'trama.db').write_bytes(b'personal graph')
            (source/'credentials.json').write_text('secret')
            (source/'.trama-updates').mkdir();(source/'.trama-updates'/'state.json').write_text('source state')
            sibling=root/'.Installed app-updates';sibling.mkdir();(sibling/'state.json').write_text('keep installed state')
            copy_program(source,destination)
            for name in ('learning_drafts.py','full_backup.py','future_module.py','launch_trama.py','updater.py','app-release.json'):
                self.assertEqual((destination/name).read_bytes(),(source/name).read_bytes())
            self.assertFalse((destination/'trama.db').exists());self.assertFalse((destination/'credentials.json').exists())
            self.assertFalse((destination/'.trama-updates').exists())
            self.assertEqual((sibling/'state.json').read_text(),'keep installed state')
            copy_program(source,destination)
            self.assertEqual((sibling/'state.json').read_text(),'keep installed state')

    def test_failed_preparation_keeps_existing_program_and_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=self.fixture(root);destination=root/'app';destination.mkdir()
            (destination/'server.py').write_text('old server');(root/'trama.db').write_bytes(b'notes')
            with patch('install_windows.shutil.copy2',side_effect=OSError('disk full')),self.assertRaises(OSError):
                copy_program(source,destination)
            self.assertEqual((destination/'server.py').read_text(),'old server')
            self.assertEqual((root/'trama.db').read_bytes(),b'notes')
            self.assertEqual(list(root.glob('.app-install-*')),[])

    def test_copy_cli_installs_every_local_module_required_by_the_real_server(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=self.fixture(root);destination=root/'Installed real modules'
            program=Path(__file__).resolve().parents[1]
            for module in program.glob('*.py'):
                shutil.copy2(module,source/module.name)
            copied=subprocess.run([sys.executable,str(source/'install_windows.py'),'--copy-program',str(source),str(destination)],capture_output=True,text=True,timeout=30)
            self.assertEqual(copied.returncode,0,copied.stdout+copied.stderr)
            imported=subprocess.run([sys.executable,'-c','import server; import learning_drafts; import full_backup'],cwd=destination,capture_output=True,text=True,timeout=30)
            self.assertEqual(imported.returncode,0,imported.stdout+imported.stderr)

    def test_failed_activation_rolls_back_the_whole_previous_program(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=self.fixture(root);destination=root/'app';destination.mkdir()
            (destination/'server.py').write_text('old server')
            original=os.replace
            def fail_activation(before,after):
                if Path(before).name.startswith('.app-install-stage-'):
                    raise PermissionError('activation denied')
                return original(before,after)
            with patch('install_windows.os.replace',side_effect=fail_activation),self.assertRaises(PermissionError):
                copy_program(source,destination)
            self.assertEqual((destination/'server.py').read_text(),'old server')
            self.assertFalse((destination/'future_module.py').exists())
            self.assertEqual(list(root.glob('.app-install-*')),[])

    def test_unexpected_data_inside_program_is_never_replaced(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=self.fixture(root);destination=root/'app';destination.mkdir()
            (destination/'server.py').write_text('old');(destination/'trama.db').write_bytes(b'personal notes')
            with self.assertRaisesRegex(ValueError,'Nada foi substituído'):
                copy_program(source,destination)
            self.assertEqual((destination/'trama.db').read_bytes(),b'personal notes')
            self.assertEqual((destination/'server.py').read_text(),'old')

    def test_unknown_notes_and_nested_graphs_are_preserved(self):
        for name in ('personal.md','web/trama.db'):
            with self.subTest(name=name),tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);source=self.fixture(root);destination=root/'app'
                (destination/'web').mkdir(parents=True)
                personal=destination/name;personal.write_text('personal content')
                with self.assertRaisesRegex(ValueError,'Nada foi substituído'):
                    copy_program(source,destination)
                self.assertEqual(personal.read_text(),'personal content')

    @unittest.skipUnless(os.name=='nt','Windows junction regression')
    def test_windows_junctions_cannot_redirect_program_installation(self):
        import _winapi
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=self.fixture(root);outside=root/'outside';outside.mkdir();(outside/'keep.txt').write_text('keep')
            destination=root/'app'
            try:
                _winapi.CreateJunction(str(outside),str(destination))
            except OSError as error:
                self.skipTest(f'Junction unavailable: {error}')
            try:
                with self.assertRaisesRegex(ValueError,'link'):
                    copy_program(source,destination)
                self.assertEqual((outside/'keep.txt').read_text(),'keep')
            finally:
                destination.rmdir()

    @unittest.skipUnless(os.name=='nt','Windows launcher regression')
    def test_windows_launcher_passes_quoted_arguments_and_preserves_failure_exit_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);app=root/'App with spaces';app.mkdir()
            shutil.copy2(Path(__file__).resolve().parents[1]/'start.cmd',app/'start.cmd')
            (app/'launch_trama.py').write_text('import json,sys\nfrom pathlib import Path\nPath(__file__).with_name("args.json").write_text(json.dumps(sys.argv[1:]))\nsys.exit(7)\n')
            notes=root/'Notes with spaces'
            command=f'"{os.environ.get("COMSPEC","cmd.exe")}" /d /s /c ""{app / "start.cmd"}" --data-dir "{notes}" --no-browser"'
            result=subprocess.run(command,input='\n',capture_output=True,text=True,timeout=20)
            self.assertEqual(result.returncode,7,result.stdout+result.stderr)
            self.assertEqual(json.loads((app/'args.json').read_text()),['--data-dir',str(notes),'--no-browser'])

    def test_linked_source_and_destination_are_rejected_without_following_them(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=self.fixture(root);outside=root/'outside';outside.mkdir();secret=outside/'secret.py';secret.write_text('private')
            try:
                (source/'linked.py').symlink_to(secret)
            except OSError as error:
                self.skipTest(f'Symbolic links unavailable: {error}')
            with self.assertRaisesRegex(ValueError,'links'):
                copy_program(source,root/'app')
            (source/'linked.py').unlink()
            (root/'app').symlink_to(outside,target_is_directory=True)
            with self.assertRaisesRegex(ValueError,'link'):
                copy_program(source,root/'app')
            self.assertEqual(secret.read_text(),'private')

    def test_actual_bash_installer_copies_new_modules_and_preserves_data_with_spaces(self):
        if os.name=='nt':
            bash=Path(os.environ.get('ProgramFiles','C:/Program Files'))/'Git'/'bin'/'bash.exe'
            if not bash.is_file():self.skipTest('Git Bash unavailable on Windows')
        else:
            bash=shutil.which('bash')
            if not bash:self.skipTest('Bash unavailable')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=self.fixture(root)
            program=Path(__file__).resolve().parents[1]
            for name in ('install.sh','install_windows.py','start.sh'):
                shutil.copy2(program/name,source/name)
            (source/'launch_trama.py').write_text('import json,sys\nfrom pathlib import Path\nPath(__file__).with_name("args.json").write_text(json.dumps(sys.argv[1:]))\nsys.exit(7)\n')
            # Exercise the real shell entry point with fixture assets, not the
            # full dictionary, and an explicit Python shim on Windows Git Bash.
            tools=root/'tools';tools.mkdir();shim=tools/'python3'
            shim.write_text('#!/usr/bin/env bash\nexec "'+Path(sys.executable).as_posix()+'" "$@"\n',encoding='utf-8',newline='\n')
            shim.chmod(0o755)
            home=root/'Home with spaces';data=root/'Data with spaces';home.mkdir();(data/'trama').mkdir(parents=True)
            (data/'trama'/'trama.db').write_bytes(b'keep graph')
            env={**os.environ,'HOME':home.as_posix(),'XDG_DATA_HOME':data.as_posix(),'PATH':str(tools)+os.pathsep+os.environ['PATH']}
            result=subprocess.run([str(bash),str(source/'install.sh')],env=env,capture_output=True,text=True,timeout=30)
            if os.name=='nt' and 'NtCreateDirectoryObject' in result.stderr and '0xC0000022' in result.stderr:
                self.skipTest('This Windows host blocks Git Bash initialization; the same test runs on Linux CI.')
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            destination=data/'trama'/'app'
            for name in ('learning_drafts.py','full_backup.py','future_module.py','launch_trama.py','updater.py','app-release.json'):
                self.assertTrue((destination/name).is_file(),name)
            self.assertEqual((data/'trama'/'trama.db').read_bytes(),b'keep graph')
            self.assertIn('Exec="',(data/'applications'/'trama.desktop').read_text())
            notes=root/'Notes with spaces'
            launched=subprocess.run([str(bash),str(destination/'start.sh'),'--data-dir',str(notes),'--no-browser'],env=env,capture_output=True,text=True,timeout=30)
            self.assertEqual(launched.returncode,7,launched.stdout+launched.stderr)
            self.assertEqual(json.loads((destination/'args.json').read_text()),['--data-dir',str(notes),'--no-browser'])


if __name__=='__main__':unittest.main()
