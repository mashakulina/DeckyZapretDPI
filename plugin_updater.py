"""Transactional release installer. All service/network effects have injectable seams."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid
import zipfile

API = 'https://api.github.com/repos/mashakulina/DeckyZapretDPI/releases/latest'
STATE = Path('/tmp/deckyzapretdpi-update-state.json')
LOCK = Path('/tmp/deckyzapretdpi-update.lock')
REQUIRED = ('main.py', 'decky_autopicker.py', 'manager_bridge.py', 'plugin_diagnostics.py', 'plugin_updater.py', 'plugin.json', 'package.json', 'dist/index.js')


def version(value):
    text = str(value).strip().removeprefix('v')
    if not re.fullmatch(r'\d+\.\d+\.\d+', text):
        raise ValueError(f'Unsupported release version: {text[:80]}')
    return tuple(map(int, text.split('.')))


def installed(root):
    return json.loads((Path(root) / 'plugin.json').read_text())['version']


def release():
    req = urllib.request.Request(API, headers={'User-Agent': 'DeckyZapretDPI', 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read(2 * 1024 * 1024))


def download(url, target):
    if not str(url).startswith('https://'):
        raise ValueError('Release archive must use HTTPS')
    with urllib.request.urlopen(url, timeout=60) as response, open(target, 'wb') as out:
        shutil.copyfileobj(response, out)


def write_status(path, **data):
    data['detail'] = str(data.get('detail', ''))[-2000:]
    data['updated_at'] = time.time()
    path = Path(path)
    temp = path.with_name(path.name + '.' + uuid.uuid4().hex)
    temp.write_text(json.dumps(data), encoding='utf-8')
    os.replace(temp, path)


def read_status(path=None):
    if path is None:
        path = STATE
    try:
        data = json.loads(Path(path).read_text())
        return data if isinstance(data, dict) else {'status': 'idle'}
    except (OSError, ValueError):
        return {'status': 'idle'}


def service(action):
    subprocess.run(['systemctl', action, 'plugin_loader.service'], check=True, timeout=60, capture_output=True)
    if action in ('start', 'restart'):
        subprocess.run(['systemctl', 'is-active', '--quiet', 'plugin_loader.service'], check=True, timeout=20, capture_output=True)


def validate(archive, target, expected):
    with zipfile.ZipFile(archive) as zipped:
        for item in zipped.infolist():
            p = Path(item.filename)
            if p.is_absolute() or '..' in p.parts or (item.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Unsafe archive path')
        zipped.extractall(target)
    roots = list(Path(target).iterdir())
    if len(roots) != 1 or not roots[0].is_dir():
        raise ValueError('Archive must contain one release directory')
    root = roots[0]
    plugin = installed(root)
    package = json.loads((root / 'package.json').read_text())['version']
    if not (version(expected) == version(plugin) == version(package)):
        raise ValueError(f'Release version mismatch: tag={expected}, plugin={plugin}, package={package}')
    for name in REQUIRED:
        if not (root / name).is_file():
            raise ValueError(f'Release missing required runtime file: {name}')
    return root


def install(root, *, state=STATE, lock=LOCK, fetch=release, retrieve=download, control=service, copy=shutil.copytree):
    root = Path(root).resolve()
    os.environ.setdefault('DECKY_PLUGIN_LOG_DIR', '/tmp/deckyzapretdpi')
    # Resolve diagnostics while the original installation still exists.
    diagnostic = None
    try:
        import importlib.util
        diagnostic = sys.modules.get('update_diagnostics')
        if diagnostic is None:
            spec = importlib.util.spec_from_file_location('update_diagnostics', Path(__file__).with_name('plugin_diagnostics.py'))
            diagnostic = importlib.util.module_from_spec(spec)
            sys.modules['update_diagnostics'] = diagnostic
            spec.loader.exec_module(diagnostic)
    except Exception:
        pass
    with open(lock, 'a') as guard:
        try:
            fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'status': 'updating', 'detail': 'Another update is running'}
        current, target, backup, replaced, stopped = '', '', None, False, False
        operation = uuid.uuid4().hex
        def report(status, detail=''):
            data = dict(status=status, current_version=current, target_version=target, detail=detail, operation_id=operation, log_path=str(Path(os.environ.get('DECKY_PLUGIN_LOG_DIR', '/tmp/deckyzapretdpi')) / 'diagnostics.log'))
            write_status(state, **data)
            return data
        phase = 'fetch_release'
        report('updating', 'Fetching release')
        try:
            if root.exists():
                current = installed(root)
            metadata = fetch()
            target = str(metadata['tag_name']).removeprefix('v')
            if current and version(target) <= version(current):
                return report('updated', 'Installed version is already current or newer')
            root.parent.mkdir(parents=True, exist_ok=True)
            # Outside plugins/: Decky must never discover backup/staging as plugins.
            work_parent = root.parent.parent / '.deckyzapretdpi-updates'
            work_parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='stage-', dir=work_parent) as staging:
                staging = Path(staging)
                phase = 'download'
                retrieve(metadata['zipball_url'], staging / 'release.zip')
                phase = 'validate_archive'
                source = validate(staging / 'release.zip', staging / 'extract', target)
                candidate = staging / 'candidate'
                phase = 'stage_copy'
                copy(source, candidate)
                # Service is touched only after validation and complete staging copy.
                phase = 'stop_loader'
                stopped = True
                control('stop')
                if root.exists():
                    backup = work_parent / ('backup-' + operation)
                    root.rename(backup)
                phase = 'replace_plugin'
                candidate.rename(root)
                replaced = True
                phase = 'start_loader'
                control('start')
                phase = 'verify_installed_version'
                current = installed(root)
                if version(current) != version(target):
                    raise ValueError(f'Installed version verification failed: expected {target}, found {current}')
                result = report('updated', 'Release installed and plugin loader active')
                if backup:
                    # Cleanup failure must not turn a completed installation into rollback.
                    shutil.rmtree(backup, ignore_errors=True)
                return result
        except Exception as error:
            detail = f'{type(error).__name__}: {error}'
            try:
                error_id = diagnostic.record_exception('install_plugin_release', error, target_version=target, phase=phase)
                detail += f' (ID: {error_id})'
            except Exception:
                pass
            try:
                if replaced and root.exists():
                    shutil.rmtree(root)
                if backup and backup.exists():
                    backup.rename(root)
                if stopped:
                    control('start')
            except Exception as rollback_error:
                detail += f'; rollback/recovery failed: {rollback_error}; backup={backup}'
            try:
                current = installed(root)
            except Exception:
                current = ''
            return report('error', detail)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    args = parser.parse_args()
    result = install(args.root)
    print(json.dumps(result))
    raise SystemExit(0 if result['status'] == 'updated' else 1)
