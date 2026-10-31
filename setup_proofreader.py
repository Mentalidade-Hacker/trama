"""Explicit portable LanguageTool + optional Temurin JRE installer.

Downloads only in this setup program; the editor's proofreading path is offline.
Upstream: https://dev.languagetool.org/http-server
Java distributions: https://api.adoptium.net/q/swagger-ui/
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import urllib.parse
import urllib.request
import uuid
import zipfile

from proofreader import Proofreader, ProofreaderError, java_command, writing_home

LT_URL = "https://languagetool.org/download/LanguageTool-stable.zip"
LT_SNAPSHOT_URL = "https://languagetool.org/download/snapshots/LanguageTool-latest-snapshot.zip"
USER_AGENT = "Trama-Writing-Setup/1.0"
MAX_ARCHIVE = 768 * 1024 * 1024
MAX_EXPANDED = 2 * 1024 * 1024 * 1024
MAX_ENTRIES = 50000


def options():
    return {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}


def java_major(executable):
    if not executable:
        return None
    try:
        result = subprocess.run([str(executable), "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10, **options())
        message = (result.stdout + result.stderr).decode("utf-8", errors="replace")
        match = re.search(r'(?:openjdk|java)\s+(?:version\s+)?"?(\d+)(?:\.(\d+))?', message)
        if result.returncode == 0 and match:
            return int(match[2]) if match[1] == "1" and match[2] else int(match[1])
    except (OSError, subprocess.TimeoutExpired):
        pass
    return None


def trusted_url(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.username or parsed.password:
        return False
    if parsed.hostname == "github.com":
        return parsed.path.startswith("/adoptium/temurin21-binaries/releases/")
    return parsed.hostname in {"languagetool.org", "www.languagetool.org", "api.adoptium.net", "release-assets.githubusercontent.com", "objects.githubusercontent.com"}


def fetch_json(url):
    if not trusted_url(url):
        raise ValueError("Endereço de metadados não autorizado.")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        if not trusted_url(response.url):
            raise ValueError("Redirecionamento de metadados não autorizado.")
        content = response.read(2 * 1024 * 1024 + 1)
    if len(content) > 2 * 1024 * 1024:
        raise ValueError("Metadados maiores que o esperado.")
    return json.loads(content.decode("utf-8"))


def java_asset():
    machine = platform.machine().lower()
    architecture = "x64" if machine in ("amd64", "x86_64") else "aarch64" if machine in ("arm64", "aarch64") else None
    system = "windows" if os.name == "nt" else "linux" if sys.platform.startswith("linux") else None
    if not architecture or not system:
        raise ValueError("Java portable automático suporta Windows/Linux x64 ou ARM64. Instale Java17+ pelo sistema nesta plataforma.")
    url = f"https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture={architecture}&image_type=jre&os={system}&vendor=eclipse"
    assets = fetch_json(url)
    if not isinstance(assets, list) or not assets:
        raise ValueError("A Adoptium não retornou um JRE para esta plataforma.")
    try:
        package = assets[0]["binary"]["package"]
        link, checksum, size = package["link"], package["checksum"], package["size"]
    except (KeyError, TypeError):
        raise ValueError("Metadados do JRE incompletos.") from None
    if not isinstance(link, str) or not trusted_url(link) or not isinstance(checksum, str) or not re.fullmatch(r"[a-fA-F0-9]{64}", checksum) or type(size) is not int or not 0 < size <= MAX_ARCHIVE:
        raise ValueError("Metadados do JRE inválidos.")
    return {"url": link, "sha256": checksum.lower(), "size": size, "version": assets[0].get("version", {}).get("semver", "21")}


def download(url, destination, expected_hash=None, expected_size=None):
    if not trusted_url(url):
        raise ValueError("Download fora dos servidores oficiais permitidos.")
    destination = Path(destination)
    partial = destination.with_name(destination.name + ".part")
    digest, total, reported = hashlib.sha256(), 0, 0
    try:
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=60) as response:
            if not trusted_url(response.url):
                raise ValueError("O download redirecionou para um servidor não permitido.")
            announced = response.headers.get("Content-Length")
            announced = int(announced) if announced and announced.isdigit() else None
            if announced and announced > MAX_ARCHIVE:
                raise ValueError("Download excede 768 MiB.")
            if announced:
                print(f"  Tamanho anunciado: {announced / 1024 / 1024:.1f} MiB", flush=True)
            with partial.open("wb") as output:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > MAX_ARCHIVE:
                        raise ValueError("Download excede 768 MiB.")
                    output.write(chunk)
                    digest.update(chunk)
                    if total - reported >= 32 * 1024 * 1024:
                        print(f"  {total // (1024 * 1024)} MiB recebidos", flush=True)
                        reported = total
                output.flush()
                os.fsync(output.fileno())
        if announced is not None and total != announced or expected_size is not None and total != expected_size:
            raise ValueError("O download não chegou completo.")
        if expected_hash and digest.hexdigest() != expected_hash:
            raise ValueError("O SHA-256 do JRE não confere com os metadados oficiais.")
        os.replace(partial, destination)
        return {"url": url, "size": total, "sha256": digest.hexdigest()}
    finally:
        partial.unlink(missing_ok=True)


def member_path(name):
    if not isinstance(name, str) or "\\" in name or "\x00" in name:
        raise ValueError("Caminho de arquivo inválido.")
    path = PurePosixPath(name)
    if not path.parts or path.is_absolute() or any(part in ("", ".", "..") or ":" in part for part in path.parts):
        raise ValueError("O pacote contém caminho fora da pasta de instalação.")
    return path


def safe_extract(archive_path, destination):
    destination = Path(destination).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    paths = set()
    expanded = 0

    def target(name, size):
        nonlocal expanded
        relative = member_path(name)
        key = str(relative).casefold() if os.name == "nt" else str(relative)
        if key in paths:
            raise ValueError("O pacote contém caminhos duplicados.")
        paths.add(key)
        expanded += size
        if len(paths) > MAX_ENTRIES or expanded > MAX_EXPANDED or size < 0:
            raise ValueError("O pacote excede os limites de extração.")
        path = (destination / str(relative)).resolve()
        if not path.is_relative_to(destination):
            raise ValueError("O arquivo sairia da pasta de instalação.")
        return path

    if zipfile.is_zipfile(archive_path):
        with zipfile.ZipFile(archive_path) as archive:
            for member in archive.infolist():
                path = target(member.filename, member.file_size)
                mode = member.external_attr >> 16
                if stat.S_ISLNK(mode) or member.flag_bits & 1:
                    raise ValueError("Links simbólicos/ZIPs criptografados não são permitidos.")
                if member.is_dir():
                    path.mkdir(parents=True, exist_ok=True)
                    continue
                path.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as source, path.open("xb") as output:
                    shutil.copyfileobj(source, output, 1024 * 1024)
                if os.name != "nt" and mode & 0o111:
                    path.chmod(0o755)
    else:
        links = []
        with tarfile.open(archive_path, "r:gz") as archive:
            for member in archive:
                path = target(member.name, member.size)
                if member.isdir():
                    path.mkdir(parents=True, exist_ok=True)
                elif member.isfile():
                    path.parent.mkdir(parents=True, exist_ok=True)
                    with archive.extractfile(member) as source, path.open("xb") as output:
                        shutil.copyfileobj(source, output, 1024 * 1024)
                    if member.mode & 0o111:
                        path.chmod(0o755)
                elif member.issym() or member.islnk():
                    # Temurin tarballs may link licenses/libraries internally.
                    # Materialize copies after regular files; never create a
                    # filesystem symlink that could redirect later extraction.
                    if "\\" in member.linkname or PurePosixPath(member.linkname).is_absolute():
                        raise ValueError("Link externo no pacote Java.")
                    linked = ((path.parent if member.issym() else destination) / member.linkname).resolve()
                    if not linked.is_relative_to(destination):
                        raise ValueError("Link externo no pacote Java.")
                    links.append((path, linked))
                else:
                    raise ValueError("O pacote contém arquivo especial não permitido.")
        while links:
            remaining = []
            for path, linked in links:
                if linked.is_file():
                    expanded += linked.stat().st_size
                    if expanded > MAX_EXPANDED:
                        raise ValueError("Links expandidos excedem o limite do pacote.")
                    path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(linked, path)
                else:
                    remaining.append((path, linked))
            if len(remaining) == len(links):
                raise ValueError("O pacote contém links ausentes ou circulares.")
            links = remaining


def promote(source, destination, home):
    source, destination, home = Path(source).resolve(), Path(destination).resolve(), Path(home).resolve()
    if not source.is_relative_to(home) or destination.parent != home:
        raise ValueError("Destino de instalação fora da pasta escolhida.")
    backup = None
    if destination.exists():
        backup = home / f".{destination.name}-previous-{uuid.uuid4().hex}"
        destination.rename(backup)
    try:
        source.rename(destination)
    except Exception:
        if backup:
            backup.rename(destination)
        raise
    return str(backup) if backup else None


def check_install(home, real=False):
    engine = Proofreader(writing_directory=home)
    try:
        state = engine.status()
        if not state["available"]:
            raise ValueError(state["message"])
        if real:
            # Fixed diagnostics only; never use or transmit the user's notes.
            for language, text in (("en-US", "This are a test."), ("pt-BR", "As pessoa está feliz.")):
                result = engine.check({"text": text, "language": language})
                if not result.get("matches"):
                    raise ValueError(f"O motor iniciou, mas não sinalizou o exemplo de diagnóstico {language}.")
                print(f"  {language}: {len(result['matches'])} sugestão(ões) no diagnóstico local", flush=True)
        return state
    finally:
        engine.close()


def install(home, portable_java=False, snapshot=False, verify=True):
    home = Path(home).expanduser().resolve()
    home.mkdir(parents=True, exist_ok=True)
    executable = java_command(home)
    major = java_major(executable)
    need_java = portable_java or major is None or major < 17
    if need_java and os.name != "nt" and not portable_java:
        raise ValueError("No Arch, execute sudo pacman -S --needed languagetool jre21-openjdk-headless; ou use --portable-java para instalar uma cópia isolada.")
    asset = java_asset() if need_java else None
    print(f"Destino: {home}\nLanguageTool servidor: download de algumas centenas de MB.", flush=True)
    if asset:
        print(f"Temurin JRE21: {asset['size'] / 1024 / 1024:.1f} MiB (SHA-256 oficial será conferido).", flush=True)
    staging = Path(tempfile.mkdtemp(prefix=".writing-setup-", dir=home)).resolve()
    receipts = {"source": "official portable distributions", "java": None}
    try:
        if asset:
            java_archive = staging / "java.archive"
            receipts["java"] = download(asset["url"], java_archive, asset["sha256"], asset["size"])
            safe_extract(java_archive, staging / "java-extracted")
            java_name = "java.exe" if os.name == "nt" else "java"
            candidates = [path for path in (staging / "java-extracted").rglob(java_name) if path.parent.name == "bin" and path.is_file()]
            if len(candidates) != 1 or (java_major(candidates[0]) or 0) < 17:
                raise ValueError("O pacote Java não contém um JRE17+ válido.")
            promote(candidates[0].parent.parent, home / "java", home)
        lt_archive = staging / "languagetool.zip"
        receipts["languagetool"] = download(LT_SNAPSHOT_URL if snapshot else LT_URL, lt_archive)
        safe_extract(lt_archive, staging / "lt-extracted")
        jars = list((staging / "lt-extracted").rglob("languagetool-server.jar"))
        if len(jars) != 1 or not (jars[0].parent / "libs").is_dir():
            raise ValueError("O arquivo baixado não contém o servidor LanguageTool esperado.")
        promote(jars[0].parent, home / "languagetool", home)
        (home / "install-receipt.json").write_text(json.dumps(receipts, ensure_ascii=False, indent=2), encoding="utf-8")
        state = check_install(home, real=verify)
        print("Corretor local pronto. Volte ao Trama e ative a revisão ao escrever.", flush=True)
        return state
    finally:
        if staging.parent == home and staging.name.startswith(".writing-setup-"):
            shutil.rmtree(staging)


def main():
    parser = argparse.ArgumentParser(description="Instalar o corretor local do Trama sem alterar suas notas.")
    parser.add_argument("--directory", type=Path, help="Pasta writing exata; substitui TRAMA_WRITING_HOME/default.")
    parser.add_argument("--portable-java", action="store_true", help="Baixar Temurin JRE21 isolado, inclusive no Linux.")
    parser.add_argument("--snapshot", action="store_true", help="Usar o snapshot oficial em vez da versão estável.")
    parser.add_argument("--yes", action="store_true", help="Confirmar a instalação solicitada; compatibilidade com automação.")
    parser.add_argument("--check", action="store_true", help="Testar a instalação existente, sem baixar nada.")
    parser.add_argument("--skip-check", action="store_true", help="Não executar os diagnósticos gramaticais após instalar.")
    args = parser.parse_args()
    home = args.directory.expanduser().resolve() if args.directory else writing_home()
    try:
        if args.check:
            check_install(home, real=True)
        else:
            install(home, portable_java=args.portable_java, snapshot=args.snapshot, verify=not args.skip_check)
        return 0
    except (OSError, ValueError, ProofreaderError, zipfile.BadZipFile, tarfile.TarError, subprocess.SubprocessError) as error:
        print(f"Não foi possível preparar o corretor: {error}\nAs notas não foram alteradas. Destino do corretor: {home}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
