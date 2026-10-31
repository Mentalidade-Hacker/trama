"""Read-only, offline Portuguese and English definitions from bundled open data."""
from __future__ import annotations

import json
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import unicodedata
from urllib.parse import quote
import zlib

FORMAT = "trama-dictionary-v1"
LANGUAGES = ("pt", "en")
LICENSE = "CC BY-SA 4.0"
LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/"
SOURCES = {
    "pt": {"name": "Wikcionário em português", "base": "https://pt.wiktionary.org/wiki/",
           "via": "https://kaikki.org/ptwiktionary/", "download": "https://kaikki.org/ptwiktionary/raw-wiktextract-data.jsonl.gz",
           "description": "Definições em português extraídas do Wikcionário por Wiktextract/Kaikki."},
    "en": {"name": "Simple English Wiktionary", "base": "https://simple.wiktionary.org/wiki/",
           "via": "https://kaikki.org/simplewiktionary/", "download": "https://kaikki.org/simplewiktionary/raw-wiktextract-data.jsonl.gz",
           "description": "Definições em inglês simplificado; a cobertura é menor que a edição completa em inglês."},
}
PARTS = {"noun": "Substantivo", "verb": "Verbo", "adj": "Adjetivo", "adv": "Advérbio",
         "name": "Nome próprio", "pron": "Pronome", "prep": "Preposição", "conj": "Conjunção",
         "intj": "Interjeição", "det": "Determinante", "article": "Artigo", "num": "Numeral",
         "phrase": "Expressão", "proverb": "Provérbio", "prefix": "Prefixo", "suffix": "Sufixo",
         "abbrev": "Abreviação", "symbol": "Símbolo", "particle": "Partícula", "character": "Caractere"}
MAX_LOOKUP = 160
MAX_MATCHES = 80
MAX_PAYLOAD = 2 * 1024 * 1024


class DictionaryError(Exception):
    def __init__(self, message, status=503, code="dictionary_unavailable"):
        super().__init__(message)
        self.status, self.code = status, code


def normalize_word(word):
    return unicodedata.normalize("NFC", " ".join(word.split())).casefold()


def validate_lookup(word, language):
    if language not in LANGUAGES:
        raise ValueError("Escolha português (pt) ou inglês (en).")
    if not isinstance(word, str) or not word.strip() or len(word) > MAX_LOOKUP:
        raise ValueError("Digite uma palavra ou expressão de até 160 caracteres.")
    if any(unicodedata.category(char).startswith("C") for char in word):
        raise ValueError("A consulta contém caracteres de controle ou inválidos.")
    return unicodedata.normalize("NFC", " ".join(word.split())), language


def source_for(language, word=None):
    source = SOURCES[language]
    url = source["base"] + quote(word.replace(" ", "_"), safe="") if word else source["base"]
    return {"name": source["name"], "url": url, "license": LICENSE, "licenseUrl": LICENSE_URL,
            "via": source["via"], "attribution": "Colaboradores do Wikcionário/Wiktionary; extração Wiktextract/Kaikki.org.",
            "changes": "Dados filtrados e reorganizados para consulta local no Trama.", "description": source["description"]}


def decode_senses(payload):
    if not isinstance(payload, bytes):
        raise ValueError("Formato de definições inválido.")
    decoder = zlib.decompressobj()
    raw = decoder.decompress(payload, MAX_PAYLOAD + 1)
    if len(raw) > MAX_PAYLOAD or not decoder.eof or decoder.unconsumed_tail:
        raise ValueError("Definições excedem o limite permitido.")
    result = json.loads(raw)
    if not isinstance(result, list) or any(not isinstance(item, dict) or not isinstance(item.get("definition"), str)
                                         or not isinstance(item.get("examples"), list)
                                         or any(not isinstance(example, dict) or not isinstance(example.get("text"), str) for example in item["examples"])
                                         for item in result):
        raise ValueError("Lista de definições inválida.")
    return result


class DictionaryService:
    def __init__(self, resource=None):
        configured = resource or os.environ.get("TRAMA_DICTIONARY_PATH")
        self.path = (Path(configured).expanduser() if configured else Path(__file__).resolve().parent / "resources" / "dictionary.sqlite").resolve()

    def _connect(self):
        if not self.path.is_file():
            raise DictionaryError("O dicionário local não foi encontrado. Use o pacote completo do Trama, incluindo a pasta resources.")
        connection = sqlite3.connect(self.path.as_uri() + "?mode=ro", uri=True, timeout=3)
        connection.execute("PRAGMA query_only=ON")
        connection.execute("PRAGMA trusted_schema=OFF")
        return connection

    @staticmethod
    def _metadata(connection):
        row = connection.execute("SELECT value FROM metadata WHERE key='manifest'").fetchone()
        metadata = json.loads(row[0]) if row else {}
        if not isinstance(metadata, dict) or metadata.get("format") != FORMAT:
            raise DictionaryError("O arquivo de dicionário não é compatível com esta versão do Trama.")
        if not isinstance(metadata.get("counts"), dict) or any(type(metadata["counts"].get(language)) is not int or metadata["counts"][language] < 0 for language in LANGUAGES):
            raise DictionaryError("Os metadados do dicionário estão incompletos.")
        return metadata

    def status(self):
        try:
            with closing(self._connect()) as connection:
                metadata = self._metadata(connection)
            languages = [language for language in LANGUAGES if metadata.get("counts", {}).get(language, 0)]
            return {"available": len(languages) == 2, "local": True, "languages": languages,
                    "counts": metadata.get("counts", {}), "builtAt": metadata.get("builtAt"),
                    "sources": [source_for(language) for language in languages],
                    "message": "Dicionário local: português e inglês simplificado. As consultas ficam neste computador."}
        except (DictionaryError, sqlite3.Error, OSError, ValueError) as error:
            return {"available": False, "local": True, "languages": [], "sources": [],
                    "message": str(error) if isinstance(error, DictionaryError) else "Não foi possível abrir o dicionário local. Confira os arquivos do aplicativo."}

    def lookup(self, word, language):
        word, language = validate_lookup(word, language)
        try:
            with closing(self._connect()) as connection:
                self._metadata(connection)
                rows = connection.execute("SELECT word, pos, senses FROM entries WHERE language=? AND lookup=? ORDER BY CASE WHEN word=? THEN 0 ELSE 1 END, id LIMIT ?",
                                          (language, normalize_word(word), word, MAX_MATCHES + 1)).fetchall()
            entries = []
            for headword, pos, payload in rows[:MAX_MATCHES]:
                definitions = decode_senses(payload)
                entries.append({"word": headword, "partOfSpeech": pos, "definitions": definitions,
                                "source": source_for(language, headword)})
            found = bool(entries)
            notice = "Definições em inglês simplificado." if language == "en" else "Definições em português."
            if not found:
                notice = "Esta palavra não foi encontrada na base local. Tente a forma básica ou confira a grafia."
            return {"word": word, "language": language, "found": found, "local": True,
                    "entries": entries, "truncated": len(rows) > MAX_MATCHES, "notice": notice}
        except DictionaryError:
            raise
        except (sqlite3.Error, OSError, ValueError, zlib.error) as error:
            raise DictionaryError("Não foi possível ler as definições. Confira o arquivo local do dicionário.", code="dictionary_read_failed") from error
