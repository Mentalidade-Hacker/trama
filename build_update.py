"""Build a small, reviewed code update from tracked files; no personal data."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import uuid
import zipfile

from updater import REPOSITORY, allowed_file, validate_manifest, version_key


def build(source, output, version, names=None):
    source = Path(source).resolve();output = Path(output).resolve()
    version_key(version)
    if names is None:
        result = subprocess.run(['git','ls-files','--cached','-z'], cwd=source, check=True, stdout=subprocess.PIPE)
        names = result.stdout.decode('utf-8').split('\0')
    files = {}
    for name in sorted(set(names)):
        if not name or name == 'app-release.json':continue
        # Runtime allowlist, not the repository test/development directories.
        if not (name.startswith('web/') or name == 'resources/README.md' or ('/' not in name and Path(name).suffix in {'.py','.sh','.cmd','.ps1','.md'})):
            continue
        if not allowed_file(name):raise ValueError('Caminho de programa não permitido: '+name)
        path = source / name
        if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(source):
            raise ValueError('Arquivo do programa inválido: ' + name)
        for parent in path.parents:
            if parent == source:break
            if parent.is_symlink():raise ValueError('Pasta do programa é um link: ' + name)
        raw = path.read_bytes()
        files[name] = {'size':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    manifest = {'schema':1,'repository':REPOSITORY,'version':version,'files':files}
    validate_manifest(manifest, version)
    raw_manifest = (json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    output.mkdir(parents=True,exist_ok=True)
    target = output / f'trama-v{version}-update.zip'
    temporary = output / ('.update-'+uuid.uuid4().hex+'.tmp')
    try:
        with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
            for name, details in files.items():
                raw = (source/name).read_bytes()
                if len(raw)!=details['size'] or hashlib.sha256(raw).hexdigest()!=details['sha256']:
                    raise ValueError('A origem mudou durante o empacotamento: '+name)
                info=zipfile.ZipInfo('trama/'+name);info.create_system=3
                info.external_attr=(0o100755 if name.endswith('.sh') else 0o100644)<<16
                info.compress_type=zipfile.ZIP_DEFLATED
                archive.writestr(info,raw)
            archive.writestr('trama/app-release.json',raw_manifest)
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None:raise ValueError('Falha de CRC no pacote de atualização.')
            for name,details in files.items():
                if hashlib.sha256(archive.read('trama/'+name)).hexdigest()!=details['sha256']:
                    raise ValueError('Falha na conferência do pacote: '+name)
        temporary.replace(target)
        (source/'app-release.json').write_bytes(raw_manifest)
    finally:temporary.unlink(missing_ok=True)
    return {'version':version,'file':str(target),'files':len(files)+1,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version',required=True)
    parser.add_argument('--source',type=Path,default=Path(__file__).resolve().parent)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    print(json.dumps(build(args.source,args.output,args.version),ensure_ascii=False))


if __name__=='__main__':main()
