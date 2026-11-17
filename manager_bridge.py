"""Headless manager operations shared by Decky controls and autopicker."""
import ast
from contextlib import contextmanager
from contextvars import ContextVar
import importlib
import importlib.util
import importlib.machinery
import _imp
import os
from pathlib import Path
import sys
import types
import threading


# main and autopicker load this bridge by file path under different names.
# A stable registry key keeps diagnostics/handlers shared across those imports.
def _load_diagnostics():
    key = '_decky_zapret_plugin_diagnostics'
    # Only reserve the shared mutex under Python's global import lock. Do not
    # hold that lock while executing code which may import other modules.
    _imp.acquire_lock()
    try:
        state = sys.modules.get(key + '_state')
        if state is None:
            state = types.ModuleType(key + '_state')
            state.lock = threading.RLock()
            sys.modules[key + '_state'] = state
    finally:
        _imp.release_lock()
    with state.lock:
        module = sys.modules.get(key)
        if module is None:
            spec = importlib.util.spec_from_file_location(key, Path(__file__).with_name('plugin_diagnostics.py'))
            module = importlib.util.module_from_spec(spec)
            sys.modules[key] = module
            try:
                spec.loader.exec_module(module)
            except Exception:
                sys.modules.pop(key, None)
                raise
        return module


diagnostics = _load_diagnostics()


_operation_name = ContextVar('decky_manager_operation', default='manager.import')

def _failure(operation, error, root, **context):
    error_id = getattr(error, 'diagnostics_error_id', None)
    if error_id is None:
        error_id = diagnostics.record_exception(operation, error, manager_path=str(root),
            core_paths=list(getattr(sys.modules.get('core'), '__path__', [])), **context)
        try:
            error.diagnostics_error_id = error_id
        except Exception:
            pass
    return f'{type(error).__name__}: {error} [ID: {error_id}]'


def _inside(path, directory):
    return Path(path).resolve().is_relative_to(directory)


def manager_module(root, name, operation_name=None):
    root = Path(root).resolve()
    directory = root / 'core'
    try:
        if not name or any(not part.isidentifier() for part in name.split('.')):
            raise ValueError('Invalid manager module name')
        # Never discard already loaded children: config_lock contains shared locks.
        # A stale namespace alone is safe to repair, a foreign child is not.
        with diagnostics._manager_import_lock:
            for key, child in list(sys.modules.items()):
                if not key.startswith('core.') or child is None:
                    continue
                source = getattr(child, '__file__', None)
                paths = list(getattr(child, '__path__', []))
                if ((source and _inside(source, directory)) or
                        (not source and paths and all(_inside(p, directory) for p in paths))):
                    continue
                raise RuntimeError(f'Модуль {key} ({source or paths}) загружен из другого каталога; перезапустите плагин.')
            loaded = sys.modules.get('core')
            source = getattr(loaded, '__file__', None)
            if source and Path(source).resolve().parent != directory:
                raise RuntimeError('Другой каталог менеджера уже загружен; перезапустите плагин.')
            if loaded is None:
                loaded = types.ModuleType('core')
                loaded.__package__ = 'core'
                sys.modules['core'] = loaded
            loaded.__path__ = [str(directory)]
            spec = importlib.machinery.ModuleSpec('core', loader=None, is_package=True)
            spec.submodule_search_locations = loaded.__path__
            loaded.__spec__ = spec
            importlib.invalidate_caches()
            already_loaded = 'core.' + name in sys.modules
            import_spec = importlib.util.find_spec('core.' + name)
            if import_spec and import_spec.origin and not _inside(import_spec.origin, directory):
                raise RuntimeError(f'Модуль core.{name} ({import_spec.origin}) находится в другом каталоге; восстановите менеджер и перезапустите плагин.')
            module = importlib.import_module('core.' + name)
            if not getattr(module, '__file__', None) or not _inside(module.__file__, directory):
                raise RuntimeError('Модуль менеджера загружен из другого каталога; перезапустите плагин.')
            if not already_loaded:
                diagnostics.record_event(operation_name or _operation_name.get(), 'loaded', phase='import',
                    manager_path=str(root), module='core.' + name, module_path=module.__file__,
                    core_paths=loaded.__path__, version=diagnostics._manager_version(root))
            return module
    except Exception as error:
        message = _failure(operation_name or _operation_name.get(), error, root, phase='import', module='core.' + name,
                           module_path=str(directory / (name.replace('.', '/') + '.py')),
                           version=diagnostics._manager_version(root))
        if isinstance(error, ModuleNotFoundError):
            wrapped = RuntimeError(f'Отсутствует модуль {error.name}; обновите или восстановите менеджер. {message}')
            wrapped.diagnostics_error_id = error.diagnostics_error_id
            raise wrapped from error
        raise


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


def mutate(root, operation, restart, operation_name="manager.mutate"):
    token = _operation_name.set(operation_name)
    try:
        diagnostics.record_event(operation_name, 'started', manager_path=str(root), phase='apply')
        with manager_change(root, restart):
            operation()
        diagnostics.record_event(operation_name, 'completed', manager_path=str(root), phase='apply')
        return True, 'ok'
    except Exception as error:
        return False, _failure(operation_name, error, root, phase='apply')
    finally:
        _operation_name.reset(token)


def apply_strategy(root, strategy_name, restart, operation_name="manager.apply_strategy"):
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
        return False, _failure(operation_name, error, root, phase="validate")
    if not content:
        return False, 'Пустой config не применён.'
    try:
        manager_module(root, 'strategy_payloads', operation_name=operation_name).validate_payloads(content, root)
    except Exception as error:
        return False, _failure(operation_name, error, root, phase="validate")
    def save():
        (root / 'utils').mkdir(parents=True, exist_ok=True)
        (root / 'utils/name_strategy.txt').write_text(strategy_name if content else '', encoding='utf-8')
        (root / 'config.txt').write_text(content + ('\n' if content else ''), encoding='utf-8')
        # Reapply the active game mode exactly as the desktop does.
        manager_module(root, 'game_presets').reapply_active_preset_to_config(str(root))
    return mutate(root, save, restart, operation_name=operation_name)


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
