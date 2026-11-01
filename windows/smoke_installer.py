"""Opt-in Windows installation test for an isolated CI runner.

This installs/uninstalls the real per-user package and writes its HKCU uninstall
entry and Start menu shortcuts. It refuses to run if Trama is already installed.
By default the code is real, but the dictionary contains two synthetic entries;
--installer can instead test an already-built release artifact unchanged.
Nothing is downloaded. All test graphs and build files stay under --work.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import gzip
import http.client
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import uuid

SOURCE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SOURCE))
import build_dictionary
import build_update
import build_windows
from updater import allowed_file, hash_file

UNINSTALL_KEY = r'Software\Microsoft\Windows\CurrentVersion\Uninstall\{8D2E5C71-E796-4CAA-A323-BC886D2EB310}_is1'


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def registered_directory():
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY, 0,
                            winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as key:
            return winreg.QueryValueEx(key, 'InstallLocation')[0]
    except FileNotFoundError:
        return None


def run_logged(args, logfile, timeout=180, env=None):
    with Path(logfile).open('w', encoding='utf-8') as stream:
        result = subprocess.run([str(arg) for arg in args], stdout=stream,
                                stderr=subprocess.STDOUT, timeout=timeout, env=env)
    return result.returncode


def api(port, path, body=None, method=None):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
    try:
        connection.request(method or ('POST' if body is not None else 'GET'), path,
                           None if body is None else json.dumps(body),
                           {'Content-Type': 'application/json'})
        response = connection.getresponse()
        data = response.read()
        require(response.status == 200, f'{path}: HTTP {response.status}: {data[:500]!r}')
        return json.loads(data)
    finally:
        connection.close()


def wait_api(port, process):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        require(process.poll() is None, 'O aplicativo encerrou antes de abrir o servidor.')
        try:
            return api(port, '/api/update/status')
        except (OSError, http.client.HTTPException):
            time.sleep(.2)
    raise TimeoutError('O aplicativo não iniciou em 45 segundos.')


def fixture_source(source, run):
    """Copy tracked program files only; never copy a real dictionary or graph."""
    result = subprocess.run(['git', 'ls-files', '--cached', '-z'], cwd=source,
                            check=True, capture_output=True)
    names = [name for name in result.stdout.decode('utf-8').split('\0') if name]
    fixture = run / 'source fixture'
    fixture.mkdir()
    for name in names:
        if allowed_file(name) or name in {'windows/trama.iss', 'windows/TramaLauncher.cs'}:
            path = source / name
            if path.is_file():
                target = fixture / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, target)
    inputs = {}
    for language, word in (('pt', 'teste'), ('en', 'test')):
        path = run / (language + '-fixture.jsonl.gz')
        entry = {'word': word, 'lang_code': language, 'pos': 'noun',
                 'senses': [{'glosses': ['Synthetic installer test fixture'],
                             'examples': [{'text': 'Synthetic test example.'}]}]}
        with gzip.open(path, 'wt', encoding='utf-8') as stream:
            stream.write(json.dumps(entry) + '\n')
        inputs[language] = path
    build_dictionary.build_database(inputs, fixture / 'resources/dictionary.sqlite')
    return fixture, names


def test_install(args):
    require(os.name == 'nt', 'Este teste opt-in exige Windows com acesso ao registro HKCU.')
    require(registered_directory() is None, 'Já existe uma instalação do Trama; use um runner Windows isolado.')
    shortcuts = Path(os.environ['APPDATA']) / 'Microsoft/Windows/Start Menu/Programs/Trama'
    require(not shortcuts.exists(), 'Já existem atalhos Trama; use um runner Windows isolado.')
    work = Path(args.work).resolve()
    work.mkdir(parents=True, exist_ok=True)
    run = work / ('windows smoke ' + uuid.uuid4().hex)
    run.mkdir()
    (run / 'temp').mkdir()
    os.environ['TEMP'] = str(run / 'temp')
    os.environ['TMP'] = str(run / 'temp')
    report = {'version': args.version, 'startedAt': datetime.now(timezone.utc).isoformat(),
              'work': str(run), 'dictionaryFixture': args.installer is None,
              'checks': [], 'conclusion': 'failure'}
    process = None
    target = run / 'Trama installation with spaces'
    port = None
    try:
        if args.installer:
            installer = Path(args.installer).resolve(strict=True)
        else:
            require(args.runtime and args.iscc and args.csc, '--runtime, --iscc e --csc são obrigatórios para compilar.')
            fixture, names = fixture_source(Path(args.source).resolve(), run)
            build_update.build(fixture, run / 'code update', args.version, names=names)
            built = build_windows.build(fixture, args.runtime, args.iscc, args.csc,
                                        run / 'installer', args.version, work=run / 'build',
                                        runtime_package_sha256=args.runtime_package_sha256)
            installer = Path(built['file'])
            report['build'] = built
        report['installer'] = str(installer)
        report['installerSha256'] = hash_file(installer)
        report['installerBytes'] = installer.stat().st_size
        flags = ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/TASKS=setuptools']

        # An unrelated note in the program directory must stop before copy.
        unsafe = run / 'unexpected personal folder'
        unsafe.mkdir()
        (unsafe / 'my-notes.txt').write_bytes(b'not program data')
        code = run_logged([installer, *flags, '/DIR=' + str(unsafe), '/LOG=' + str(run / 'unsafe-install.log')], run / 'unsafe-command.log')
        require(code != 0 and (unsafe / 'my-notes.txt').read_bytes() == b'not program data'
                and not (unsafe / 'Trama.exe').exists(), 'A instalação não recusou a pasta com arquivos pessoais.')
        report['checks'].append('unexpected personal files block installation without modification')

        data = target / 'data'
        updates = target / '.app-updates'
        data.mkdir(parents=True)
        updates.mkdir()
        sentinels = {data / 'preserved-note.txt': b'personal notes sentinel',
                     updates / 'preserved-update.txt': b'update history sentinel'}
        for path, content in sentinels.items():
            path.write_bytes(content)
        # Keep this installation test independent of GitHub network/release state.
        (updates / 'settings.json').write_text('{"automatic":false}', encoding='utf-8')
        command = [installer, *flags, '/DIR=' + str(target)]
        code = run_logged([*command, '/LOG=' + str(run / 'install.log')], run / 'install-command.log')
        require(code == 0, f'Instalação retornou {code}; veja install.log.')
        require(Path(registered_directory() or '').resolve() == target.resolve(), 'Entrada de desinstalação HKCU ausente ou incorreta.')
        for name in ('Trama.lnk', 'Configurar gramática.lnk', 'Configurar tradução.lnk'):
            require((shortcuts / name).is_file(), 'Atalho ausente: ' + name)
        for path, content in sentinels.items():
            require(path.read_bytes() == content, 'Instalação alterou uma sentinela de dados.')
        require((target / 'runtime/LICENSE.txt').is_file(), 'Licença do runtime não foi instalada.')
        require((target / 'app/resources/dictionary.sqlite').is_file(), 'Dicionário não foi instalado.')
        report['checks'].append('real per-user installation, HKCU entry, shortcuts, licenses and preserved data')

        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        environment = os.environ.copy()
        for key in list(environment):
            if key.startswith('TRAMA_'):
                environment.pop(key)
        environment.update(PATH=str(Path(os.environ['SystemRoot']) / 'System32'),
                           PYTHONHOME=str(run / 'invalid PYTHONHOME'),
                           PYTHONPATH=str(run / 'invalid PYTHONPATH'))
        process = subprocess.Popen([str(target / 'Trama.exe'), '--no-browser', '--port', str(port),
                                    '--data-dir', str(data)], env=environment)
        status = wait_api(port, process)
        require(status['currentVersion'] == args.version and status['canClose'] is True,
                'O aplicativo instalado não informou sua versão ou encerramento gerenciado.')
        require(status.get('availableVersion') is None and status['state'] != 'ready', 'O teste iniciou com atualização pendente.')
        dictionary_status = api(port, '/api/dictionary/status')
        require(dictionary_status.get('available') is True, 'O dicionário local não está pronto.')
        state = api(port, '/api/state')
        graph = {'version': 1, 'pages': [{'id': 'smoke-page', 'title': 'Nota preservada',
                 'created': '2026-11-01T00:00:00Z', 'updated': '2026-11-01T00:00:00Z',
                 'blocks': [{'id': 'smoke-block', 'text': 'Notas com [[links]] e acentos.',
                             'children': [], 'collapsed': False}]}]}
        saved = api(port, '/api/state', {'revision': state['revision'], 'data': graph}, 'PUT')
        require(api(port, '/api/state')['data'] == graph, 'A nota não voltou igual pela API.')
        report['checks'].append('native launch without Python in PATH, polluted Python env ignored, dictionary and saved note API')

        before = {name: hash_file(target / name) for name in ('Trama.exe', 'app/server.py', 'runtime/python.exe')}
        code = run_logged([*command, '/LOG=' + str(run / 'busy-install.log')], run / 'busy-command.log')
        require(code != 0, 'A reinstalação foi aceita com Trama aberto.')
        require(all(hash_file(target / name) == digest for name, digest in before.items()), 'A instalação bloqueada mudou arquivos de programa.')
        require(api(port, '/api/state')['data'] == graph, 'A instalação bloqueada afetou notas.')
        report['checks'].append('running native app blocks reinstall, program hashes and notes remain unchanged')

        api(port, '/api/app/close', {'revision': saved['revision'], 'client': 'installer-smoke'})
        require(process.wait(timeout=20) == 0, 'Encerramento gerenciado não terminou com sucesso.')
        process = None
        report['checks'].append('normal HTTP close succeeds with no pending update')
        database_hash = hash_file(data / 'trama.db')

        # Closed app can be reinstalled, including its runtime and existing lock.
        code = run_logged([*command, '/LOG=' + str(run / 'reinstall.log')], run / 'reinstall-command.log')
        require(code == 0, f'Reinstalação após encerrar retornou {code}.')
        require(hash_file(data / 'trama.db') == database_hash, 'Reinstalação alterou o banco de notas.')
        report['checks'].append('closed-app reinstall preserves database and updater state')

        uninstaller = target / 'unins000.exe'
        require(uninstaller.is_file(), 'Desinstalador ausente.')
        code = run_logged([uninstaller, '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART',
                           '/LOG=' + str(run / 'uninstall.log')], run / 'uninstall-command.log')
        require(code == 0, f'Desinstalação retornou {code}.')
        require(not (target / 'Trama.exe').exists() and not (target / 'runtime/python.exe').exists(), 'Programa não foi removido.')
        require(registered_directory() is None, 'Registro de desinstalação permaneceu.')
        require(not (shortcuts / 'Trama.lnk').exists(), 'Atalho do programa permaneceu.')
        require(hash_file(data / 'trama.db') == database_hash, 'Desinstalação alterou notas.')
        for path, content in sentinels.items():
            require(path.read_bytes() == content, 'Desinstalação apagou dados ou histórico de atualização.')
        report['checks'].append('uninstall removes program and registration while preserving database and update history')
        report['conclusion'] = 'success'
        return report
    except Exception as exc:
        report['error'] = str(exc)
        raise
    finally:
        # Only stop the process this test launched; leave artifacts for diagnosis.
        if process is not None and process.poll() is None:
            try:
                state = api(port, '/api/state')
                api(port, '/api/app/close', {'revision': state['revision'], 'client': 'installer-smoke'})
                process.wait(timeout=15)
            except Exception:
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True, timeout=20)
        report['finishedAt'] = datetime.now(timezone.utc).isoformat()
        report_path = Path(args.report) if args.report else work / 'smoke-installer-report.json'
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--runtime', type=Path)
    parser.add_argument('--iscc', type=Path)
    parser.add_argument('--csc', type=Path)
    parser.add_argument('--runtime-package-sha256')
    parser.add_argument('--installer', type=Path, help='Test this exact existing installer instead of compiling with fixture dictionary')
    parser.add_argument('--version', default='0.11')
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--report', type=Path)
    test_install(parser.parse_args())


if __name__ == '__main__':
    main()
