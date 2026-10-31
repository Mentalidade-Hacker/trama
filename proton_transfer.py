"""Opt-in transport of immutable Trama snapshots using Proton's official CLI.

This module never stores credentials and never invokes remote deletion or replacement.
Manual helpers and the configured automatic worker share the same transport.
Authentication belongs to the CLI and requires an explicit sign-in action.
"""
from __future__ import annotations

import argparse
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import threading

SNAPSHOT_NAME = re.compile(r"^([a-f0-9]{32})\.(json|zip)$")
HEX_HASH = re.compile(r"^[a-f0-9]{64}$")
DOWNLOAD_PAGE = "https://proton.me/download/drive/cli/index.html"


def file_hash(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_file(path):
    path = Path(path)
    return path.is_file() and not path.is_symlink()


def snapshot_pair(folder, snapshot_id, cache=None):
    if not re.fullmatch(r"[a-f0-9]{32}", snapshot_id):
        raise ValueError("Identificador de cópia inválido.")
    folder = Path(folder)
    metadata_path, archive_path = folder / f"{snapshot_id}.json", folder / f"{snapshot_id}.zip"
    if not safe_file(metadata_path) or not safe_file(archive_path):
        raise ValueError(f"Cópia incompleta ou com link simbólico: {snapshot_id}")
    def signatures():
        return tuple((p.stat().st_size, p.stat().st_mtime_ns, p.stat().st_ctime_ns, p.stat().st_ino) for p in (metadata_path, archive_path))
    signature = signatures()
    cache_key = str(metadata_path.resolve())
    if cache is not None and cache.get(cache_key) == signature:
        return archive_path, metadata_path
    if metadata_path.stat().st_size > 1024 * 1024:
        raise ValueError("Metadados da cópia excedem o tamanho permitido.")
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if not isinstance(metadata, dict) or metadata.get("format") != "trama-sync-v1" or metadata.get("id") != snapshot_id:
        raise ValueError(f"Metadados inválidos: {snapshot_id}")
    expected_hash = metadata.get("sha256")
    if not isinstance(expected_hash, str) or not HEX_HASH.fullmatch(expected_hash) or file_hash(archive_path) != expected_hash:
        raise ValueError(f"A verificação da cópia falhou: {snapshot_id}. Nenhum arquivo será substituído.")
    if cache is not None and signatures() == signature:
        cache[cache_key] = signature
    return archive_path, metadata_path


def local_pairs(folder, cache=None):
    folder = Path(folder)
    if not folder.is_dir():
        raise ValueError("Escolha uma pasta local de sincronização existente.")
    pairs = []
    for metadata_path in sorted(folder.glob("*.json")):
        match = SNAPSHOT_NAME.fullmatch(metadata_path.name)
        if not match or not safe_file(metadata_path):
            continue
        archive = folder / f"{match[1]}.zip"
        if not safe_file(archive):
            continue  # In-flight/incomplete pairs are not published.
        pairs.append(snapshot_pair(folder, match[1], cache))
    return pairs


def remote_folder(value):
    value = value.rstrip("/")
    if not value.startswith("/my-files/") or any(part in ("", ".", "..") for part in value.split("/")[1:]):
        raise ValueError("Use uma pasta dedicada, como /my-files/Trama, e não a raiz inteira do Drive.")
    if any(ord(char) < 32 for char in value) or "\\" in value:
        raise ValueError("Caminho remoto inválido.")
    return value


def remote_names(payload):
    if not isinstance(payload, list):
        raise ValueError("Formato inesperado da listagem do Proton Drive. Atualize a CLI oficial.")
    names = set()
    for item in payload:
        if not isinstance(item, dict):
            raise ValueError("Item inválido na listagem do Proton Drive.")
        name = item.get("name")
        if isinstance(name, dict):
            if name.get("ok") is not True:
                continue
            name = name.get("value")
        if not isinstance(name, str):
            continue
        if SNAPSHOT_NAME.fullmatch(name):
            if item.get("type") != "file":
                raise ValueError(f"Existe uma pasta com nome de cópia no Drive: {name}")
            if name in names:
                raise ValueError(f"Nome duplicado no Drive: {name}")
            names.add(name)
    return names


def find_cli(explicit=None):
    choice = explicit or os.environ.get("PROTON_DRIVE_BIN") or "proton-drive"
    executable = shutil.which(choice)
    if not executable:
        candidate = Path(choice).expanduser()
        if candidate.is_file():
            executable = str(candidate.resolve())
    if not executable:
        raise ValueError(f"CLI oficial do Proton Drive não encontrada. Baixe em {DOWNLOAD_PAGE} e coloque proton-drive no PATH, ou use --cli com o caminho do executável.")
    return executable


class ProtonCLI:
    def __init__(self, executable):
        self.executable = executable

    def call(self, *args, capture=False):
        result = subprocess.run([self.executable, *args], check=True, text=True,
                                encoding="utf-8", errors="replace", capture_output=capture)
        return result.stdout if capture else None

    def verify_transfer_flags(self, operation):
        help_text = self.call("filesystem", operation, "--help", capture=True)
        if "file-conflict-strategy" not in help_text or "skip" not in help_text:
            raise ValueError("Sua CLI não anuncia a opção de pular conflitos. Atualize a CLI oficial antes de transferir; o Trama não tentará sobrescrever arquivos.")

    def names(self, remote):
        return remote_names(json.loads(self.call("filesystem", "list", remote, "--json", capture=True)))

    def upload_file(self, path, remote):
        self.call("filesystem", "upload", str(path), remote, "--file-conflict-strategy", "skip")

    def download_file(self, remote_path, folder):
        self.call("filesystem", "download", remote_path, str(folder), "--file-conflict-strategy", "skip")


def publish_files(cli, folder, remote, cache=None):
    folder = Path(folder).resolve()
    remote = remote_folder(remote)
    pairs = local_pairs(folder, cache)
    cli.verify_transfer_flags("upload")
    existing = cli.names(remote)
    count = 0
    for archive, metadata in pairs:
        # ZIP first, JSON last: readers only inspect complete pairs.
        for path in (archive, metadata):
            if path.name in existing:
                continue
            cli.upload_file(path, remote)
            existing.add(path.name)
            count += 1
    return count


def publish_no_replace(temporary, destination, windows=None):
    if windows is None:
        windows = os.name == "nt"
    if windows:
        # Unlike POSIX rename, Windows rename refuses an existing target.
        os.rename(temporary, destination)
        return
    try:
        os.link(temporary, destination)
    except OSError as error:
        unsupported = {errno.EPERM, errno.EXDEV, errno.ENOSYS, errno.EOPNOTSUPP}
        if error.errno not in unsupported:
            raise
        # Some shared/FUSE filesystems lack hard links. Exclusive creation still
        # prevents replacement. ZIP-before-JSON plus checksum validation keeps
        # partial copies from being accepted by the Trama sync scanner.
        with destination.open("xb") as output, temporary.open("rb") as source:
            shutil.copyfileobj(source, output)
            output.flush()
            os.fsync(output.fileno())


def install_immutable(source, destination):
    """Publish a complete local file without replacing an existing inode."""
    source, destination = Path(source), Path(destination)
    if destination.exists() or destination.is_symlink():
        if not safe_file(destination) or file_hash(source) != file_hash(destination):
            raise ValueError(f"Já existe uma cópia diferente com o nome {destination.name}. Os arquivos existentes foram preservados.")
        return False
    descriptor, temporary_name = tempfile.mkstemp(prefix=".trama-transfer-", dir=destination.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as output, source.open("rb") as input_file:
            shutil.copyfileobj(input_file, output)
            output.flush()
            os.fsync(output.fileno())
        try:
            publish_no_replace(temporary, destination)
        except FileExistsError:
            if not safe_file(destination) or file_hash(temporary) != file_hash(destination):
                raise ValueError(f"Conflito ao receber {destination.name}; a cópia existente foi preservada.") from None
            return False
        return True
    finally:
        temporary.unlink(missing_ok=True)  # Only the private file created above.


def receive_files(cli, remote, folder, cache=None, keep_staging=True):
    folder = Path(folder).resolve()
    if not folder.is_dir():
        raise ValueError("Escolha uma pasta local de sincronização existente.")
    remote = remote_folder(remote)
    cli.verify_transfer_flags("download")
    names = cli.names(remote)
    ids = sorted(name[:-5] for name in names if name.endswith(".json") and name[:-5] + ".zip" in names)
    pending = []
    for snapshot_id in ids:
        metadata, archive = folder / f"{snapshot_id}.json", folder / f"{snapshot_id}.zip"
        if safe_file(metadata) and safe_file(archive):
            snapshot_pair(folder, snapshot_id, cache)
        else:
            pending.append(snapshot_id)
    if not pending:
        return 0
    # A fresh staging folder isolates incomplete downloads. It is preserved on
    # failure for diagnosis; the sync scanner ignores subdirectories.
    staging = Path(tempfile.mkdtemp(prefix=".trama-proton-recebido-", dir=folder))
    try:
        downloaded = []
        for snapshot_id in pending:
            for extension in ("zip", "json"):
                cli.download_file(f"{remote}/{snapshot_id}.{extension}", staging)
            downloaded.append(snapshot_pair(staging, snapshot_id))
        # Validate every downloaded pair before publishing any metadata.
        for archive, metadata in downloaded:
            for source in (archive, metadata):
                destination = folder / source.name
                if destination.exists() or destination.is_symlink():
                    if not safe_file(destination) or file_hash(source) != file_hash(destination):
                        raise ValueError(f"Conflito em {source.name}; nenhuma cópia existente foi alterada.")
        for archive, metadata in downloaded:
            install_immutable(archive, folder / archive.name)
            install_immutable(metadata, folder / metadata.name)
        if not keep_staging:
            # Remove only the exact private files created by this successful
            # receive operation. Never recursively delete a user-selected path.
            for archive, metadata in downloaded:
                archive.unlink(missing_ok=True)
                metadata.unlink(missing_ok=True)
            try:
                staging.rmdir()
            except OSError:
                pass
        return len(downloaded)
    except Exception as error:
        raise ValueError(f"{error}\nArquivos recebidos preservados para inspeção em: {staging}") from error
    finally:
        # Keep staging even after success: no recursive cleanup of a user-selected
        # directory, and the user can remove these expendable receive copies later.
        pass


class BackgroundCLI(ProtonCLI):
    """Bounded, quiet subprocesses; no authentication prompts during polling."""
    def __init__(self, executable):
        super().__init__(executable)
        self._process = None
        self._lock = threading.Lock()
        self._stopped = threading.Event()
        self._verified = set()

    def call(self, *args, capture=False):
        if self._stopped.is_set():
            raise ValueError("Transferência interrompida.")
        if os.environ.get('PROTON_DRIVE_CREDENTIALS_STORE') == 'unsafe_file':
            raise ValueError("Configure o cofre de credenciais do sistema para conectar o Proton.")
        options = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
        with self._lock:
            if self._stopped.is_set():
                raise ValueError("Transferência interrompida.")
            process = subprocess.Popen([self.executable, *args], stdin=subprocess.DEVNULL,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       text=True, encoding='utf-8', errors='replace', **options)
            self._process = process
        try:
            output, error = process.communicate(timeout=60)
            if process.returncode:
                # CLI diagnostics can contain account information. Never return
                # raw stdout/stderr to the browser or logs.
                auth_error = any(word in error.lower() for word in ('auth', 'log in', 'login', 'credential', 'keychain', 'secret'))
                if auth_error:
                    raise ValueError("Conecte sua conta em Sincronização → Entrar no Proton e confira o cofre de credenciais do sistema.")
                raise ValueError("Não foi possível acessar o Proton. Confira a internet e se a pasta remota existe. O Trama tentará novamente.")
            return output if capture else None
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
            raise ValueError("O Proton demorou para responder. Suas notas continuam locais; o envio será tentado novamente.") from None
        finally:
            with self._lock:
                if self._process is process:
                    self._process = None

    def verify_transfer_flags(self, operation):
        if operation not in self._verified:
            super().verify_transfer_flags(operation)
            self._verified.add(operation)

    def close(self):
        self._stopped.set()
        with self._lock:
            if self._process is not None and self._process.poll() is None:
                self._process.kill()


class ProtonTransport:
    """Transport for AutoSync. Authentication is a separate explicit action."""
    def __init__(self, config):
        self.cli = BackgroundCLI(find_cli(config.get('cliPath') or None))
        self.cache = {}

    def download(self, folder, config):
        return receive_files(self.cli, config['remoteFolder'], folder, self.cache, keep_staging=False)

    def upload(self, folder, config):
        return publish_files(self.cli, folder, config['remoteFolder'], self.cache)

    def close(self):
        self.cli.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Transferência manual de cópias Trama pelo Proton Drive oficial.")
    parser.add_argument("operation", choices=("login", "upload", "download"))
    parser.add_argument("source", nargs="?")
    parser.add_argument("destination", nargs="?")
    parser.add_argument("--cli", help="Caminho do executável oficial proton-drive ou proton-drive.exe")
    args = parser.parse_args(argv)
    if args.operation != "login" and (not args.source or not args.destination):
        parser.error("upload: pasta-local pasta-remota; download: pasta-remota pasta-local")
    if args.operation == "login" and (args.source or args.destination):
        parser.error("login não recebe nomes de usuário nem senhas; a CLI abrirá o navegador")
    try:
        cli = ProtonCLI(find_cli(args.cli))
        if args.operation == "login":
            cli.call("auth", "login")
            return 0
        if args.operation == "upload":
            count = publish_files(cli, args.source, args.destination)
            print(f"Transferência concluída: {count} arquivos novos enviados. Cópias já presentes foram mantidas.")
        else:
            count = receive_files(cli, args.source, args.destination)
            print(f"Transferência concluída: {count} cópias completas recebidas. Abra Sincronização no Trama para revisar e aplicar.")
        return 0
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(f"Não foi possível concluir a transferência: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
