"""One-request, offline CPU translation worker for Argos-format packages.

Protocol: UTF-8 JSON stdin/stdout; imported dependencies must be installed in the
dedicated venv by the explicit installer. No Argos runtime, Torch, Stanza, model
download or remote service is imported or invoked.

Model layout and tokenization follow the upstream Argos source:
https://github.com/argosopentech/argos-translate/blob/master/argostranslate/package.py
https://github.com/argosopentech/argos-translate/blob/master/argostranslate/tokenizer.py
Inference uses https://opennmt.net/CTranslate2/python/ctranslate2.Translator.html
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys

# -I excludes the script directory; add only this known application directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from translation import validate_payload

MAX_TOKENS = 512


def package(home, source, target):
    directory = Path(home) / "models" / f"{source}_{target}"
    if not (directory / "model" / "model.bin").is_file() or not (directory / "sentencepiece.model").is_file():
        raise ValueError("Modelo local ausente. Execute o instalador de tradução PT↔EN.")
    metadata = {}
    metadata_path = directory / "metadata.json"
    if metadata_path.is_file():
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise ValueError("Os metadados do modelo estão corrompidos. Reinstale os modelos locais.") from None
        if not isinstance(metadata, dict) or metadata.get("from_code", source) != source or metadata.get("to_code", target) != target:
            raise ValueError("O modelo instalado não corresponde ao par de idiomas selecionado.")
    prefix = metadata.get("target_prefix", "")
    if not isinstance(prefix, str) or len(prefix) > 200:
        raise ValueError("Prefixo de tradução inválido no modelo.")
    return directory, prefix


def split_text(text, tokenizer):
    """Preserve whitespace and split long prose without truncating source tokens.

    This deliberately uses simple punctuation/whitespace boundaries instead of
    downloading sentence-boundary models. Each part is (text, tokens-or-None).
    """
    result = []

    def prose(value):
        if not value:
            return
        leading = len(value) - len(value.lstrip(" \t"))
        trailing = len(value) - len(value.rstrip(" \t"))
        if not value.strip():
            result.append((value, None))
            return
        if leading:
            result.append((value[:leading], None))
        body = value[leading:len(value) - trailing if trailing else len(value)]
        tokens = tokenizer.encode(body, out_type=str)
        if len(tokens) <= MAX_TOKENS:
            result.append((body, tokens))
        else:
            words = re.findall(r"\S+[ \t]*", body)
            index = 0
            while index < len(words):
                low, high, best = 1, len(words) - index, 0
                while low <= high:
                    middle = (low + high) // 2
                    candidate = "".join(words[index:index + middle]).rstrip(" \t")
                    if len(tokenizer.encode(candidate, out_type=str)) <= MAX_TOKENS:
                        best, low = middle, middle + 1
                    else:
                        high = middle - 1
                if not best:
                    raise ValueError("Um trecho sem espaços é longo demais. Divida o trecho antes de traduzir.")
                chunk = "".join(words[index:index + best])
                clean = chunk.rstrip(" \t")
                result.append((clean, tokenizer.encode(clean, out_type=str)))
                if len(clean) != len(chunk):
                    result.append((chunk[len(clean):], None))
                index += best
        if trailing:
            result.append((value[-trailing:], None))

    for line in re.split(r"(\r\n|\r|\n)", text):
        if line in ("\r\n", "\r", "\n"):
            result.append((line, None))
            continue
        for part in re.split(r"(?<=[.!?])([ \t]+)(?=[A-ZÀ-ÖØ-Þ])", line):
            prose(part)
    return result


def translate_texts(home, payload, engine_module=None, tokenizer_module=None):
    source, target, texts = validate_payload(payload)
    if source == target or not texts or not any(text.strip() for text in texts):
        return {"texts": list(texts), "local": True}
    if engine_module is None:
        import ctranslate2 as engine_module
    if tokenizer_module is None:
        import sentencepiece as tokenizer_module
    directory, prefix = package(home, source, target)
    tokenizer = tokenizer_module.SentencePieceProcessor(model_file=str(directory / "sentencepiece.model"))
    translator = engine_module.Translator(str(directory / "model"), device="cpu", compute_type="int8", inter_threads=1, intra_threads=max(1, min(4, os.cpu_count() or 1)))
    segmented = [split_text(text, tokenizer) for text in texts]
    jobs = [tokens for parts in segmented for _, tokens in parts if tokens is not None]
    if len(jobs) > 5000:
        raise ValueError("Há trechos demais para uma única tradução. Traduza uma página menor.")
    results = translator.translate_batch(jobs, target_prefix=[[prefix]] * len(jobs) if prefix else None,
                                         replace_unknowns=True, beam_size=2, num_hypotheses=1,
                                         length_penalty=0.2, max_batch_size=1024, batch_type="tokens",
                                         max_input_length=0, max_decoding_length=1536)
    if len(results) != len(jobs):
        raise ValueError("O motor retornou uma quantidade inesperada de segmentos.")
    decoded = []
    for result in results:
        if not result.hypotheses or len(result.hypotheses[0]) >= 1536:
            raise ValueError("A tradução excedeu o limite de saída. Divida o trecho em partes menores.")
        value = tokenizer.decode_pieces(result.hypotheses[0]).replace("▁", " ")
        if prefix and value.startswith(prefix):
            value = value[len(prefix):]
        decoded.append(value.strip())
    iterator = iter(decoded)
    translated = ["".join(original if tokens is None else next(iterator) for original, tokens in parts) for parts in segmented]
    return {"texts": translated, "local": True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        if args.check:
            import ctranslate2
            import sentencepiece
            package(args.home, "en", "pt")
            package(args.home, "pt", "en")
            result = {"available": True, "local": True}
        else:
            raw = sys.stdin.buffer.read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                raise ValueError("Solicitação de tradução grande demais.")
            payload = json.loads(raw.decode("utf-8"))
            result = translate_texts(args.home, payload)
        sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
        return 0
    except ImportError:
        error = "Dependências de tradução indisponíveis. Reinstale o runtime CTranslate2 e SentencePiece pelo instalador do Trama."
    except (ValueError, UnicodeError) as exc:
        error = str(exc)
    except Exception:
        error = "Não foi possível executar o modelo local. Confira a instalação dos modelos e o runtime."
    sys.stdout.buffer.write(json.dumps({"error": error}, ensure_ascii=False).encode("utf-8"))
    return 1


if __name__ == "__main__":
    sys.exit(main())
