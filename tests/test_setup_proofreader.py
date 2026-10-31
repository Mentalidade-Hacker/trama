import hashlib
import io
import os
from pathlib import Path
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import MagicMock, patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import setup_proofreader as setup


class WritingSetupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.home = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def archive(self, entries):
        path = self.home / "package.zip"
        with zipfile.ZipFile(path, "w") as archive:
            for name, data in entries:
                archive.writestr(name, data)
        return path

    def test_safe_zip_extract_preserves_relative_package_layout(self):
        archive = self.archive([("LanguageTool/libs/", b""), ("LanguageTool/languagetool-server.jar", b"jar"), ("LanguageTool/libs/rules.jar", b"rules")])
        destination = self.home / "unpacked"
        setup.safe_extract(archive, destination)
        self.assertEqual((destination / "LanguageTool/libs/rules.jar").read_bytes(), b"rules")

    def test_archive_paths_cannot_escape_or_use_windows_streams(self):
        for name in ("../escape", "/absolute", "C:/absolute", "dir\\escape", "dir/file:stream", ""):
            with self.subTest(name=name), self.assertRaises(ValueError):
                setup.member_path(name)
        archive = self.archive([("../escape", b"unsafe")])
        with self.assertRaises(ValueError):
            setup.safe_extract(archive, self.home / "unpacked")
        self.assertFalse((self.home / "escape").exists())

    def test_zip_symlinks_and_duplicate_paths_are_rejected(self):
        symlink = zipfile.ZipInfo("link")
        symlink.create_system = 3
        symlink.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive = self.archive([(symlink, b"../escape")])
        with self.assertRaises(ValueError):
            setup.safe_extract(archive, self.home / "links")
        # Two identical paths in an archive must not overwrite each other.
        with patch("warnings.warn"):
            archive = self.archive([("same", b"one"), ("same", b"two")])
        with self.assertRaises(ValueError):
            setup.safe_extract(archive, self.home / "duplicates")

    def test_expansion_and_entry_limits_apply_before_writing(self):
        archive = self.archive([("one", b"1234")])
        with patch.object(setup, "MAX_EXPANDED", 3), self.assertRaises(ValueError):
            setup.safe_extract(archive, self.home / "oversized")
        with patch.object(setup, "MAX_ENTRIES", 0), self.assertRaises(ValueError):
            setup.safe_extract(archive, self.home / "many")

    def test_tar_internal_links_become_regular_copies(self):
        archive = self.home / "java.tar.gz"
        with tarfile.open(archive, "w:gz") as output:
            file = tarfile.TarInfo("jre/legal/LICENSE")
            file.size = 7
            output.addfile(file, io.BytesIO(b"license"))
            link = tarfile.TarInfo("jre/legal/COPY")
            link.type, link.linkname = tarfile.SYMTYPE, "LICENSE"
            output.addfile(link)
        destination = self.home / "unpacked"
        setup.safe_extract(archive, destination)
        copy = destination / "jre/legal/COPY"
        self.assertFalse(copy.is_symlink())
        self.assertEqual(copy.read_bytes(), b"license")

    def test_tar_external_link_is_rejected(self):
        archive = self.home / "java.tar.gz"
        with tarfile.open(archive, "w:gz") as output:
            link = tarfile.TarInfo("jre/escape")
            link.type, link.linkname = tarfile.SYMTYPE, "../../outside"
            output.addfile(link)
        with self.assertRaises(ValueError):
            setup.safe_extract(archive, self.home / "unpacked")

    def test_promote_retains_previous_runtime_and_rejects_outside_destination(self):
        source, target = self.home / "staging/new", self.home / "java"
        source.mkdir(parents=True)
        target.mkdir()
        (source / "release").write_text("new")
        (target / "release").write_text("old")
        backup = setup.promote(source, target, self.home)
        self.assertEqual((Path(backup) / "release").read_text(), "old")
        self.assertEqual((target / "release").read_text(), "new")
        with self.assertRaises(ValueError):
            setup.promote(target, self.home.parent / "outside", self.home)

    def test_java_version_detection_handles_current_and_legacy_versions(self):
        with patch.object(setup.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, b"", b'openjdk version "21.0.9"')):
            self.assertEqual(setup.java_major("java"), 21)
        with patch.object(setup.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, b"", b'java version "1.8.0_99"')):
            self.assertEqual(setup.java_major("java"), 8)
        with patch.object(setup.subprocess, "run", side_effect=FileNotFoundError):
            self.assertIsNone(setup.java_major("missing"))

    def test_only_official_https_download_origins_are_allowed(self):
        self.assertTrue(setup.trusted_url(setup.LT_URL))
        self.assertTrue(setup.trusted_url("https://github.com/adoptium/temurin21-binaries/releases/download/version/java.zip"))
        for url in ("http://languagetool.org/file", "https://evil.test/file", "https://github.com/other/project/releases/file", "https://user:password@languagetool.org/file"):
            self.assertFalse(setup.trusted_url(url))

    def test_download_verifies_hash_and_never_promotes_partial_file(self):
        payload = b"java archive content"
        response = MagicMock()
        response.url = setup.LT_URL
        response.headers = {"Content-Length": str(len(payload))}
        response.read.side_effect = [payload, b""]
        response.__enter__.return_value = response
        destination = self.home / "download.zip"
        with patch.object(setup.urllib.request, "urlopen", return_value=response):
            result = setup.download(setup.LT_URL, destination, hashlib.sha256(payload).hexdigest(), len(payload))
        self.assertEqual(destination.read_bytes(), payload)
        self.assertEqual(result["size"], len(payload))
        response.read.side_effect = [payload, b""]
        with patch.object(setup.urllib.request, "urlopen", return_value=response), self.assertRaises(ValueError):
            setup.download(setup.LT_URL, destination, "0" * 64, len(payload))
        self.assertEqual(destination.read_bytes(), payload)
        self.assertFalse(destination.with_name("download.zip.part").exists())

    def test_diagnostics_use_fixed_examples_and_close_engine(self):
        with patch.object(setup, "Proofreader") as constructor:
            engine = constructor.return_value
            engine.status.return_value = {"available": True}
            engine.check.return_value = {"matches": [{"offset": 0}]}
            setup.check_install(self.home, real=True)
            self.assertEqual([call.args[0]["language"] for call in engine.check.call_args_list], ["en-US", "pt-BR"])
            engine.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
