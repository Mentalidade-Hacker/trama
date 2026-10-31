import hashlib
import errno
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from proton_transfer import local_pairs, remote_names, remote_folder, publish_files, receive_files, install_immutable, publish_no_replace


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

    def upload_file(self, path, remote):
        self.calls.append(('upload', Path(path).name, remote))

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


if __name__ == '__main__':
    unittest.main()
