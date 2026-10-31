import json
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import setup_translation as setup


def archive_file(path, pair="en_pt", extra=None, model=b"model fixture"):
    source, target = pair.split("_")
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("translate-test/metadata.json", json.dumps({"from_code": source, "to_code": target, "package_version": "1.9"}))
        archive.writestr("translate-test/model/model.bin", model)
        archive.writestr("translate-test/model/config.json", "{}")
        archive.writestr("translate-test/sentencepiece.model", "tokenizer fixture")
        archive.writestr("translate-test/README.md", "Official model information")
        archive.writestr("translate-test/stanza/en/tokenize/ewt.pt", "unused neural tokenizer")
        if extra:
            extra(archive)


def raw_member(archive, name, content):
    # ZipInfo normalizes backslashes on Windows during construction. Restore
    # the hostile raw name so validation is exercised on both operating systems.
    info = zipfile.ZipInfo("placeholder")
    info.filename = name
    info.orig_filename = name
    archive.writestr(info, content)


class SetupTranslationTests(unittest.TestCase):
    def test_normalizes_official_archive_without_stanza_and_keeps_digest(self):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            package = home / "en_pt.argosmodel"
            archive_file(package)
            record = setup.install_model(package, home / "models", "en_pt")
            root = home / "models" / "en_pt"
            self.assertEqual((root / "model" / "model.bin").read_bytes(), b"model fixture")
            self.assertTrue((root / "sentencepiece.model").is_file())
            self.assertTrue((root / "README.md").is_file())
            self.assertFalse((root / "stanza").exists())
            self.assertEqual(record["archiveSha256"], setup.digest_file(package))
            self.assertTrue(setup.model_ready(home, "en_pt"))
            self.assertFalse(setup.model_ready(home, "pt_en"))

    def test_reinstall_preserves_prior_model_and_failure_does_not_replace(self):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            package = home / "model.zip"
            archive_file(package, model=b"original")
            setup.install_model(package, home / "models", "en_pt")
            archive_file(package, model=b"updated")
            setup.install_model(package, home / "models", "en_pt")
            previous = list((home / "models").glob(".en_pt-previous-*"))
            self.assertEqual(len(previous), 1)
            self.assertEqual((previous[0] / "model" / "model.bin").read_bytes(), b"original")
            archive_file(package, pair="pt_en")
            with self.assertRaisesRegex(ValueError, "idioma"):
                setup.install_model(package, home / "models", "en_pt")
            self.assertEqual((home / "models" / "en_pt" / "model" / "model.bin").read_bytes(), b"updated")

    def test_rejects_traversal_windows_paths_and_normalized_aliases_before_writing(self):
        bad_names = ["../outside", "/outside", "translate-test/../outside", "C:/outside", "translate-test\\outside", "translate-test/./outside", "translate-test//outside", "translate-test/NUL.txt", "translate-test/trailing."]
        for name in bad_names:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                home = Path(temporary)
                package = home / "bad.zip"
                archive_file(package, extra=lambda archive: raw_member(archive, name, "bad"))
                with self.assertRaises(ValueError):
                    setup.install_model(package, home / "models", "en_pt")
                self.assertEqual(list((home / "models").iterdir()), [])

    def test_rejects_symlink_even_in_ignored_stanza_directory(self):
        def link(archive):
            info = zipfile.ZipInfo("translate-test/stanza/link")
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(info, "../../other")
        with tempfile.TemporaryDirectory() as temporary:
            package = Path(temporary) / "bad.zip"
            archive_file(package, extra=link)
            with zipfile.ZipFile(package) as archive, self.assertRaisesRegex(ValueError, "Links"):
                setup.inspect_archive(archive, "en_pt")

    def test_rejects_duplicate_paths_and_expansion_bomb(self):
        for extra in (lambda archive: archive.writestr("translate-test/METADATA.JSON", "{}"),
                      lambda archive: archive.writestr("translate-test/stanza/bomb", b"a" * (2 * 1024 * 1024))):
            with tempfile.TemporaryDirectory() as temporary:
                package = Path(temporary) / "bad.zip"
                archive_file(package, extra=extra)
                with zipfile.ZipFile(package) as archive, self.assertRaises(ValueError):
                    setup.inspect_archive(archive, "en_pt")

    def test_selects_latest_matching_official_pair_and_rejects_untrusted_url(self):
        entries = [{"from_code": "en", "to_code": "pt", "package_version": version,
                    "links": ["https://argos-net.com/v1/model.argosmodel"]} for version in ("1.9", "1.10")]
        self.assertEqual(setup.select_package(entries, "en_pt")["package_version"], "1.10")
        entries[1]["links"] = ["https://argos-net.com.evil.example/model", "http://argos-net.com/model"]
        with self.assertRaisesRegex(ValueError, "oficial"):
            setup.select_package(entries, "en_pt")

    def test_directory_override_and_check_do_not_download(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch.dict(setup.os.environ, {"TRAMA_TRANSLATION_HOME": temporary}):
                self.assertEqual(setup.translation_home(), Path(temporary).resolve())
            with patch.object(setup, "fetch_index") as fetch, patch.object(setup, "install_runtime") as install:
                self.assertEqual(setup.main(["--directory", temporary, "--check"]), 1)
                fetch.assert_not_called()
                install.assert_not_called()

    def test_retries_missing_pip_in_partial_runtime(self):
        with tempfile.TemporaryDirectory() as temporary:
            executable = setup.runtime_python(temporary)
            executable.parent.mkdir(parents=True)
            executable.write_bytes(b"fixture")
            calls = []
            def run(command, **options):
                calls.append(command)
                return subprocess.CompletedProcess(command, 1 if len(calls) == 1 else 0)
            with patch.object(setup.subprocess, "run", side_effect=run), patch.object(setup.venv, "EnvBuilder") as builder:
                self.assertEqual(setup.install_runtime(temporary), executable)
            builder.assert_not_called()
            self.assertIn("ensurepip", calls[1])
            self.assertIn("--isolated", calls[2])
            self.assertIn("--only-binary=:all:", calls[2])


if __name__ == "__main__":
    unittest.main()
