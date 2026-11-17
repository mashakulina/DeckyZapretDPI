"""Headless manager operations shared by Decky controls and autopicker."""
import ast
from contextlib import contextmanager
import importlib
import os
from pathlib import Path
import sys


def manager_module(root, name):
    root = Path(root).resolve()
    loaded = sys.modules.get('core')
    if loaded is not None:
        source = getattr(loaded, '__file__', None)
        if source and Path(source).resolve().parent != root / 'core':
            raise RuntimeError('Другой каталог менеджера уже загружен; перезапустите плагин.')
    location = str(root)
    if location in sys.path:
        sys.path.remove(location)
    sys.path.insert(0, location)
    module = importlib.import_module('core.' + name)
    if not Path(module.__file__).resolve().is_relative_to(root / 'core'):
        raise RuntimeError('Модуль менеджера загружен из другого каталога.')
    return module


def _snapshot(paths):
    return {path: path.read_bytes() if path.is_file() else None for path in paths}


def normalize_changed_ownership(root, before):
    """Root Decky must leave changed manager settings editable in Desktop."""
    root = Path(root)
    if os.geteuid() != 0:
        return
    owner = root.stat()
    paths = manager_module(root, 'custom_game_presets')._switch_paths(root)
    for path in paths:
        if not path.is_symlink() and path.is_file() and before.get(path) != path.read_bytes():
            os.chown(path, owner.st_uid, owner.st_gid)
    # These directories can be created by manager operations on a fresh install.
    for directory in (root / 'utils', root / 'files/lists'):
        if directory.is_dir() and directory.stat().st_uid == 0:
            os.chown(directory, owner.st_uid, owner.st_gid)


@contextmanager
def manager_change(root, restart=None):
    root = Path(root).resolve()
    with manager_module(root, 'config_lock').manager_settings_lock(root):
        paths = manager_module(root, 'custom_game_presets')._switch_paths(root)
        before = _snapshot(paths)
        try:
            with manager_module(root, 'strategy_settings').strategy_change(root, restart=restart):
                yield
                normalize_changed_ownership(root, before)
        except Exception as error:
            try:
                normalize_changed_ownership(root, before)
            except Exception as ownership_error:
                raise RuntimeError(f'{error}; не удалось восстановить права файлов: {ownership_error}') from error
            raise


def mutate(root, operation, restart):
    try:
        with manager_change(root, restart):
            operation()
        return True, 'ok'
    except Exception as error:
        return False, f'{type(error).__name__}: {error}'


def apply_strategy(root, strategy_name, restart):
    root = Path(root)
    if (not strategy_name or strategy_name.startswith('.') or '..' in strategy_name
            or '/' in strategy_name or '\\' in strategy_name):
        return False, 'invalid_name'
    working = root / 'utils/working_strategies.txt'
    try:
        if strategy_name not in {line.strip() for line in working.read_text(encoding='utf-8').splitlines()}:
            return False, 'not_in_working_list'
        path = root / 'files/strategy' / strategy_name
        content = path.read_text(encoding='utf-8').strip()
    except OSError as error:
        return False, str(error)
    if not content:
        return False, 'Пустой config не применён.'
    try:
        manager_module(root, 'strategy_payloads').validate_payloads(content, root)
    except Exception as error:
        return False, str(error)
    def save():
        (root / 'utils').mkdir(parents=True, exist_ok=True)
        (root / 'utils/name_strategy.txt').write_text(strategy_name if content else '', encoding='utf-8')
        (root / 'config.txt').write_text(content + ('\n' if content else ''), encoding='utf-8')
        # Reapply the active game mode exactly as the desktop does.
        manager_module(root, 'game_presets').reapply_active_preset_to_config(str(root))
    return mutate(root, save, restart)


def validate_bundle_version(bundle, configured):
    bundle = Path(bundle)
    manifest_version = (bundle / 'version.txt').read_text(encoding='utf-8').splitlines()[0].strip()
    tree = ast.parse((bundle / 'core/manager_config.py').read_text(encoding='utf-8'))
    package_version = None
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'VERSION_CONFIG' for target in node.targets):
            if isinstance(node.value, ast.Dict):
                for key, value in zip(node.value.keys, node.value.values):
                    if isinstance(key, ast.Constant) and key.value == 'current_version':
                        package_version = ast.literal_eval(value)
    if manifest_version != configured or package_version != configured:
        raise ValueError('Версия загруженного пакета не совпадает с установленным менеджером.')


def prepare_service_bundle(manager, work):
    """Installed managers omit zapret/: download a matching validated full bundle."""
    import urllib.request
    manager, work = Path(manager), Path(work)
    updater = manager_module(manager, 'zapret_updater')
    configured = manager_module(manager, 'manager_config').VERSION_CONFIG['current_version']
    if updater.validate_service_bundle(str(manager)):
        validate_bundle_version(manager, configured)
        return manager
    version, url = updater.read_bundle_manifest()
    if not url or version != configured:
        raise ValueError('Для установки службы сначала обновите менеджер до версии полного пакета.')
    if not url.startswith('https://'):
        raise ValueError('Манифест полного пакета должен использовать HTTPS.')
    work.mkdir(parents=True, exist_ok=True)
    archive = work / 'bundle.tar.gz'
    maximum = 256 * 1024 * 1024
    count = 0
    with urllib.request.urlopen(url, timeout=60) as response, archive.open('wb') as target:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            count += len(chunk)
            if count > maximum:
                raise ValueError('Полный пакет превышает допустимый размер.')
            target.write(chunk)
    extracted = work / 'bundle'
    extracted.mkdir()
    updater.extract_bundle(str(archive), str(extracted))
    root = updater.find_bundle_root(str(extracted))
    if not root or not updater.validate_bundle_structure(root):
        raise ValueError('Некорректный полный пакет менеджера и службы.')
    validate_bundle_version(root, configured)
    return Path(root)
