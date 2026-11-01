"""Download verified public Trama releases without replacing a running program.

GitHub HTTPS and its asset SHA-256 are the distribution trust boundary. The
manifest verifies every extracted byte; it is not an independent signature.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import threading
import time
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener
import uuid
import zipfile


REPOSITORY = "Mentalidade-Hacker/trama"
LATEST_URL = f"https://api.github.com/repos/{REPOSITORY}/releases/latest"
RELEASE_PREFIX = f"https://github.com/{REPOSITORY}/releases/"
MAX_DOWNLOAD = 128 * 1024 * 1024
MAX_EXPANDED = 256 * 1024 * 1024
MAX_FILE = 32 * 1024 * 1024
MAX_MANIFEST = 2 * 1024 * 1024
MAX_FILES = 5000
CHECK_INTERVAL = 6 * 60 * 60
VERSION_RE = re.compile(r"(?:0|[1-9][0-9]{0,3})\.(?:0|[1-9][0-9]{0,3})(?:\.(?:0|[1-9][0-9]{0,3}))?\Z")
HASH_RE = re.compile(r"[0-9a-f]{64}\Z")
REQUIRED_FILES = {"server.py", "updater.py", "launch_trama.py", "web/index.html", "web/app.js"}
TOP_SUFFIXES = {".py", ".cmd", ".ps1", ".sh", ".md"}
WEB_SUFFIXES = {".js", ".mjs", ".css", ".html", ".svg", ".png", ".ico", ".jpg", ".jpeg", ".webp", ".gif", ".wasm", ".ttf", ".woff", ".woff2", ".aff", ".dic", ".json", ".md", ".txt", ".ts", ".map", ".cxx", ".hxx", ".h", ".in", ".am", ".lesser", ".mpl"}
WEB_NAMES = {"license", "copying", "makefile"}


class UpdateError(ValueError):
    pass


class Cancelled(UpdateError):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def version_key(value):
    if not isinstance(value, str) or not VERSION_RE.fullmatch(value):
        raise UpdateError("A versão da atualização é inválida.")
    parts = tuple(int(part) for part in value.split('.'))
    return parts + (0,) * (3 - len(parts))


def linked(path):
    info = Path(path).lstat()
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400))


def plain_path(path):
    path = Path(path)
    # Do not follow junctions or symlinks anywhere in updater-owned paths.
    for ancestor in (path, *path.parents):
        if ancestor.exists() and linked(ancestor):
            raise UpdateError("A pasta de atualizações contém um link de arquivo ou pasta.")
    return path


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise UpdateError("O arquivo de atualização contém campos repetidos.")
            result[key] = value
        return result
    try:
        return json.loads(raw, object_pairs_hook=pairs)
    except (UnicodeError, ValueError, RecursionError) as exc:
        raise UpdateError("O arquivo de atualização contém JSON inválido.") from exc


def read_json(path, default=None, limit=MAX_MANIFEST):
    path = plain_path(path)
    if not path.exists():
        return default
    if not path.is_file() or path.stat().st_size > limit:
        raise UpdateError("O arquivo de atualização é inválido ou grande demais.")
    return strict_json(path.read_bytes())


def atomic_json(path, value):
    path = plain_path(path)
    temp = path.parent / ('.' + path.name + '-' + uuid.uuid4().hex + '.tmp')
    created = False
    try:
        with temp.open('xb') as out:
            created = True
            out.write(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, path)
    finally:
        if created:
            temp.unlink(missing_ok=True)


def state_directory(base_root):
    base = Path(base_root).resolve()
    return base.parent / ('.' + base.name + '-updates')


def ensure_state(base_root):
    base = Path(base_root).resolve()
    state = plain_path(state_directory(base))
    state.mkdir(mode=0o700, parents=False, exist_ok=True)
    owner = state / 'owner.json'
    expected = {'schema': 1, 'base': str(base)}
    try:
        with owner.open('x', encoding='utf-8') as out:
            json.dump(expected, out)
            out.flush()
            os.fsync(out.fileno())
    except FileExistsError:
        if read_json(owner) != expected:
            raise UpdateError("Esta pasta de atualizações pertence a outra instalação.")
    for name in ('releases', 'downloads'):
        plain_path(state / name).mkdir(mode=0o700, exist_ok=True)
    return state


def installed_version(root):
    metadata = read_json(Path(root) / 'app-release.json')
    if metadata is not None:
        if not isinstance(metadata, dict) or metadata.get('schema') != 1 or metadata.get('repository') != REPOSITORY:
            raise UpdateError("O manifesto do aplicativo é inválido.")
        version_key(metadata.get('version'))
        return metadata['version']
    # Compatibility for unpacked versions predating release manifests.
    try:
        text = (Path(root) / 'web/index.html').read_text(encoding='utf-8')
        match = re.search(r'class="version">\s*/\s*([0-9]+\.[0-9]+(?:\.[0-9]+)?)', text)
        if match:
            version_key(match.group(1))
            return match.group(1)
    except OSError:
        pass
    return '0.0.0'


def allowed_file(name):
    if not isinstance(name, str) or not name or len(name) > 240 or '\\' in name or ':' in name:
        return False
    parts = PurePosixPath(name).parts
    if not parts or '/'.join(parts) != name or any(p in ('.', '..') or p.endswith((' ', '.')) or not re.fullmatch(r'[A-Za-z0-9_.-]+', p) for p in parts):
        return False
    if any(re.fullmatch(r'(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?', p, re.I) for p in parts):
        return False
    if any(p.startswith('.') or p.lower() in ('__pycache__', 'node_modules') for p in parts):
        return False
    suffix = PurePosixPath(name).suffix.lower()
    if len(parts) == 1:
        return suffix in TOP_SUFFIXES or name == 'app-release.json'
    if name == 'resources/README.md':
        return True
    return parts[0] == 'web' and (suffix in WEB_SUFFIXES or parts[-1].lower() in WEB_NAMES)


def validate_manifest(value, expected_version=None):
    if not isinstance(value, dict) or type(value.get('schema')) is not int or value['schema'] != 1 or value.get('repository') != REPOSITORY:
        raise UpdateError("O manifesto não pertence ao Trama ou tem formato incompatível.")
    version_key(value.get('version'))
    if expected_version is not None and value['version'] != expected_version:
        raise UpdateError("A versão do pacote não corresponde à versão publicada.")
    files = value.get('files')
    if not isinstance(files, dict) or not REQUIRED_FILES <= files.keys() or not 1 <= len(files) <= MAX_FILES:
        raise UpdateError("O pacote não contém todos os arquivos necessários.")
    total, seen = 0, set()
    for name, item in files.items():
        if not allowed_file(name) or name == 'app-release.json' or name.casefold() in seen:
            raise UpdateError("O manifesto contém um caminho não permitido ou repetido.")
        seen.add(name.casefold())
        if not isinstance(item, dict) or type(item.get('size')) is not int or not 0 <= item['size'] <= MAX_FILE or not isinstance(item.get('sha256'), str) or not HASH_RE.fullmatch(item['sha256']):
            raise UpdateError("O manifesto contém tamanho ou hash inválido.")
        total += item['size']
    if total > MAX_EXPANDED:
        raise UpdateError("O pacote expandido excede o limite de atualização.")
    return value


def hash_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def validate_release(root, expected_version=None, syntax=True):
    root = plain_path(root)
    manifest = validate_manifest(read_json(root / 'app-release.json'), expected_version)
    for name, expected in manifest['files'].items():
        path = plain_path(root / name)
        if not path.is_file() or path.stat().st_size != expected['size'] or hash_file(path) != expected['sha256']:
            raise UpdateError("Um arquivo da atualização está ausente ou foi alterado.")
        if syntax and name.endswith('.py'):
            try:
                compile(path.read_bytes(), name, 'exec', dont_inherit=True)
            except (SyntaxError, ValueError) as exc:
                raise UpdateError("Esta atualização não é compatível com o Python instalado.") from exc
    # The launcher uses -B, so even cached Python bytecode is not expected here.
    # Allowing unverified .pyc files could bypass source integrity verification.
    for path in root.rglob('*'):
        relative = path.relative_to(root)
        plain_path(path)
        if path.is_file() and relative.as_posix() not in {*manifest['files'], 'app-release.json'}:
            raise UpdateError("Há um arquivo inesperado dentro da atualização.")
    return manifest


def pointer(state, name):
    value = read_json(Path(state) / (name + '.json'))
    if value is None:
        return None
    if not isinstance(value, dict):
        raise UpdateError("O registro da atualização é inválido.")
    version_key(value.get('version'))
    return value['version']


def release_path(state, version):
    version_key(version)
    return plain_path(Path(state) / 'releases' / version / 'trama')


def _check_cancel(cancel):
    if cancel is not None and cancel.is_set():
        raise Cancelled("A atualização foi interrompida; o aplicativo anterior permanece disponível.")


def extract_release(archive, state, version, cancel=None):
    """Extract only listed files to a unique stage; publish after all checks."""
    stage = plain_path(Path(state) / 'releases' / ('.stage-' + uuid.uuid4().hex))
    stage.mkdir(mode=0o700)
    try:
        with zipfile.ZipFile(archive) as source:
            infos = source.infolist()
            if len(infos) > MAX_FILES + 1:
                raise UpdateError("O pacote contém arquivos demais.")
            names, total = set(), 0
            for info in infos:
                _check_cancel(cancel)
                name = info.filename
                mode = info.external_attr >> 16
                if (not name.startswith('trama/') or not allowed_file(name[6:]) or info.is_dir()
                        or (stat.S_IFMT(mode) not in (0, stat.S_IFREG)) or info.flag_bits & 1
                        or name.casefold() in names or info.file_size > MAX_FILE):
                    raise UpdateError("O ZIP contém um arquivo, caminho ou link não permitido.")
                total += info.file_size
                names.add(name.casefold())
            if total > MAX_EXPANDED + MAX_MANIFEST or 'trama/app-release.json' not in names:
                raise UpdateError("O ZIP é grande demais ou não tem manifesto.")
            meta_info = source.getinfo('trama/app-release.json')
            if meta_info.file_size > MAX_MANIFEST:
                raise UpdateError("O manifesto é grande demais.")
            manifest = validate_manifest(strict_json(source.read(meta_info)), version)
            expected_names = {'trama/' + name for name in manifest['files']} | {'trama/app-release.json'}
            if {info.filename for info in infos} != expected_names:
                raise UpdateError("A lista do ZIP não corresponde ao manifesto.")
            root = stage / 'trama'
            root.mkdir()
            for info in infos:
                _check_cancel(cancel)
                name = info.filename[6:]
                expected = manifest['files'].get(name)
                if expected is not None and info.file_size != expected['size']:
                    raise UpdateError("O tamanho de um arquivo não corresponde ao manifesto.")
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                digest, count = hashlib.sha256(), 0
                with source.open(info) as inp, target.open('xb') as out:
                    while chunk := inp.read(1024 * 1024):
                        _check_cancel(cancel)
                        count += len(chunk)
                        if count > info.file_size:
                            raise UpdateError("O tamanho expandido do ZIP é inválido.")
                        digest.update(chunk)
                        out.write(chunk)
                if count != info.file_size or expected is not None and digest.hexdigest() != expected['sha256']:
                    raise UpdateError("A verificação de integridade da atualização falhou.")
                if os.name != 'nt':
                    target.chmod(0o755 if name.endswith('.sh') else 0o644)
            validate_release(root, version)
        _check_cancel(cancel)
        destination = plain_path(Path(state) / 'releases' / version)
        if destination.exists():
            previous = validate_release(destination / 'trama', version)
            if previous != manifest:
                raise UpdateError("Já existe um pacote diferente para esta versão.")
        else:
            os.rename(stage, destination)
        return release_path(state, version)
    except (zipfile.BadZipFile, KeyError, RuntimeError) as exc:
        raise UpdateError("O ZIP da atualização é inválido ou incompleto.") from exc
    finally:
        # This UUID stage is exclusively created here, never a user directory.
        if stage.exists() and not linked(stage):
            shutil.rmtree(stage)


class SafeRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urlsplit(newurl)
        if (parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443)
                or parsed.hostname not in ('github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com')):
            raise UpdateError("O download foi redirecionado para um endereço não permitido.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _open(url):
    return build_opener(SafeRedirects()).open(Request(url, headers={'User-Agent': 'Trama-Updater', 'Accept': 'application/vnd.github+json' if url == LATEST_URL else 'application/octet-stream'}), timeout=20)


def latest_release():
    with _open(LATEST_URL) as response:
        raw = response.read(MAX_MANIFEST + 1)
    if len(raw) > MAX_MANIFEST:
        raise UpdateError("A resposta do serviço de versões é grande demais.")
    value = strict_json(raw)
    if not isinstance(value, dict) or value.get('draft') is not False or value.get('prerelease') is not False:
        raise UpdateError("A versão publicada ainda não é uma versão estável.")
    tag = value.get('tag_name', '')
    if not isinstance(tag, str) or not tag.startswith('v'):
        raise UpdateError("O nome da versão publicada é inválido.")
    version = tag[1:]
    version_key(version)
    url = RELEASE_PREFIX + 'tag/' + tag
    if value.get('html_url') != url:
        raise UpdateError("O endereço da versão não pertence ao repositório esperado.")
    name = f'trama-v{version}-update.zip'
    assets = value.get('assets')
    if not isinstance(assets, list):
        raise UpdateError("A publicação não contém uma lista de arquivos válida.")
    matches = [item for item in assets if isinstance(item, dict) and item.get('name') == name]
    if len(matches) != 1:
        # Old public versions legitimately do not offer update packages.
        return {'version': version, 'url': url, 'asset': None}
    asset = matches[0]
    expected = RELEASE_PREFIX + 'download/' + tag + '/' + name
    if (asset.get('browser_download_url') != expected or type(asset.get('size')) is not int or not 1 <= asset['size'] <= MAX_DOWNLOAD
            or not isinstance(asset.get('digest'), str) or not re.fullmatch(r'sha256:[0-9a-f]{64}', asset['digest'])):
        raise UpdateError("O pacote publicado não tem endereço, tamanho ou SHA-256 válido.")
    return {'version': version, 'url': url, 'asset': {'url': expected, 'size': asset['size'], 'sha256': asset['digest'][7:]}}


def download_asset(asset, path, cancel, progress):
    count, digest = 0, hashlib.sha256()
    created = False
    try:
        with _open(asset['url']) as response, Path(path).open('xb') as out:
            created = True
            while chunk := response.read(256 * 1024):
                _check_cancel(cancel)
                count += len(chunk)
                if count > asset['size'] or count > MAX_DOWNLOAD:
                    raise UpdateError("O download excedeu o tamanho informado.")
                out.write(chunk)
                digest.update(chunk)
                progress(count, asset['size'])
            out.flush()
            os.fsync(out.fileno())
        _check_cancel(cancel)
        if count != asset['size'] or digest.hexdigest() != asset['sha256']:
            raise UpdateError("O download está incompleto ou seu SHA-256 não confere.")
    except BaseException:
        if created:
            Path(path).unlink(missing_ok=True)
        raise


def mark_started():
    """Called by server.main only after bind, recovery and initial backup succeed."""
    path, token = os.environ.get('TRAMA_UPDATE_HEALTH_FILE'), os.environ.get('TRAMA_UPDATE_HEALTH_TOKEN')
    if not path or not token:
        return
    if not re.fullmatch(r'[0-9a-f]{32}', token):
        raise UpdateError("O identificador de início do aplicativo é inválido.")
    atomic_json(Path(path), {'token': token, 'started': now()})


class UpdateService:
    def __init__(self, base_root, current_root=None):
        self.base = Path(base_root).resolve()
        self.current = Path(current_root or base_root).resolve()
        self.lock = threading.RLock()
        self.halt, self.wake = threading.Event(), threading.Event()
        self.thread = None
        self.manual_requested = False
        self.state_dir = None
        version_error = False
        try:
            current_version = installed_version(self.current)
        except (OSError, UpdateError):
            current_version, version_error = '0.0.0', True
        self.result = {'currentVersion': current_version, 'availableVersion': None, 'automatic': True,
                       'state': 'current', 'message': 'O aplicativo está pronto. A verificação de versões ocorre em segundo plano.',
                       'downloadedBytes': 0, 'totalBytes': 0, 'releaseUrl': RELEASE_PREFIX + 'latest', 'checkedAt': None}
        if (self.base / '.git').exists():
            self.result.update(state='development', automatic=False, message='Atualizações automáticas ficam desativadas nesta cópia de desenvolvimento.')
            return
        if version_error:
            self.result.update(state='error', automatic=False, message='O manifesto instalado é inválido. O programa continua disponível; reinstale a partir de uma versão oficial para reativar as atualizações.')
            return
        try:
            self.state_dir = ensure_state(self.base)
            settings = read_json(self.state_dir / 'settings.json', {'automatic': True})
            if not isinstance(settings, dict) or type(settings.get('automatic')) is not bool:
                raise UpdateError("A preferência de atualização é inválida.")
            self.result['automatic'] = settings['automatic']
            pending = pointer(self.state_dir, 'pending')
            if pending and version_key(pending) > version_key(self.result['currentVersion']):
                self.result.update(state='ready', availableVersion=pending, message='Atualização baixada. Ela será aplicada quando o aplicativo for encerrado e aberto novamente.')
            elif not settings['automatic']:
                self.result.update(state='disabled', message='Downloads automáticos desativados. Você pode verificar uma nova versão manualmente.')
            failure = read_json(self.state_dir / 'failure.json')
            if isinstance(failure, dict) and self.result['state'] != 'ready':
                self.result.update(state='error', message='A última atualização não iniciou corretamente. A versão anterior foi mantida; verifique novamente para tentar de novo.')
        except (OSError, UpdateError) as exc:
            self.result.update(state='error', automatic=False, message=str(exc) if isinstance(exc, UpdateError) else 'Não foi possível abrir a pasta de atualizações. O aplicativo continua disponível.')

    def status(self):
        with self.lock:
            return dict(self.result)

    def _set(self, **changes):
        with self.lock:
            self.result.update(changes)

    def configure(self, automatic):
        if type(automatic) is not bool:
            raise UpdateError("A preferência de atualização precisa ser verdadeira ou falsa.")
        with self.lock:
            if self.result['state'] == 'development':
                return dict(self.result)
            if self.state_dir is None:
                raise UpdateError("A pasta de atualizações está indisponível.")
            atomic_json(self.state_dir / 'settings.json', {'automatic': automatic})
            self.result['automatic'] = automatic
            if self.result['state'] in ('disabled', 'current'):
                self.result.update(state='current' if automatic else 'disabled', message='A verificação automática está ativada.' if automatic else 'Downloads automáticos desativados; uma versão já preparada ainda será aplicada na próxima abertura.')
            self.wake.set()
            return dict(self.result)

    def start(self):
        with self.lock:
            if self.state_dir is None or self.thread and self.thread.is_alive():
                return
            self.halt.clear()
            self.thread = threading.Thread(target=self._worker, name='trama-updater', daemon=True)
            self.thread.start()

    def stop(self):
        self.halt.set()
        self.wake.set()
        if self.thread and self.thread is not threading.current_thread():
            self.thread.join(timeout=1)

    def check(self):
        with self.lock:
            if self.result['state'] == 'development':
                return dict(self.result)
            if self.state_dir is None:
                return dict(self.result)
            self.manual_requested = True
            self.wake.set()
            self.start()
            return dict(self.result)

    def _worker(self):
        deadline = time.monotonic() + 5
        while not self.halt.is_set():
            self.wake.wait(max(0, min(30, deadline - time.monotonic())))
            self.wake.clear()
            if self.halt.is_set():
                return
            with self.lock:
                manual = self.manual_requested
                self.manual_requested = False
                automatic = self.result['automatic']
            if manual or automatic and time.monotonic() >= deadline:
                self._check(manual)
                deadline = time.monotonic() + CHECK_INTERVAL
            elif not automatic:
                deadline = time.monotonic() + CHECK_INTERVAL

    def _check(self, manual=False):
        temporary = None
        downloaded = False
        was_ready = self.status()['state'] == 'ready'
        ready_status = self.status() if was_ready else None
        try:
            _check_cancel(self.halt)
            self._set(state='checking', message='Verificando versões oficiais do Trama…', downloadedBytes=0, totalBytes=0)
            latest = latest_release()
            _check_cancel(self.halt)
            self._set(checkedAt=now(), releaseUrl=latest['url'])
            version = latest['version']
            current = self.result['currentVersion']
            pending = pointer(self.state_dir, 'pending')
            if version_key(version) <= version_key(current) or pending and version_key(pending) >= version_key(version):
                self._set(state='ready' if pending and version_key(pending) > version_key(current) else 'current', availableVersion=pending if pending else None,
                          message='Atualização pronta para a próxima abertura.' if pending and version_key(pending) > version_key(current) else 'Você está usando a versão mais recente disponível.')
                return
            self._set(availableVersion=version)
            failure = read_json(self.state_dir / 'failure.json')
            if not manual and isinstance(failure, dict) and failure.get('version') == version:
                raise UpdateError("Esta versão falhou ao iniciar anteriormente. A anterior foi mantida; use Verificar agora para tentar de novo.")
            if latest['asset'] is None:
                raise UpdateError("Esta versão ainda não oferece um pacote de atualização automática. O aplicativo atual continua disponível.")
            asset = latest['asset']
            temporary = self.state_dir / 'downloads' / (uuid.uuid4().hex + '.zip')
            self._set(state='downloading', message='Baixando e verificando a atualização…', totalBytes=asset['size'])
            download_asset(asset, temporary, self.halt, lambda done, total: self._set(downloadedBytes=done, totalBytes=total))
            downloaded = True
            extract_release(temporary, self.state_dir, version, self.halt)
            _check_cancel(self.halt)
            atomic_json(self.state_dir / 'pending.json', {'version': version})
            self._set(state='ready', message='Atualização baixada e verificada. Encerre e abra o aplicativo para aplicá-la.')
        except Cancelled:
            return
        except (OSError, URLError, UpdateError, zipfile.BadZipFile) as exc:
            message = str(exc) if isinstance(exc, UpdateError) else 'Não foi possível obter a atualização. Confira a conexão e tente novamente; o aplicativo atual continua disponível.'
            if was_ready:
                self._set(availableVersion=ready_status['availableVersion'], releaseUrl=ready_status['releaseUrl'],
                          downloadedBytes=ready_status['downloadedBytes'], totalBytes=ready_status['totalBytes'])
            self._set(state='ready' if was_ready else 'error', message=('A atualização já baixada continua pronta. ' if was_ready else '') + message)
        finally:
            if temporary is not None and downloaded:
                try:
                    temporary.unlink(missing_ok=True)
                except OSError:
                    # A held antivirus handle must not kill future checks.
                    pass
