import hashlib
import errno
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from proton_transfer import local_pairs, remote_names, remote_folder, publish_files, receive_files, install_immutable, publish_no_replace, ProtonCLI, transfer_count


def pair(folder, identifier='a' * 32, content=b'archive test fixture'):
    archive = Path(folder) / f'{identifier}.zip'
    archive.write_bytes(content)
    metadata = Path(folder) / f'{identifier}.json'
    metadata.write_text(json.dumps({'format': 'trama-sync-v1', 'id': identifier,
                                    'sha256': hashlib.sha256(content).hexdigest()}), encoding='utf-8')
    return archive, metadata


class FakeCLI:
    def __init__(self, source):
        self.source = Path(source)
        self.calls = []

    def verify_transfer_flags(self, operation):
        self.calls.append(('help', operation))

    def names(self, remote):
        return {p.name for p in self.source.iterdir() if p.is_file()}

    def entries(self, remote):
        return {p.name: {'name': p.name, 'type': 'file', 'activeRevision': {
            'claimedSize': p.stat().st_size,
            'claimedDigests': {'sha1': hashlib.sha1(p.read_bytes()).hexdigest(), 'sha1Verified': True}}}
            for p in self.source.iterdir() if p.is_file()}

    def upload_file(self, path, remote):
        self.calls.append(('upload', Path(path).name, remote))
        target = self.source / Path(path).name
        if target.exists():
            return 0
        target.write_bytes(Path(path).read_bytes())
        return 1

    def download_file(self, remote_path, folder):
        name = remote_path.rsplit('/', 1)[1]
        self.calls.append(('download', name))
        (Path(folder) / name).write_bytes((self.source / name).read_bytes())


