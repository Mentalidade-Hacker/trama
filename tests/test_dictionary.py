from contextlib import closing, redirect_stdout
import gzip
import io
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import dictionary
import build_dictionary as builder


def write_source(path, entries):
    with gzip.open(path, "wt", encoding="utf-8") as stream:
        for entry in entries:
            stream.write(json.dumps(entry, ensure_ascii=False) + "\n")


def fixture_sources(home):
    paths = {language: Path(home) / f"{language}.jsonl.gz" for language in dictionary.LANGUAGES}
    # Deliberately synthetic definitions: these test fixtures are never bundled.
    write_source(paths["pt"], [
        {"word": "ação", "lang_code": "pt", "pos": "noun", "pos_title": "Substantivo", "senses": [
            {"glosses": ["definição de teste", "sentido relacionado"], "examples": [{"text": "Exemplo de teste.", "ref": "Referência de teste"}], "tags": ["figuratively"]}]},
        {"word": "ação", "lang_code": "pt", "pos": "verb", "senses": [{"glosses": ["segunda classe de teste"]}]},
        {"word": "palavra de outro idioma", "lang_code": "es", "senses": [{"glosses": ["não deve entrar"]}]},
        {"word": "sem definição", "lang_code": "pt", "senses": [{"tags": ["no-gloss"]}]}])
    write_source(paths["en"], [{"word": "Test", "lang_code": "en", "pos": "noun", "senses": [
        {"glosses": ["fixture meaning"], "examples": [{"text": "Fixture example.", "translation": "Tradução do exemplo de teste."}]}]}])
    return paths


class DictionaryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.home = Path(self.temporary.name)
        self.paths = fixture_sources(self.home)
        self.database = self.home / "dictionary.sqlite"
        with redirect_stdout(io.StringIO()):
            self.manifest = builder.build_database(self.paths, self.database)
        self.service = dictionary.DictionaryService(self.database)

    def tearDown(self):
        self.temporary.cleanup()

    def test_lookup_retains_meanings_examples_class_and_source(self):
        result = self.service.lookup("ação", "pt")
        self.assertTrue(result["found"])
        self.assertTrue(result["local"])
        self.assertEqual(len(result["entries"]), 2)
        first = result["entries"][0]
        self.assertEqual(first["partOfSpeech"], "Substantivo")
        self.assertEqual(first["definitions"][0]["definition"], "definição de teste — sentido relacionado")
        self.assertEqual(first["definitions"][0]["examples"], [{"text": "Exemplo de teste.", "reference": "Referência de teste"}])
        self.assertEqual(first["source"]["url"], "https://pt.wiktionary.org/wiki/a%C3%A7%C3%A3o")
        self.assertEqual(first["source"]["license"], "CC BY-SA 4.0")
        self.assertIn("Kaikki", first["source"]["attribution"])

    def test_unicode_case_lookup_preserves_accents_and_original_headword(self):
        self.assertTrue(self.service.lookup("AC\u0327A\u0303O", "pt")["found"])
        self.assertFalse(self.service.lookup("acao", "pt")["found"])
        result = self.service.lookup("test", "en")
        self.assertEqual(result["entries"][0]["word"], "Test")
        self.assertIn("simplificado", result["notice"])
        self.assertEqual(result["entries"][0]["definitions"][0]["examples"][0]["translation"], "Tradução do exemplo de teste.")

    def test_absent_word_and_sql_looking_query_are_read_only(self):
        before = self.database.read_bytes()
        for word in ("unknown fixture", "' OR 1=1;--"):
            result = self.service.lookup(word, "en")
            self.assertFalse(result["found"])
            self.assertEqual(result["entries"], [])
        with closing(self.service._connect()) as connection:
            with self.assertRaises(sqlite3.OperationalError):
                connection.execute("DELETE FROM entries")
        self.assertEqual(before, self.database.read_bytes())
        self.assertFalse(self.database.with_name("dictionary.sqlite-journal").exists())

    def test_source_filtering_and_manifest_are_honest(self):
        status = self.service.status()
        self.assertTrue(status["available"])
        self.assertEqual(status["counts"], {"pt": 2, "en": 1})
        self.assertEqual(self.manifest["sources"]["pt"]["sha256"], builder.sha256(self.paths["pt"]))
        self.assertFalse(self.service.lookup("sem definição", "pt")["found"])
        self.assertFalse(self.service.lookup("palavra de outro idioma", "pt")["found"])

    def test_missing_resource_and_invalid_database_are_clear(self):
        missing = dictionary.DictionaryService(self.home / "missing.sqlite")
        self.assertFalse(missing.status()["available"])
        with self.assertRaises(dictionary.DictionaryError):
            missing.lookup("test", "en")
        self.assertFalse(missing.path.exists())
        invalid = self.home / "invalid.sqlite"
        invalid.write_bytes(b"invalid database")
        self.assertFalse(dictionary.DictionaryService(invalid).status()["available"])

    def test_bad_queries_are_rejected_before_reading(self):
        for word, language in [("", "en"), ("a" * 161, "pt"), ("hello\nthere", "en"), ("\ud800", "pt"), ("word", "fr"), (3, "en")]:
            with self.subTest(word=repr(word), language=language), self.assertRaises(ValueError):
                self.service.lookup(word, language)

    def test_failed_rebuild_preserves_previous_database(self):
        before = self.database.read_bytes()
        self.paths["en"].write_bytes(b"invalid gzip")
        with redirect_stdout(io.StringIO()), self.assertRaises(OSError):
            builder.build_database(self.paths, self.database)
        self.assertEqual(before, self.database.read_bytes())
        self.assertEqual(list(self.home.glob(".dictionary-build-*")), [])

    def test_import_limits_fail_without_publishing(self):
        destination = self.home / "too-large.sqlite"
        with patch.object(builder, "MAX_LINE", 20), redirect_stdout(io.StringIO()), self.assertRaisesRegex(ValueError, "limites"):
            builder.build_database(self.paths, destination)
        self.assertFalse(destination.exists())

    def test_corrupt_or_unbounded_definition_blob_is_rejected(self):
        with self.assertRaises(ValueError):
            dictionary.decode_senses(zlib.compress(b"[]")[:-1])
        with patch.object(dictionary, "MAX_PAYLOAD", 10), self.assertRaises(ValueError):
            dictionary.decode_senses(zlib.compress(b"[" + b" " * 100 + b"]"))
        with self.assertRaises(ValueError):
            dictionary.decode_senses(zlib.compress(b'["invalid definition"]'))

    def test_incompatible_metadata_reports_unavailable(self):
        for value in ("[]", json.dumps({"format": dictionary.FORMAT, "counts": []})):
            with closing(sqlite3.connect(self.database)) as connection:
                connection.execute("UPDATE metadata SET value=? WHERE key='manifest'", (value,))
                connection.commit()
            self.assertFalse(self.service.status()["available"])
            with self.assertRaises(dictionary.DictionaryError):
                self.service.lookup("test", "en")

    def test_explicit_resource_wins_over_environment_override(self):
        with patch.dict(os.environ, {"TRAMA_DICTIONARY_PATH": str(self.home / "other.sqlite")}):
            self.assertEqual(dictionary.DictionaryService(self.database).path, self.database.resolve())
            self.assertEqual(dictionary.DictionaryService().path, (self.home / "other.sqlite").resolve())


if __name__ == "__main__":
    unittest.main()
