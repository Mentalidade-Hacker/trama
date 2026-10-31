import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from proofreader import Proofreader, ProofreaderError, find_command, validate_request, writing_home


class ProofreaderTests(unittest.TestCase):
    def test_request_validation_and_utf16_limit(self):
        self.assertEqual(validate_request({"text": "Olá 😀", "language": "pt-BR"}), ("Olá 😀", "pt-BR"))
        for payload in ({}, {"text": 3, "language": "en-US"}, {"text": "ok", "language": "auto"}, {"text": "ok", "language": []}, {"text": "😀" * 10001, "language": "en-GB"}):
            with self.assertRaises(ValueError):
                validate_request(payload)

    def test_empty_text_does_not_start_engine(self):
        engine = Proofreader()
        with patch.object(engine, "_start") as start:
            self.assertEqual(engine.check({"text": " ", "language": "en-US"})["matches"], [])
            start.assert_not_called()

    def test_check_encoding_and_offsets_preserved(self):
        engine = Proofreader()
        result = {"matches": [{"offset": 3, "length": 4, "message": "Concordância", "replacements": [{"value": "somos"}]}]}
        with patch.object(engine, "_start"), patch.object(engine, "_request", return_value=result) as request:
            self.assertIs(engine.check({"text": "😀 nós é", "language": "pt-BR"}), result)
            self.assertEqual(request.call_args.args, ("POST", "/v2/check"))
            self.assertEqual(parse_qs(request.call_args.kwargs["body"].decode()), {"text": ["😀 nós é"], "language": ["pt-BR"]})
            self.assertEqual(request.call_args.kwargs["timeout"], 35)

    def test_missing_engine_has_install_instructions(self):
        with patch("proofreader.find_command", return_value=None):
            engine = Proofreader()
            self.assertFalse(engine.status()["available"])
            with self.assertRaises(ProofreaderError) as caught:
                engine.check({"text": "We is ready", "language": "en-US"})
            self.assertEqual(caught.exception.status, 503)
            self.assertIn("sudo pacman -S --needed languagetool", str(caught.exception))

    def test_arch_launcher_command_has_no_public_or_cors_flags(self):
        with patch.dict(os.environ, {}, clear=True), patch("proofreader.shutil.which", return_value="/usr/bin/languagetool"):
            command, directory = find_command(Path.cwd() / "unused-writing-home")
            self.assertEqual(command, ["/usr/bin/languagetool", "--http"])
            self.assertIsNone(directory)

    def test_lazy_start_owns_new_private_process_on_ephemeral_port(self):
        engine = Proofreader()
        with patch("proofreader.find_command", return_value=(["languagetool", "--http"], None)), patch("proofreader.socket.socket") as socket_factory, patch("proofreader.subprocess.Popen") as popen, patch.object(engine, "_request", return_value=[{"code": "en"}]):
            socket_factory.return_value.__enter__.return_value.getsockname.return_value = ("127.0.0.1", 34567)
            popen.return_value.poll.return_value = None
            engine._start()
            self.assertEqual(popen.call_args.args[0], ["languagetool", "--http", "--port", "34567"])
            socket_factory.return_value.__enter__.return_value.bind.assert_called_once_with(("127.0.0.1", 0))
            self.assertEqual(popen.call_count, 1)
            engine._start()
            self.assertEqual(popen.call_count, 1)

    def test_startup_timeout_stops_owned_process(self):
        engine = Proofreader()
        with patch("proofreader.find_command", return_value=(["languagetool", "--http"], None)), patch("proofreader.socket.socket") as socket_factory, patch("proofreader.subprocess.Popen") as popen, patch("proofreader.time.monotonic", side_effect=[0, 26]), patch.object(engine, "_stop") as stop:
            socket_factory.return_value.__enter__.return_value.getsockname.return_value = ("127.0.0.1", 34567)
            popen.return_value.poll.return_value = None
            with self.assertRaises(ProofreaderError) as caught:
                engine._start()
            self.assertEqual(caught.exception.status, 504)
            stop.assert_called_once()

    def test_manual_directory_uses_verified_main_class(self):
        with patch.dict(os.environ, {"TRAMA_LANGUAGETOOL_DIR": "/local/languagetool"}), patch("proofreader.java_command", return_value="java"), patch("proofreader.Path.is_file", return_value=True):
            command, directory = find_command()
            self.assertEqual(command[0:2], ["java", "-cp"])
            self.assertTrue(command[2].endswith("languagetool-server.jar"))
            self.assertEqual(command[-1], "org.languagetool.server.HTTPServer")

    def test_data_directory_and_environment_choose_writing_home(self):
        with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, {}, clear=True):
            data = Path(temporary) / "vault"
            self.assertEqual(writing_home(data), (data / "writing").resolve())
            with patch.dict(os.environ, {"TRAMA_WRITING_HOME": temporary}):
                self.assertEqual(Proofreader(data).home, Path(temporary).resolve())
                explicit = data / "specific"
                self.assertEqual(Proofreader(data, writing_directory=explicit).home, explicit.resolve())

    def test_portable_runtime_is_discovered_and_reported(self):
        with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, {}, clear=True), patch("proofreader.shutil.which", return_value=None):
            home = Path(temporary)
            java = home / "java/bin" / ("java.exe" if os.name == "nt" else "java")
            jar = home / "languagetool/languagetool-server.jar"
            java.parent.mkdir(parents=True)
            jar.parent.mkdir(parents=True)
            java.touch()
            jar.touch()
            command, directory = find_command(home)
            self.assertEqual(command, [str(java), "-cp", str(jar), "org.languagetool.server.HTTPServer"])
            self.assertEqual(directory, str(jar.parent))
            state = Proofreader(writing_directory=home).status()
            self.assertTrue(state["available"])
            self.assertFalse(state["busy"])
            self.assertEqual(state["home"], str(home.resolve()))

    def test_parallel_request_returns_busy_without_queuing(self):
        engine = Proofreader()
        entered, release = threading.Event(), threading.Event()
        def respond(*args, **kwargs):
            entered.set()
            self.assertTrue(release.wait(timeout=3))
            return {"matches": []}
        with patch.object(engine, "_start"), patch.object(engine, "_request", side_effect=respond) as request:
            worker = threading.Thread(target=engine.check, args=({"text": "First sentence", "language": "en-US"},))
            worker.start()
            try:
                self.assertTrue(entered.wait(timeout=3))
                self.assertTrue(engine.busy)
                with self.assertRaises(ProofreaderError) as caught:
                    engine.check({"text": "Newest sentence", "language": "en-US"})
                self.assertEqual(caught.exception.status, 409)
                self.assertEqual(caught.exception.code, "proofreader_busy")
                self.assertEqual(request.call_count, 1)
            finally:
                release.set()
                worker.join(timeout=3)
            self.assertFalse(worker.is_alive())
            self.assertFalse(engine.busy)

    def test_http_always_uses_loopback_and_no_proxy_or_redirect(self):
        engine = Proofreader()
        engine.port = 12345
        with patch("proofreader.http.client.HTTPConnection") as connection:
            response = connection.return_value.getresponse.return_value
            response.status = 200
            response.read.return_value = b'{"matches":[]}'
            self.assertEqual(engine._request("POST", "/v2/check", b"text=hello"), {"matches": []})
            connection.assert_called_once_with("127.0.0.1", 12345, timeout=35)
            connection.return_value.close.assert_called_once()
            response.status = 302
            with self.assertRaises(ProofreaderError):
                engine._request("POST", "/v2/check", b"text=hello")

    def test_timeouts_and_malformed_responses_are_errors(self):
        engine = Proofreader()
        with patch.object(engine, "_start"), patch.object(engine, "_request", side_effect=TimeoutError):
            with self.assertRaises(ProofreaderError) as caught:
                engine.check({"text": "hello", "language": "en-US"})
            self.assertEqual(caught.exception.status, 504)
        with patch.object(engine, "_start"), patch.object(engine, "_request", return_value={}):
            with self.assertRaises(ProofreaderError) as caught:
                engine.check({"text": "hello", "language": "en-US"})
            self.assertEqual(caught.exception.status, 502)

    def test_owned_process_closed_on_shutdown(self):
        engine = Proofreader()
        engine.process = process = MagicMock()
        process.poll.return_value = None
        with patch("proofreader.os.killpg", create=True) as killpg:
            engine.close()
        self.assertIsNone(engine.process)
        self.assertTrue(engine.closed)
        process.wait.assert_called_once_with(timeout=3)
        if os.name == "nt":
            process.terminate.assert_called_once()
        else:
            killpg.assert_called_once()


if __name__ == "__main__":
    unittest.main()