class ProtonTransferTests(unittest.TestCase):
    def test_only_valid_complete_snapshot_pairs_upload_zip_before_json(self):
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            archive, metadata = pair(local)
            (Path(local) / 'trama.db').write_bytes(b'never upload')
            (Path(local) / ('b' * 32 + '.json')).write_text('{}')
            cli = FakeCLI(remote)
            self.assertEqual(publish_files(cli, local, '/my-files/Trama'), 2)
            self.assertEqual([call[1] for call in cli.calls if call[0] == 'upload'], [archive.name, metadata.name])

    def test_malformed_or_changed_archive_fails_before_transport(self):
        with tempfile.TemporaryDirectory() as local:
            archive, _ = pair(local)
            archive.write_bytes(b'tampered')
            with self.assertRaises(ValueError):
                local_pairs(local)

    def test_remote_names_parse_official_json_and_ignore_unrelated_files(self):
        name = 'a' * 32 + '.zip'
        self.assertEqual(remote_names([{'name': {'ok': True, 'value': name}, 'type': 'file'},
                                       {'name': {'ok': True, 'value': 'private.pdf'}, 'type': 'file'}]), {name})
        with self.assertRaises(ValueError):
            remote_names([{'name': name, 'type': 'folder'}])
        for path in ['/my-files', '/my-files/../Other', '/shared-with-me/Trama', '/my-files/Trama\n']:
            with self.assertRaises(ValueError):
                remote_folder(path)

    def test_download_is_additive_and_ignores_unrelated_and_incomplete_files(self):
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            archive, metadata = pair(remote)
            (Path(remote) / 'private.txt').write_text('never download')
            (Path(remote) / ('b' * 32 + '.zip')).write_bytes(b'incomplete')
            cli = FakeCLI(remote)
            self.assertEqual(receive_files(cli, '/my-files/Trama', local), 1)
            self.assertEqual((Path(local) / archive.name).read_bytes(), archive.read_bytes())
            self.assertEqual((Path(local) / metadata.name).read_bytes(), metadata.read_bytes())
            self.assertFalse((Path(local) / 'private.txt').exists())
            self.assertEqual(receive_files(cli, '/my-files/Trama', local), 0)
            self.assertEqual(len([call for call in cli.calls if call[0] == 'download']), 2)

    def test_differing_existing_archive_never_overwritten_or_published(self):
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            archive, metadata = pair(remote)
            existing = Path(local) / archive.name
            existing.write_bytes(b'local copy kept')
            with self.assertRaises(ValueError):
                receive_files(FakeCLI(remote), '/my-files/Trama', local)
            self.assertEqual(existing.read_bytes(), b'local copy kept')
            self.assertFalse((Path(local) / metadata.name).exists())

    def test_immutable_install_keeps_equal_file_and_rejects_difference(self):
        with tempfile.TemporaryDirectory() as local:
            source, destination = Path(local) / 'source', Path(local) / 'destination'
            source.write_bytes(b'one')
            self.assertTrue(install_immutable(source, destination))
            self.assertFalse(install_immutable(source, destination))
            source.write_bytes(b'two')
            with self.assertRaises(ValueError):
                install_immutable(source, destination)
            self.assertEqual(destination.read_bytes(), b'one')

    def test_non_link_filesystem_fallback_uses_exclusive_creation(self):
        with tempfile.TemporaryDirectory() as local:
            source, destination = Path(local) / 'source', Path(local) / 'destination'
            source.write_bytes(b'complete')
            with patch('proton_transfer.os.link', side_effect=OSError(errno.EOPNOTSUPP, 'unsupported')):
                publish_no_replace(source, destination, windows=False)
                source.write_bytes(b'other')
                with self.assertRaises(FileExistsError):
                    publish_no_replace(source, destination, windows=False)
            self.assertEqual(destination.read_bytes(), b'complete')

    def test_existing_remote_zip_is_checked_before_publishing_manifest(self):
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            archive, metadata = pair(local)
            conflict = Path(remote) / archive.name
            conflict.write_bytes(b'different remote content')
            cli = FakeCLI(remote)
            with self.assertRaisesRegex(ValueError, 'conteúdo diferente'):
                publish_files(cli, local, '/my-files/Trama')
            self.assertEqual(conflict.read_bytes(), b'different remote content')
            self.assertFalse((Path(remote) / metadata.name).exists())
            self.assertFalse(any(call[0] == 'upload' for call in cli.calls))

    def test_retry_after_uploaded_zip_only_sends_missing_manifest(self):
        class InterruptedCLI(FakeCLI):
            def upload_file(self, path, remote):
                count = super().upload_file(path, remote)
                if Path(path).suffix == '.zip':
                    raise TimeoutError('network disconnected after server accepted file')
                return count
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            archive, metadata = pair(local)
            with self.assertRaises(TimeoutError):
                publish_files(InterruptedCLI(remote), local, '/my-files/Trama')
            self.assertTrue((Path(remote) / archive.name).exists())
            self.assertFalse((Path(remote) / metadata.name).exists())
            cli = FakeCLI(remote)
            self.assertEqual(publish_files(cli, local, '/my-files/Trama'), 1)
            self.assertEqual([call[1] for call in cli.calls if call[0] == 'upload'], [metadata.name])
            self.assertEqual(publish_files(cli, local, '/my-files/Trama'), 0)

    def test_skipped_upload_race_never_reports_success_for_different_content(self):
        class ConcurrentCLI(FakeCLI):
            def upload_file(self, path, remote):
                (self.source / Path(path).name).write_bytes(b'concurrent conflict')
                return 0
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            archive, metadata = pair(local)
            with self.assertRaisesRegex(ValueError, 'conteúdo diferente'):
                publish_files(ConcurrentCLI(remote), local, '/my-files/Trama')
            self.assertFalse((Path(remote) / metadata.name).exists())
            self.assertEqual((Path(remote) / archive.name).read_bytes(), b'concurrent conflict')

    def test_success_without_remote_file_is_not_counted_as_upload(self):
        class MissingCLI(FakeCLI):
            def upload_file(self, path, remote):
                return 1
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            pair(local)
            with self.assertRaisesRegex(ValueError, 'não confirmou'):
                publish_files(MissingCLI(remote), local, '/my-files/Trama')

    def test_manifest_appearing_during_zip_upload_is_also_checked(self):
        class ConcurrentManifestCLI(FakeCLI):
            def upload_file(self, path, remote):
                count = super().upload_file(path, remote)
                if Path(path).suffix == '.zip':
                    (self.source / (Path(path).stem + '.json')).write_bytes(b'concurrent manifest')
                return count
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            _, metadata = pair(local)
            with self.assertRaisesRegex(ValueError, 'conteúdo diferente'):
                publish_files(ConcurrentManifestCLI(remote), local, '/my-files/Trama')
            self.assertEqual((Path(remote) / metadata.name).read_bytes(), b'concurrent manifest')

    def test_changing_local_file_during_hash_is_not_reported_as_verified(self):
        from proton_transfer import file_hash
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            pair(local)
            pair(remote)
            cache = {}
            local_pairs(local, cache)
            def changed_hash(path, algorithm='sha256'):
                result = file_hash(path, algorithm)
                if algorithm == 'sha1':
                    Path(path).write_bytes(b'changed while hashing')
                return result
            cli = FakeCLI(remote)
            with patch('proton_transfer.file_hash', side_effect=changed_hash):
                with self.assertRaisesRegex(ValueError, 'mudou durante'):
                    publish_files(cli, local, '/my-files/Trama', cache)
            self.assertFalse(any(call[0] == 'upload' for call in cli.calls))

    def test_unverified_digest_requires_download_and_sha256_comparison(self):
        class UnverifiedCLI(FakeCLI):
            def entries(self, remote):
                entries = super().entries(remote)
                for value in entries.values():
                    value['activeRevision']['claimedDigests']['sha1Verified'] = False
                return entries
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            pair(local)
            pair(remote)
            cli = UnverifiedCLI(remote)
            self.assertEqual(publish_files(cli, local, '/my-files/Trama'), 0)
            self.assertTrue(any(call[0] == 'download' for call in cli.calls))
            self.assertEqual(list(Path(local).glob('.trama-proton-verificacao-*')), [])
            (Path(remote) / ('a' * 32 + '.zip')).write_bytes(b'tampered remote')
            with self.assertRaisesRegex(ValueError, 'conteúdo diferente'):
                publish_files(cli, local, '/my-files/Trama')
            self.assertEqual(list(Path(local).glob('.trama-proton-verificacao-*')), [])

    def test_cached_local_digest_still_detects_changed_remote_revision(self):
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            pair(local)
            archive, _ = pair(remote)
            cli, cache = FakeCLI(remote), {}
            self.assertEqual(receive_files(cli, '/my-files/Trama', local, cache), 0)
            archive.write_bytes(b'changed remote')
            with self.assertRaisesRegex(ValueError, 'conteúdo diferente'):
                receive_files(cli, '/my-files/Trama', local, cache)

    def test_upload_counts_real_transfers_but_not_concurrent_equal_skips(self):
        class ConcurrentEqualCLI(FakeCLI):
            def upload_file(self, path, remote):
                (self.source / Path(path).name).write_bytes(Path(path).read_bytes())
                return 0
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as remote:
            pair(local)
            self.assertEqual(publish_files(ConcurrentEqualCLI(remote), local, '/my-files/Trama'), 0)
            self.assertEqual(len(list(Path(remote).glob('*'))), 2)

    def test_single_file_transfer_summary_validation_ignores_sensitive_details(self):
        self.assertEqual(transfer_count('{"transferredItems":1,"skippedItems":0,"failedItems":0}'), 1)
        self.assertEqual(transfer_count('{"transferredItems":0,"skippedItems":1,"failedItems":0}'), 0)
        for payload in ('secret-account invalid JSON', '{}',
                        '{"transferredItems":1,"skippedItems":0,"failedItems":1,"failures":["secret-account"]}',
                        '{"transferredItems":true,"skippedItems":0,"failedItems":0}'):
            with self.assertRaises(ValueError) as caught:
                transfer_count(payload)
            self.assertNotIn('secret-account', str(caught.exception))

    def test_transfer_commands_request_noninteractive_json_summaries(self):
        cli = ProtonCLI('proton-drive')
        with patch.object(cli, 'call', return_value='{"transferredItems":1,"skippedItems":0,"failedItems":0}') as call:
            self.assertEqual(cli.upload_file(Path('copy.zip'), '/my-files/Trama'), 1)
            self.assertIn('--json', call.call_args.args)
            self.assertEqual(cli.download_file('/my-files/Trama/copy.zip', Path('local')), 1)
            self.assertIn('--json', call.call_args.args)


if __name__ == '__main__':
    unittest.main()
