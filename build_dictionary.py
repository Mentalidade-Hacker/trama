"""Rebuild the bundled offline dictionary from Wiktextract/Kaikki source dumps."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import urllib.request
import uuid
import zlib

from dictionary import FORMAT, LANGUAGES, LICENSE, LICENSE_URL, PARTS, SOURCES, normalize_word

MAX_DOWNLOAD = 256 * 1024 * 1024
MAX_LINE = 16 * 1024 * 1024
MAX_EXPANDED = 2 * 1024 * 1024 * 1024
MAX_ROWS = 2_000_000
USER_AGENT = "Trama-Dictionary-Builder/1.0 (offline Wiktionary dictionary)"


def sha256(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def download_source(language, folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    destination = folder / f"{language}-wiktextract.jsonl.gz"
    if destination.is_file():
        print(f"Usando download existente: {destination}", flush=True)
        return destination
    temporary = folder / f".{language}-{uuid.uuid4().hex}.part"
    request = urllib.request.Request(SOURCES[language]["download"], headers={"User-Agent": USER_AGENT})
    total = 0
    try:
        with urllib.request.urlopen(request, timeout=60) as source, temporary.open("xb") as output:
            if not source.url.startswith("https://kaikki.org/"):
                raise ValueError("A origem redirecionou para um endereço inesperado.")
            expected = source.headers.get("Content-Length")
            expected = int(expected) if expected and expected.isdigit() else None
            if expected and expected > MAX_DOWNLOAD:
                raise ValueError("O dicionário excede o limite de download de 256 MiB.")
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_DOWNLOAD:
                    raise ValueError("O download excede o tamanho permitido.")
                output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        if expected is not None and total != expected:
            raise ValueError("Download incompleto do dicionário.")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"Fonte {language}: {total:,} bytes baixados.", flush=True)
    return destination


def normalize_entry(entry, language):
    if not isinstance(entry, dict) or entry.get("lang_code") != language:
        return None
    word = entry.get("word")
    if not isinstance(word, str) or not word.strip() or len(word) > 160:
        return None
    definitions = []
    senses = entry.get("senses", [])
    if not isinstance(senses, list):
        return None
    for sense in senses:
        if not isinstance(sense, dict):
            continue
        glosses = sense.get("glosses", [])
        if not isinstance(glosses, list):
            continue
        definition = " — ".join(gloss.strip() for gloss in glosses if isinstance(gloss, str) and gloss.strip())
        if not definition:
            continue
        examples = []
        source_examples = sense.get("examples", [])
        for example in source_examples if isinstance(source_examples, list) else []:
            if isinstance(example, dict) and isinstance(example.get("text"), str) and example["text"].strip():
                item = {"text": example["text"].strip()}
                reference = example.get("ref")
                if isinstance(reference, str) and reference.strip():
                    item["reference"] = reference.strip()
                translation = example.get("translation")
                if isinstance(translation, str) and translation.strip():
                    item["translation"] = translation.strip()
                examples.append(item)
        labels = [value for key in ("tags", "raw_tags") for value in (sense.get(key) if isinstance(sense.get(key), list) else []) if isinstance(value, str)]
        result = {"definition": definition, "examples": examples}
        if labels:
            result["labels"] = labels
        definitions.append(result)
    if not definitions:
        return None
    pos = entry.get("pos_title")
    if not isinstance(pos, str) or not pos:
        pos = PARTS.get(entry.get("pos"), str(entry.get("pos") or "Classe não informada"))
    serialized = json.dumps(definitions, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(serialized) > 2 * 1024 * 1024:
        raise ValueError(f"Verbete grande demais: {word!r}.")
    return (language, normalize_word(word), word, pos, zlib.compress(serialized, level=9))


def import_source(connection, path, language):
    if not Path(path).is_file() or Path(path).stat().st_size > MAX_DOWNLOAD:
        raise ValueError(f"Fonte {language} ausente ou maior que 256 MiB.")
    rows, total, lines = 0, 0, 0
    with gzip.open(path, "rb") as source:
        while True:
            raw = source.readline(MAX_LINE + 1)
            if not raw:
                break
            lines += 1
            total += len(raw)
            if len(raw) > MAX_LINE or total > MAX_EXPANDED or lines > MAX_ROWS:
                raise ValueError("O arquivo excede os limites de importação.")
            if not raw.strip():
                continue
            try:
                entry = json.loads(raw)
            except (ValueError, UnicodeError) as error:
                raise ValueError(f"JSON inválido em {language}, linha {lines}.") from error
            normalized = normalize_entry(entry, language)
            if normalized:
                connection.execute("INSERT INTO entries (language,lookup,word,pos,senses) VALUES (?,?,?,?,?)", normalized)
                rows += 1
            if lines % 100000 == 0:
                print(f"  {language}: {lines:,} linhas lidas; {rows:,} verbetes aproveitados…", flush=True)
    if not rows:
        raise ValueError(f"A fonte não contém definições do idioma {language}.")
    return rows


def build_database(paths, destination):
    destination = Path(destination).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix=".dictionary-build-", suffix=".sqlite", dir=destination.parent)
    os.close(descriptor)
    temporary = Path(name)
    try:
        with sqlite3.connect(temporary) as connection:
            connection.execute("PRAGMA journal_mode=OFF")
            connection.execute("PRAGMA synchronous=OFF")
            connection.execute("PRAGMA temp_store=MEMORY")
            connection.execute("CREATE TABLE entries (id INTEGER PRIMARY KEY, language TEXT NOT NULL, lookup TEXT NOT NULL, word TEXT NOT NULL, pos TEXT NOT NULL, senses BLOB NOT NULL)")
            connection.execute("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            counts, sources = {}, {}
            for language in LANGUAGES:
                print(f"Importando definições {language}…", flush=True)
                counts[language] = import_source(connection, paths[language], language)
                sources[language] = {"name": SOURCES[language]["name"], "url": SOURCES[language]["download"],
                                     "via": SOURCES[language]["via"], "sha256": sha256(paths[language]),
                                     "compressedBytes": Path(paths[language]).stat().st_size, "license": LICENSE,
                                     "licenseUrl": LICENSE_URL, "attribution": "Colaboradores do Wikcionário/Wiktionary; extração Wiktextract/Kaikki.org.",
                                     "changes": "Filtragem por idioma e reorganização para consulta local; definições e exemplos preservados."}
            connection.execute("CREATE INDEX entries_lookup ON entries(language,lookup)")
            manifest = {"format": FORMAT, "builtAt": datetime.now(timezone.utc).isoformat(), "counts": counts,
                        "sources": sources, "notes": "Português: Wikcionário. Inglês: Simple English Wiktionary, cobertura reduzida. Nenhuma consulta requer internet."}
            connection.execute("INSERT INTO metadata VALUES ('manifest',?)", (json.dumps(manifest, ensure_ascii=False),))
            connection.commit()
            result = connection.execute("PRAGMA integrity_check").fetchone()[0]
            if result != "ok":
                raise ValueError("Falha na verificação do banco de definições.")
        # Windows cannot replace a database with an active connection. Explicitly
        # close it before publishing; queries use read-only short-lived handles.
        connection.close()
        os.replace(temporary, destination)
        return manifest
    finally:
        if 'connection' in locals():
            connection.close()
        temporary.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Reconstrói o dicionário offline do Trama a partir de dados abertos.")
    parser.add_argument("--pt", type=Path, help="Arquivo ptwiktionary JSONL.gz já baixado")
    parser.add_argument("--en", type=Path, help="Arquivo Simple English Wiktionary JSONL.gz já baixado")
    parser.add_argument("--download-dir", type=Path, help="Baixar fontes ausentes nesta pasta (~42 MB); use uma pasta de trabalho")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent / "resources" / "dictionary.sqlite")
    args = parser.parse_args(argv)
    try:
        paths = {"pt": args.pt, "en": args.en}
        for language in LANGUAGES:
            if not paths[language]:
                if not args.download_dir:
                    raise ValueError("Informe --pt e --en ou uma pasta --download-dir para baixar as fontes.")
                print(f"Preparando fonte {language}…", flush=True)
                paths[language] = download_source(language, args.download_dir)
        manifest = build_database(paths, args.output)
        print(f"Dicionário pronto: {args.output.resolve()}", flush=True)
        print(json.dumps(manifest["counts"], ensure_ascii=False), flush=True)
        return 0
    except (OSError, ValueError, sqlite3.Error, EOFError, zlib.error) as error:
        print(f"Não foi possível preparar o dicionário: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
