"""Install the optional local PT/EN translation engine, without touching user notes."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
import venv
import zipfile

INDEX_URL = "https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json"
USER_AGENT = "Trama-Translation-Setup/1.0"
PAIRS = ("en_pt", "pt_en")
DEPENDENCIES = ("ctranslate2>=4.0,<5", "sentencepiece>=0.2,<1")
MAX_ARCHIVE = 256 * 1024 * 1024
MAX_EXPANDED = 512 * 1024 * 1024
MAX_ENTRIES = 10000


def translation_home(directory=None):
    if directory:
        return Path(directory).expanduser().resolve()
    override = os.environ.get("TRAMA_TRANSLATION_HOME")
    if override:
        return Path(override).expanduser().resolve()
    from server import default_data_directory
    return (default_data_directory() / "translation").resolve()


def runtime_python(home):
    return Path(home) / "runtime" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def digest_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def official_https(url):
    parsed = urllib.parse.urlparse(url)
    return parsed.scheme == "https" and parsed.hostname in {
        "argos-net.com", "www.argosopentech.com", "argosopentech.com",
        "github.com", "raw.githubusercontent.com",
    } and parsed.username is None and parsed.password is None


def fetch_index():
    request = urllib.request.Request(INDEX_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = response.read(4 * 1024 * 1024 + 1)
    if len(payload) > 4 * 1024 * 1024:
        raise ValueError("O índice de modelos excede o tamanho esperado.")
    result = json.loads(payload.decode("utf-8"))
    if not isinstance(result, list):
        raise ValueError("O índice oficial não retornou uma lista de modelos.")
    return result


def select_package(index, pair):
    if pair not in PAIRS:
        raise ValueError("Par de idiomas inválido.")
    source, target = pair.split("_")
    candidates = [item for item in index if isinstance(item, dict)
                  and item.get("from_code") == source and item.get("to_code") == target
                  and item.get("type", "translate") == "translate"]
    if not candidates:
        raise ValueError(f"O índice oficial não contém o modelo {pair}.")
    def version(item):
        return tuple(int(number) for number in re.findall(r"\d+", str(item.get("package_version", "0"))))
    selected = max(candidates, key=version)
    if not isinstance(selected.get("links"), list) or not any(isinstance(url, str) and official_https(url) for url in selected["links"]):
        raise ValueError(f"O modelo {pair} não anuncia um download HTTPS em domínio oficial reconhecido.")
    return selected


def download_model(package, destination):
    destination = Path(destination)
    temporary = destination.with_suffix(destination.suffix + ".part")
    errors = []
    for url in package["links"]:
        if not isinstance(url, str) or not official_https(url):
            continue
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=60) as response:
                if urllib.parse.urlparse(response.url).scheme != "https":
                    raise ValueError("O download redirecionou para uma conexão sem HTTPS.")
                expected = response.headers.get("Content-Length")
                expected = int(expected) if expected and expected.isdigit() else None
                if expected and expected > MAX_ARCHIVE:
                    raise ValueError("O pacote excede o limite de 256 MiB.")
                total, reported = 0, 0
                with temporary.open("wb") as output:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        total += len(chunk)
                        if total > MAX_ARCHIVE:
                            raise ValueError("O pacote excede o limite de 256 MiB.")
                        output.write(chunk)
                        if total - reported >= 16 * 1024 * 1024:
                            print(f"  {total // (1024 * 1024)} MiB recebidos…", flush=True)
                            reported = total
                    output.flush()
                    os.fsync(output.fileno())
                if expected is not None and total != expected:
                    raise ValueError("Download incompleto; o tamanho recebido não confere.")
            os.replace(temporary, destination)
            return url
        except (OSError, ValueError, urllib.error.URLError) as error:
            errors.append(str(error))
            temporary.unlink(missing_ok=True)
    raise ValueError("Não foi possível baixar o modelo oficial: " + "; ".join(errors)
                     + ". Tente novamente ou use --model-file PAR=arquivo.argosmodel com uma cópia oficial.")


def inspect_archive(archive, pair):
    """Validate every archive entry before writing; return root and relevant members."""
    if pair not in PAIRS:
        raise ValueError("Par de idiomas inválido.")
    infos = archive.infolist()
    if len(infos) > MAX_ENTRIES:
        raise ValueError("Pacote com arquivos demais.")
    seen, total, names = set(), 0, {}
    for info in infos:
        name = info.orig_filename
        path = PurePosixPath(name)
        raw_parts = name.rstrip("/").split("/")
        if not name or "\\" in name or "\x00" in name or path.is_absolute() or any(part in ("", "..", ".") or ":" in part for part in raw_parts):
            raise ValueError("Caminho não permitido dentro do pacote.")
        if any(part.endswith((".", " ")) or re.fullmatch(r"(?i)(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?", part) for part in raw_parts):
            raise ValueError("Nome de arquivo incompatível com Windows no pacote.")
        if any(ord(char) < 32 for char in name):
            raise ValueError("Nome de arquivo inválido no pacote.")
        normalized = str(path).casefold().rstrip("/")
        if normalized in seen:
            raise ValueError("Caminho duplicado no pacote.")
        seen.add(normalized)
        mode = (info.external_attr >> 16) & 0xFFFF
        if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
            raise ValueError("Links ou arquivos especiais não são permitidos no modelo.")
        if info.flag_bits & 1:
            raise ValueError("Pacote de modelo criptografado não é suportado.")
        total += info.file_size
        if info.file_size > MAX_ARCHIVE or total > MAX_EXPANDED:
            raise ValueError("O pacote excede o limite de expansão permitido.")
        if info.file_size > 1024 * 1024 and info.file_size > max(1, info.compress_size) * 500:
            raise ValueError("Taxa de compressão anormal no pacote.")
        if not info.is_dir():
            names[str(path)] = info
    roots = []
    for name in names:
        if PurePosixPath(name).name != "metadata.json":
            continue
        prefix = name[:-len("metadata.json")]
        if prefix + "model/model.bin" in names and prefix + "sentencepiece.model" in names:
            roots.append(prefix)
    if len(roots) != 1:
        raise ValueError("O pacote precisa conter um único modelo CTranslate2 e sentencepiece.model.")
    prefix = roots[0]
    metadata_info = names[prefix + "metadata.json"]
    if metadata_info.file_size > 1024 * 1024:
        raise ValueError("Metadados do modelo grandes demais.")
    metadata = json.loads(archive.read(metadata_info).decode("utf-8"))
    if not isinstance(metadata, dict) or f"{metadata.get('from_code')}_{metadata.get('to_code')}" != pair:
        raise ValueError("O idioma declarado pelo pacote não corresponde ao modelo solicitado.")
    selected = []
    for name, info in names.items():
        if not name.startswith(prefix):
            continue
        relative = name[len(prefix):]
        if relative.startswith("model/") or relative in ("sentencepiece.model", "metadata.json", "README.md", "LICENSE", "LICENSE.txt"):
            selected.append((relative, info))
    return metadata, selected


def install_model(archive_path, models_directory, pair):
    archive_path, models_directory = Path(archive_path), Path(models_directory)
    if not archive_path.is_file() or archive_path.stat().st_size > MAX_ARCHIVE:
        raise ValueError("Pacote ausente ou maior que 256 MiB.")
    models_directory.mkdir(parents=True, exist_ok=True)
    destination = models_directory / pair
    if destination.is_symlink():
        raise ValueError("A pasta de modelo existente é um link simbólico; escolha outra pasta de instalação.")
    with zipfile.ZipFile(archive_path) as archive:
        metadata, members = inspect_archive(archive, pair)
        staging = Path(tempfile.mkdtemp(prefix=f".{pair}-install-", dir=models_directory))
        try:
            for relative, info in members:
                target = staging.joinpath(*PurePosixPath(relative).parts)
                if not target.resolve().is_relative_to(staging.resolve()):
                    raise ValueError("Destino do arquivo fora da pasta de instalação.")
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output, length=1024 * 1024)
            record = {"format": "trama-translation-model-v1", "pair": pair,
                      "archiveSha256": digest_file(archive_path), "packageVersion": metadata.get("package_version")}
            (staging / "trama-install.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
            backup = None
            if destination.exists():
                if not destination.is_dir():
                    raise ValueError("O destino do modelo não é uma pasta.")
                backup = models_directory / f".{pair}-previous-{uuid.uuid4().hex}"
                destination.rename(backup)
            try:
                staging.rename(destination)
            except OSError:
                if backup and not destination.exists():
                    backup.rename(destination)
                raise
            return record
        finally:
            # Only our private staging directory, checked to remain under the
            # explicitly selected models directory. Existing versions are kept.
            if staging.exists() and staging.resolve().parent == models_directory.resolve():
                shutil.rmtree(staging)


def model_ready(home, pair):
    root = Path(home) / "models" / pair
    try:
        metadata = json.loads((root / "metadata.json").read_text(encoding="utf-8"))
        return (root / "model" / "model.bin").is_file() and (root / "sentencepiece.model").is_file() and f"{metadata.get('from_code')}_{metadata.get('to_code')}" == pair
    except (OSError, ValueError, AttributeError):
        return False


def install_runtime(home):
    executable = runtime_python(home)
    if not executable.is_file():
        print("Preparando ambiente Python separado…", flush=True)
        venv.EnvBuilder(with_pip=True).create(Path(home) / "runtime")
    probe = subprocess.run([str(executable), "-I", "-m", "pip", "--version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if probe.returncode:
        print("Completando instalação anterior do ambiente Python…", flush=True)
        try:
            subprocess.run([str(executable), "-I", "-m", "ensurepip", "--upgrade"], check=True)
        except subprocess.CalledProcessError as error:
            raise ValueError("Não foi possível preparar o pip no ambiente separado. Confira se a pasta temporária do sistema pode ser gravada e execute novamente; no Linux, confira se seu Python inclui venv e ensurepip.") from error
    print("Instalando CTranslate2 e SentencePiece (pacotes binários)…", flush=True)
    command = [str(executable), "-I", "-m", "pip", "--isolated", "install", "--disable-pip-version-check", "--only-binary=:all:",
               "--index-url", "https://pypi.org/simple", *DEPENDENCIES]
    try:
        subprocess.run(command, check=True)
        subprocess.run([str(executable), "-I", "-c", "import ctranslate2, sentencepiece; print('Motor de tradução carregado.')"], check=True)
    except subprocess.CalledProcessError as error:
        raise ValueError("Não foi possível instalar/carregar os pacotes binários para este Python. Use Python 3.10 ou mais recente com wheels disponíveis para seu sistema; versões recém-lançadas podem ainda não ter suporte. No Windows, confira também o Microsoft Visual C++ Redistributable x64. O editor e suas notas não foram alterados.") from error
    return executable


def verify_installation(home):
    executable = runtime_python(home)
    if not executable.is_file() or not all(model_ready(home, pair) for pair in PAIRS):
        return False
    worker = Path(__file__).resolve().with_name("translation_worker.py")
    if not worker.is_file():
        raise ValueError("translation_worker.py não está ao lado do instalador. Use o pacote completo do Trama.")
    subprocess.run([str(executable), "-I", "-u", "-X", "utf8", str(worker), "--home", str(home), "--check"], check=True, timeout=120)
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description="Instala tradução local inglês/português para o Trama.")
    parser.add_argument("--directory", type=Path, help="Pasta translation alternativa (também pode usar TRAMA_TRANSLATION_HOME)")
    parser.add_argument("--model-file", action="append", default=[], metavar="PAR=ARQUIVO", help="Pacote oficial já baixado: en_pt=arquivo.argosmodel ou pt_en=arquivo.argosmodel")
    parser.add_argument("--refresh", action="store_true", help="Reinstalar modelos; versões anteriores são preservadas")
    parser.add_argument("--check", action="store_true", help="Verificar instalação existente sem baixar nem instalar")
    args = parser.parse_args(argv)
    try:
        if sys.version_info < (3, 10):
            raise ValueError("Use Python 3.10 ou mais recente.")
        home = translation_home(args.directory)
        if args.check:
            if not verify_installation(home):
                raise ValueError("A tradução local ainda não está instalada por completo.")
            print(f"Tradução local disponível em: {home}")
            return 0
        local = {}
        for entry in args.model_file:
            pair, separator, path = entry.partition("=")
            if separator != "=" or pair not in PAIRS or not path or pair in local:
                raise ValueError("Use --model-file en_pt=ARQUIVO ou --model-file pt_en=ARQUIVO, uma vez por idioma.")
            local[pair] = Path(path).expanduser().resolve()
        home.mkdir(parents=True, exist_ok=True)
        print(f"Instalação de tradução: {home}", flush=True)
        print("Modelos oficiais PT/EN: cerca de 136 MB de download, além dos pacotes do motor. Nenhuma nota é enviada.", flush=True)
        install_runtime(home)
        needed = [pair for pair in PAIRS if args.refresh or pair in local or not model_ready(home, pair)]
        index = fetch_index() if any(pair not in local for pair in needed) else []
        cache = home / "downloads"
        cache.mkdir(exist_ok=True)
        for pair in needed:
            source_url = None
            if pair in local:
                archive_path = local[pair]
            else:
                package = select_package(index, pair)
                version = str(package.get("package_version", "model"))
                safe_version = re.sub(r"[^a-zA-Z0-9_.-]", "_", version)
                archive_path = cache / f"{pair}-{safe_version}.argosmodel"
                print(f"Baixando modelo oficial {pair}…", flush=True)
                source_url = download_model(package, archive_path)
            record = install_model(archive_path, home / "models", pair)
            if source_url:
                record["source"] = source_url
                (home / "models" / pair / "trama-install.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
            print(f"Modelo {pair} instalado. SHA-256: {record['archiveSha256']}", flush=True)
        if not verify_installation(home):
            raise ValueError("A instalação ficou incompleta. Execute o instalador novamente.")
        print("Tradução local pronta. Reabra o Trama para usar o botão Traduzir.", flush=True)
        return 0
    except (OSError, ValueError, zipfile.BadZipFile, subprocess.SubprocessError, urllib.error.URLError) as error:
        print(f"Não foi possível concluir a instalação: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
