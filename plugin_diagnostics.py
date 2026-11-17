"""Small, read-only diagnostics shared by the plugin's Python entry points."""
import ast
import fcntl
from datetime import datetime, timezone
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import sys
import threading
import tempfile
import time
import traceback
import uuid

MAX_BYTES = 256 * 1024
BACKUP_COUNT = 2
MAX_TAIL = 32000
# Stable 2.8.0 lacks config_lock, game_mode and strategy_payloads. The plugin
# supplies those helpers when absent; only manager-owned dependencies are required.
REQUIRED_MODULES = ('custom_game_presets', 'strategy_settings', 'game_presets',
                    'game_filter_settings', 'game_filter_ports', 'manager_config',
                    'zapret_updater', 'strategy_import', 'strategy_paths', 'game_filter_extras')
_lock = threading.RLock()
_manager_import_lock = threading.RLock()
_last_error = None
_last_error_path = None
_recent_errors = {}
_ALLOWED = {'phase', 'manager_path', 'plugin_path', 'module', 'module_path',
            'missing_module', 'core_paths', 'version', 'target_version', 'error_id'}


class _QuietRotatingHandler(RotatingFileHandler):
    def handleError(self, record):
        pass


def _log_path():
    directory = os.environ.get('DECKY_PLUGIN_LOG_DIR')
    if not directory:
        directory = '/tmp/deckyzapretdpi'
    return Path(directory) / 'diagnostics.log'


def _write(entry):
    """Serialize rotation across backend/worker processes; never retain old inodes."""
    try:
        with _lock:
            path = _log_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.with_name('diagnostics.lock').open('a') as lockfile:
                fcntl.flock(lockfile, fcntl.LOCK_EX)
                # Another process may have rotated since our previous write.
                # A fresh handler opens the currently named file under the lock.
                handler = _QuietRotatingHandler(path, maxBytes=MAX_BYTES,
                                                 backupCount=BACKUP_COUNT, encoding='utf-8')
                try:
                    record = logging.LogRecord('decky.diagnostics', logging.INFO, '', 0,
                                               json.dumps(entry, ensure_ascii=False), (), None)
                    handler.emit(record)
                    if entry.get('status') == 'error':
                        value = {key: entry[key] for key in ('id', 'operation', 'message', 'timestamp')}
                        if _newest_error(_read_last_error(), value) is value:
                            _persist_last_error(value)
                finally:
                    handler.close()
    except Exception:
        pass


def _entry(operation, status, context):
    data = {'timestamp': datetime.now(timezone.utc).isoformat(),
            'operation': str(operation)[:160], 'status': str(status)[:80]}
    for key, value in context.items():
        if key in _ALLOWED:
            data[key] = ([str(item)[:1000] for item in value[:20]]
                         if isinstance(value, (list, tuple)) else str(value)[:2000])
    return data


def record_event(operation, status, **context):
    _write(_entry(operation, status, context))


def record_exception(operation, error, **context):
    global _last_error, _last_error_path
    error_id = uuid.uuid4().hex[:12]
    data = _entry(operation, 'error', context)
    message = f'{type(error).__name__}: {error}'[:2000]
    try:
        log_path = str(_log_path().resolve())
    except Exception:
        log_path = None
    key = (log_path, str(operation), message, str(context.get('manager_path', '')), str(context.get('phase', '')))
    now = time.monotonic()
    with _lock:
        recent = _recent_errors.get(key)
        if str(operation) == 'manager.import' and recent and now - recent[0] < 30:
            return recent[1]['id']
    data.update(id=error_id, message=message,
                traceback=''.join(traceback.format_exception(type(error), error, error.__traceback__))[-48000:])
    if isinstance(error, ModuleNotFoundError):
        data['missing_module'] = error.name
    with _lock:
        _last_error = {key: data[key] for key in ('id', 'operation', 'message', 'timestamp')}
        _last_error_path = log_path
        if len(_recent_errors) >= 128:
            _recent_errors.pop(next(iter(_recent_errors)))
        _recent_errors[key] = (now, dict(_last_error))
    _write(data)
    return error_id



def _persist_last_error(value):
    temporary = None
    try:
        path = _log_path().with_name('last_error.json')
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         prefix='.last-error-', delete=False) as target:
            temporary = Path(target.name)
            json.dump(value, target, ensure_ascii=False)
        os.replace(temporary, path)
    except Exception:
        pass
    finally:
        if temporary is not None:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass


def _read_last_error():
    try:
        path = _log_path().with_name('last_error.json')
        if path.stat().st_size > 8192:
            return None
        value = json.loads(path.read_text(encoding='utf-8'))
        fields = ('id', 'operation', 'message', 'timestamp')
        if isinstance(value, dict) and all(isinstance(value.get(key), str) for key in fields):
            return {key: value[key][:2000] for key in fields}
    except (OSError, ValueError, TypeError, RecursionError):
        pass
    return None



def _error_time(value):
    try:
        timestamp = datetime.fromisoformat(value['timestamp'])
        if timestamp.tzinfo is not None:
            return timestamp
    except (KeyError, TypeError, ValueError):
        pass
    return None


def _newest_error(*values):
    valid = [(value, _error_time(value)) for value in values if value is not None]
    valid = [(value, timestamp) for value, timestamp in valid if timestamp is not None]
    return max(valid, key=lambda pair: pair[1])[0] if valid else None


def read_tail(max_chars=16000):
    try:
        limit = max(0, min(int(max_chars), MAX_TAIL))
        if not limit:
            return ''
        # UTF-8 is at most four bytes per character; never read the whole log.
        with _log_path().open('rb') as source:
            source.seek(0, 2)
            source.seek(max(0, source.tell() - limit * 4))
            return source.read(limit * 4).decode('utf-8', errors='replace')[-limit:]
    except (OSError, ValueError, TypeError):
        return ''


def _manager_version(root):
    try:
        source = root / 'core/manager_config.py'
        if source.stat().st_size > 128 * 1024:
            return None
        for node in ast.parse(source.read_text(encoding='utf-8')).body:
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'VERSION_CONFIG' for t in node.targets):
                if isinstance(node.value, ast.Dict):
                    for key, value in zip(node.value.keys, node.value.values):
                        if isinstance(key, ast.Constant) and key.value == 'current_version':
                            result = ast.literal_eval(value)
                            return result if isinstance(result, str) else None
    except (OSError, ValueError, SyntaxError, TypeError, RecursionError):
        pass
    return None


def snapshot(manager_root, plugin_root=None):
    manager = Path(manager_root).resolve()
    plugin = Path(plugin_root or Path(__file__).resolve().parent).resolve()
    version = None
    try:
        manifest = plugin / 'plugin.json'
        if manifest.stat().st_size < 128 * 1024:
            value = json.loads(manifest.read_text(encoding='utf-8')).get('version')
            version = value if isinstance(value, str) else None
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    loaded = sys.modules.get('core')
    missing = ['core.' + name for name in REQUIRED_MODULES
               if not (manager / 'core' / (name + '.py')).is_file()]
    with _lock:
        memory = dict(_last_error) if _last_error and _last_error_path == str(_log_path().resolve()) else None
        last = _newest_error(memory, _read_last_error())
    return dict(plugin_version=version, plugin_path=str(plugin),
                manager_version=_manager_version(manager), manager_path=str(manager),
                missing_modules=missing, core_paths=[str(p) for p in getattr(loaded, '__path__', [])],
                log_path=str(_log_path()), log_tail=read_tail(), last_error=last,
                compatible=not missing)
