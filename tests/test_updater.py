import hashlib
import io
import json
from pathlib import Path
import stat
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import updater as U


def release_files(server=b'pass\n'):
    return {'server.py': server, 'updater.py': b'pass\n', 'launch_trama.py': b'pass\n',
            'web/index.html': b'<html>Trama</html>', 'web/app.js': b'export {};',
            'resources/README.md': b'Bundled dictionary stays in the base installation.'}


def manifest(version='0.11', files=None):
    files = files or release_files()
    return {'schema': 1, 'repository': U.REPOSITORY, 'version': version,
            'files': {name: {'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in files.items()}}


def make_release(root, version='0.10', files=None):
    files = files or release_files()
    root.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    U.atomic_json(root / 'app-release.json', manifest(version, files))
    return root


def make_zip(path, version='0.11', files=None, meta=None, extra=None):
    files = files or release_files()
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            info = zipfile.ZipInfo('trama/' + name)
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(info, data)
        archive.writestr('trama/app-release.json', json.dumps(meta or manifest(version, files)))
        if extra:
            archive.writestr(*extra)
    return path


class UpdaterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.base = make_release(self.root / 'Trama')
        self.state = U.ensure_state(self.base)

    def test_stable_versions_are_strict_and_numerical(self):
        self.assertEqual(U.version_key('0.10'), U.version_key('0.10.0'))
        self.assertGreater(U.version_key('0.10'), U.version_key('0.9.99'))
        for version in ('v0.10', '01.2', '0.10-beta', '../0.10', '', 10, '0.1.2.3', '0.10\n'):
            with self.subTest(version=version), self.assertRaises(U.UpdateError):
                U.version_key(version)

    def test_state_ownership_rejects_another_installation(self):
        U.atomic_json(self.state / 'owner.json', {'schema': 1, 'base': str(self.root / 'Elsewhere')})
        with self.assertRaisesRegex(U.UpdateError, 'outra instalação'):
            U.ensure_state(self.base)

    def test_manifest_rejects_private_paths_and_windows_aliases(self):
        for path in ('../secret.py', '/server.py', 'web/../../x.js', 'web\\app.js', 'web/CON.js', 'web/foo:bar.js',
                     'resources/dictionary.sqlite', 'data/trama.db', '.env', 'web/.env', 'server.py.', 'tests/test.py'):
            with self.subTest(path=path):
                meta = manifest()
                meta['files'][path] = {'size': 0, 'sha256': hashlib.sha256(b'').hexdigest()}
                with self.assertRaises(U.UpdateError):
                    U.validate_manifest(meta)

    def test_manifest_rejects_bool_size_duplicate_case_missing_core_and_oversize(self):
        for mutate in (lambda m: m['files']['server.py'].update(size=True),
                       lambda m: m['files'].update({'SERVER.py': m['files']['server.py']}),
                       lambda m: m['files'].pop('server.py'),
                       lambda m: m['files']['server.py'].update(size=U.MAX_FILE + 1)):
            meta = manifest()
            mutate(meta)
            with self.assertRaises(U.UpdateError):
                U.validate_manifest(meta)

    def test_extract_verifies_every_byte_and_does_not_change_base_or_dictionary(self):
        dictionary = self.base / 'resources/dictionary.sqlite'
        dictionary.write_bytes(b'original dictionary')
        archive = make_zip(self.root / 'update.zip')
        root = U.extract_release(archive, self.state, '0.11')
        self.assertEqual(U.validate_release(root)['version'], '0.11')
        self.assertEqual(dictionary.read_bytes(), b'original dictionary')
        self.assertEqual(U.installed_version(self.base), '0.10')
        self.assertFalse((root / 'resources/dictionary.sqlite').exists())
        self.assertFalse(list((self.state / 'releases').glob('.stage-*')))

    def test_changed_hash_bad_python_and_unlisted_file_never_publish(self):
        for case in ('hash', 'syntax', 'extra'):
            with self.subTest(case=case):
                files = release_files(b'def invalid(:\n' if case == 'syntax' else b'pass\n')
                meta = manifest(files=files)
                if case == 'hash':
                    meta['files']['server.py']['sha256'] = '0' * 64
                archive = make_zip(self.root / (case + '.zip'), files=files, meta=meta,
                                   extra=('trama/extra.py', b'pass') if case == 'extra' else None)
                with self.assertRaises(U.UpdateError):
                    U.extract_release(archive, self.state, '0.11')
                self.assertFalse((self.state / 'releases/0.11').exists())
                self.assertEqual(list((self.state / 'releases').iterdir()), [])

    def test_zip_symlink_and_traversal_rejected_before_extraction(self):
        info = zipfile.ZipInfo('trama/web/redirect.js')
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        for name in (info, 'trama/../outside.py'):
            archive = make_zip(self.root / 'malicious.zip', extra=(name, b'outside'))
            with self.assertRaises(U.UpdateError):
                U.extract_release(archive, self.state, '0.11')
            self.assertFalse((self.root / 'outside.py').exists())

    def test_existing_version_is_immutable(self):
        archive = make_zip(self.root / 'update.zip')
        U.extract_release(archive, self.state, '0.11')
        other = make_zip(self.root / 'different.zip', files=release_files(b'print(1)\n'))
        with self.assertRaisesRegex(U.UpdateError, 'diferente'):
            U.extract_release(other, self.state, '0.11')
        self.assertEqual((U.release_path(self.state, '0.11') / 'server.py').read_bytes(), b'pass\n')

    def test_cached_python_not_allowed_to_bypass_verified_source(self):
        root = U.extract_release(make_zip(self.root / 'update.zip'), self.state, '0.11')
        (root / '__pycache__').mkdir()
        (root / '__pycache__/server.cpython-314.pyc').write_bytes(b'unknown bytecode')
        with self.assertRaisesRegex(U.UpdateError, 'inesperado'):
            U.validate_release(root)

    def test_cancellation_cleans_only_current_stage(self):
        cancel = threading.Event()
        cancel.set()
        keep = self.state / 'releases/keep.txt'
        keep.write_text('keep')
        with self.assertRaises(U.Cancelled):
            U.extract_release(make_zip(self.root / 'update.zip'), self.state, '0.11', cancel)
        self.assertEqual(keep.read_text(), 'keep')
        self.assertFalse(list((self.state / 'releases').glob('.stage-*')))

    def api_payload(self, version='0.11'):
        url = U.RELEASE_PREFIX + 'download/v' + version + '/trama-v' + version + '-update.zip'
        return {'draft': False, 'prerelease': False, 'tag_name': 'v' + version,
                'html_url': U.RELEASE_PREFIX + 'tag/v' + version,
                'assets': [{'name': f'trama-v{version}-update.zip', 'browser_download_url': url,
                            'size': 12, 'digest': 'sha256:' + 'a' * 64}]}

    def test_github_metadata_requires_fixed_repository_stable_asset_and_sha(self):
        with patch.object(U, '_open', return_value=io.BytesIO(json.dumps(self.api_payload()).encode())):
            self.assertEqual(U.latest_release()['asset']['sha256'], 'a' * 64)
        for mutate in (lambda v: v.update(prerelease=True), lambda v: v.update(html_url='https://elsewhere.test'),
                       lambda v: v['assets'][0].update(browser_download_url='https://elsewhere.test/file.zip'),
                       lambda v: v['assets'][0].pop('digest'), lambda v: v['assets'][0].update(size=True)):
            value = self.api_payload()
            mutate(value)
            with patch.object(U, '_open', return_value=io.BytesIO(json.dumps(value).encode())), self.assertRaises(U.UpdateError):
                U.latest_release()

    def test_download_hash_mismatch_cleans_partial_and_preserves_collision(self):
        target = self.state / 'downloads/test.zip'
        asset = {'url': 'unused', 'size': 3, 'sha256': '0' * 64}
        with patch.object(U, '_open', return_value=io.BytesIO(b'abc')), self.assertRaises(U.UpdateError):
            U.download_asset(asset, target, threading.Event(), lambda *args: None)
        self.assertFalse(target.exists())
        target.write_bytes(b'preexisting')
        with patch.object(U, '_open', return_value=io.BytesIO(b'abc')), self.assertRaises(FileExistsError):
            U.download_asset(asset, target, threading.Event(), lambda *args: None)
        self.assertEqual(target.read_bytes(), b'preexisting')

    def test_development_checkout_never_checks_network_or_creates_state(self):
        base = make_release(self.root / 'Dev')
        (base / '.git').mkdir()
        with patch.object(U, 'latest_release') as latest:
            service = U.UpdateService(base)
            service.start()
            service.check()
            service.configure(True)
        latest.assert_not_called()
        self.assertEqual(service.status()['state'], 'development')
        self.assertFalse(U.state_directory(base).exists())

    def test_constructor_and_status_are_local_only_and_disabled_persists(self):
        with patch.object(U, 'latest_release') as latest:
            service = U.UpdateService(self.base)
            self.assertTrue(service.status()['automatic'])
            service.configure(False)
            self.assertFalse(U.UpdateService(self.base).status()['automatic'])
        latest.assert_not_called()

    def test_manual_check_while_disabled_downloads_ready_and_preserves_previous_program(self):
        archive = make_zip(self.root / 'update.zip')
        latest = {'version': '0.11', 'url': U.RELEASE_PREFIX + 'tag/v0.11', 'asset': {'size': archive.stat().st_size}}
        def download(asset, path, cancel, progress):
            path.write_bytes(archive.read_bytes())
            progress(path.stat().st_size, path.stat().st_size)
        service = U.UpdateService(self.base)
        service.configure(False)
        with patch.object(U, 'latest_release', return_value=latest), patch.object(U, 'download_asset', side_effect=download):
            service._check(manual=True)
        self.assertEqual(service.status()['state'], 'ready')
        self.assertFalse(service.status()['automatic'])
        self.assertEqual(U.pointer(self.state, 'pending'), '0.11')
        self.assertIsNone(U.pointer(self.state, 'current'))
        self.assertEqual(list((self.state / 'downloads').iterdir()), [])
        service.configure(False)
        self.assertEqual(service.status()['state'], 'ready')

    def test_offline_check_keeps_already_prepared_update(self):
        U.atomic_json(self.state / 'pending.json', {'version': '0.11'})
        service = U.UpdateService(self.base)
        with patch.object(U, 'latest_release', side_effect=OSError('private path')):
            service._check(manual=True)
        self.assertEqual(service.status()['state'], 'ready')
        self.assertNotIn('private path', service.status()['message'])
        self.assertEqual(U.pointer(self.state, 'pending'), '0.11')

    def test_failed_boot_version_does_not_repeat_automatic_download(self):
        U.atomic_json(self.state / 'failure.json', {'version': '0.11'})
        service = U.UpdateService(self.base)
        latest = {'version': '0.11', 'url': U.RELEASE_PREFIX + 'tag/v0.11', 'asset': {'size': 100}}
        with patch.object(U, 'latest_release', return_value=latest), patch.object(U, 'download_asset') as download:
            service._check()
        download.assert_not_called()
        self.assertEqual(service.status()['state'], 'error')

    def test_newer_failed_download_restores_actual_ready_version_and_url(self):
        U.atomic_json(self.state / 'pending.json', {'version': '0.11'})
        service = U.UpdateService(self.base)
        service.result['releaseUrl'] = U.RELEASE_PREFIX + 'tag/v0.11'
        latest = {'version': '0.12', 'url': U.RELEASE_PREFIX + 'tag/v0.12', 'asset': {'size': 100}}
        with patch.object(U, 'latest_release', return_value=latest), patch.object(U, 'download_asset', side_effect=OSError('offline')):
            service._check(manual=True)
        self.assertEqual(service.status()['state'], 'ready')
        self.assertEqual(service.status()['availableVersion'], '0.11')
        self.assertEqual(service.status()['releaseUrl'], U.RELEASE_PREFIX + 'tag/v0.11')
        self.assertEqual(U.pointer(self.state, 'pending'), '0.11')

    def test_zip_cleanup_failure_does_not_abort_checks(self):
        archive = make_zip(self.root / 'update.zip')
        latest = {'version': '0.11', 'url': U.RELEASE_PREFIX + 'tag/v0.11', 'asset': {'size': archive.stat().st_size}}
        original_unlink = Path.unlink
        def unlink(path, *args, **kwargs):
            if path.suffix == '.zip' and path.parent.name == 'downloads':
                raise PermissionError('antivirus temporarily using ZIP')
            return original_unlink(path, *args, **kwargs)
        def download(asset, path, cancel, progress):
            path.write_bytes(archive.read_bytes())
        service = U.UpdateService(self.base)
        with patch.object(U, 'latest_release', return_value=latest), patch.object(U, 'download_asset', side_effect=download), patch.object(Path, 'unlink', unlink):
            service._check(manual=True)
        self.assertEqual(service.status()['state'], 'ready')
        with patch.object(U, 'latest_release', return_value=latest) as check:
            service._check(manual=True)
        check.assert_called_once()
        self.assertEqual(service.status()['state'], 'ready')

    def test_invalid_local_manifest_does_not_break_service_or_access_network(self):
        (self.base / 'app-release.json').write_text('{partial')
        with patch.object(U, 'latest_release') as latest:
            service = U.UpdateService(self.base)
            service.start()
            service.check()
        self.assertEqual(service.status()['state'], 'error')
        latest.assert_not_called()

    def test_mark_started_requires_matching_environment_token(self):
        target = self.state / '.started-test.json'
        with patch.dict('os.environ', {'TRAMA_UPDATE_HEALTH_FILE': str(target), 'TRAMA_UPDATE_HEALTH_TOKEN': 'a' * 32}):
            U.mark_started()
        self.assertEqual(U.read_json(target)['token'], 'a' * 32)


if __name__ == '__main__':
    unittest.main()
