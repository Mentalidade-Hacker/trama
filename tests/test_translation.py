import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from translation import TranslationError, TranslationService, runtime_python, translation_home, validate_payload
from translation_worker import package, split_text, translate_texts


def fixture_models(home):
    for source, target in (("en", "pt"), ("pt", "en")):
        folder = home / "models" / f"{source}_{target}"
        (folder / "model").mkdir(parents=True)
        (folder / "model" / "model.bin").write_bytes(b"TEST ONLY")
        (folder / "sentencepiece.model").write_bytes(b"TEST ONLY")
        (folder / "metadata.json").write_text(json.dumps({"from_code": source, "to_code": target}), encoding="utf-8")
    python = runtime_python(home)
    python.parent.mkdir(parents=True)
    python.write_bytes(b"TEST ONLY")


class FakeTokenizer:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
    def encode(self, text, out_type=str):
        return text.split()
    def decode_pieces(self, tokens):
        return " ".join(tokens)


class TranslationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name) / "translation"

    def service(self):
        with patch.dict(os.environ, {"TRAMA_TRANSLATION_HOME": str(self.home)}):
            return TranslationService(Path(self.temp.name) / "data")

    def test_paths_override_and_standard_venv(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(translation_home(self.temp.name), Path(self.temp.name).resolve() / "translation")
        with patch.dict(os.environ, {"TRAMA_TRANSLATION_HOME": str(self.home)}):
            self.assertEqual(translation_home("unused"), self.home.resolve())
        self.assertEqual(runtime_python(self.home).name, "python.exe" if os.name == "nt" else "python")

    def test_types_languages_total_count_and_utf16_limit(self):
        self.assertEqual(validate_payload({"source": "en", "target": "pt", "texts": ["Hello 😀"]}), ("en", "pt", ["Hello 😀"]))
        invalid = [None, {}, {"source": "auto", "target": "pt", "texts": []}, {"source": "en", "target": "pt", "texts": "text"}, {"source": "en", "target": "pt", "texts": [1]}, {"source": "en", "target": "pt", "texts": [""] * 201}, {"source": "en", "target": "pt", "texts": ["😀" * 15001]}, {"source": "en", "target": "pt", "texts": ["\ud800"]}]
        for payload in invalid:
            with self.assertRaises(ValueError):
                validate_payload(payload)

    def test_missing_runtime_reports_unavailable_without_subprocess(self):
        service = self.service()
        with patch("translation.subprocess.run") as run, patch("translation.subprocess.Popen") as popen:
            state = service.status()
            self.assertFalse(state["available"])
            self.assertTrue(state["local"])
            with self.assertRaises(TranslationError) as caught:
                service.translate({"source": "en", "target": "pt", "texts": ["Hello"]})
            self.assertEqual(caught.exception.status, 503)
            run.assert_not_called()
            popen.assert_not_called()

    def test_status_probes_dependencies_and_caches_success(self):
        fixture_models(self.home)
        service = self.service()
        with patch("translation.subprocess.run", return_value=SimpleNamespace(returncode=0, stdout=b'{"available":true}')) as run:
            self.assertTrue(service.status()["available"])
            self.assertTrue(service.status()["available"])
            self.assertEqual(run.call_count, 1)
            self.assertIn("--check", run.call_args.args[0])
            self.assertEqual(run.call_args.kwargs["timeout"], 15)

    def test_prose_is_utf8_stdin_not_command_line_and_output_order_preserved(self):
        fixture_models(self.home)
        service = self.service()
        process = MagicMock()
        process.returncode = 0
        process.communicate.return_value = (json.dumps({"texts": ["Olá", "Você está bem?"]}, ensure_ascii=False).encode("utf-8"), None)
        with patch("translation.subprocess.Popen", return_value=process) as popen:
            result = service.translate({"source": "en", "target": "pt", "texts": ["Hello", "Are you okay?"]})
            self.assertEqual(result, {"texts": ["Olá", "Você está bem?"], "local": True})
            self.assertNotIn("Hello", " ".join(popen.call_args.args[0]))
            self.assertEqual(json.loads(process.communicate.call_args.args[0]), {"source": "en", "target": "pt", "texts": ["Hello", "Are you okay?"]})
            self.assertEqual(process.communicate.call_args.kwargs["timeout"], 120)

    def test_timeout_kills_worker_and_releases_lock(self):
        fixture_models(self.home)
        service = self.service()
        process = MagicMock()
        process.communicate.side_effect = [subprocess.TimeoutExpired("worker", 120), (b"", None)]
        with patch("translation.subprocess.Popen", return_value=process):
            with self.assertRaises(TranslationError) as caught:
                service.translate({"source": "en", "target": "pt", "texts": ["Hello"]})
        self.assertEqual(caught.exception.status, 504)
        process.kill.assert_called_once()
        self.assertFalse(service.lock.locked())
        self.assertIsNone(service.process)

    def test_concurrent_translation_refused_and_response_count_checked(self):
        fixture_models(self.home)
        service = self.service()
        service.lock.acquire()
        with self.assertRaises(TranslationError) as caught:
            service.translate({"source": "en", "target": "pt", "texts": ["Hello"]})
        self.assertEqual(caught.exception.code, "translation_busy")
        service.lock.release()
        process = MagicMock(returncode=0)
        process.communicate.return_value = (b'{"texts":[]}', None)
        with patch("translation.subprocess.Popen", return_value=process):
            with self.assertRaises(TranslationError) as caught:
                service.translate({"source": "en", "target": "pt", "texts": ["Hello"]})
        self.assertEqual(caught.exception.code, "translation_response")

    def test_same_language_and_empty_text_need_no_engine(self):
        service = self.service()
        self.assertEqual(service.translate({"source": "pt", "target": "pt", "texts": ["Olá"]}), {"texts": ["Olá"], "local": True})
        self.assertEqual(service.translate({"source": "en", "target": "pt", "texts": ["\n  ", ""]})["texts"], ["\n  ", ""])

    def test_worker_preserves_whitespace_and_uses_controlled_engine(self):
        fixture_models(self.home)
        engine = MagicMock()
        engine.Translator.return_value.translate_batch.return_value = [SimpleNamespace(hypotheses=[["Olá", "mundo."]]), SimpleNamespace(hypotheses=[["Próxima", "frase."]])]
        result = translate_texts(self.home, {"source": "en", "target": "pt", "texts": ["  Hello world.\n\nNext sentence.\t", ""]}, engine, SimpleNamespace(SentencePieceProcessor=FakeTokenizer))
        self.assertEqual(result["texts"], ["  Olá mundo.\n\nPróxima frase.\t", ""])
        call = engine.Translator.return_value.translate_batch.call_args
        self.assertEqual(call.args[0], [["Hello", "world."], ["Next", "sentence."]])
        self.assertEqual(call.kwargs["max_input_length"], 0)
        self.assertEqual(engine.Translator.call_args.kwargs["device"], "cpu")

    def test_long_text_split_never_drops_source_words(self):
        original = "\t" + " ".join(f"word{i}" for i in range(1200)) + " \r\n"
        pieces = split_text(original, FakeTokenizer())
        self.assertEqual("".join(part for part, _ in pieces), original)
        self.assertTrue(all(tokens is None or len(tokens) <= 512 for _, tokens in pieces))
        self.assertGreater(len([tokens for _, tokens in pieces if tokens is not None]), 1)

    def test_model_direction_mismatch_rejected(self):
        fixture_models(self.home)
        metadata = self.home / "models/en_pt/metadata.json"
        metadata.write_text('{"from_code":"fr","to_code":"pt"}')
        with self.assertRaises(ValueError):
            package(self.home, "en", "pt")

    def test_close_terminates_owned_worker(self):
        service = self.service()
        process = service.process = MagicMock()
        process.poll.return_value = None
        service.close()
        process.terminate.assert_called_once()
        self.assertTrue(service.closed)


if __name__ == "__main__":
    unittest.main()
