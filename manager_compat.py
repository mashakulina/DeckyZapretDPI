"""Plugin-owned compatibility for official manager 2.8.0.

Locks and preflight follow the audited 2.8.1 implementations. Nothing is installed
into, or impersonates a module in, the manager namespace.
"""
from contextlib import contextmanager
from pathlib import Path
import fcntl
import json
import logging
import os
import re
import stat
import threading

class SettingsBusyError(ValueError):
    pass

_guard = threading.Lock()
_locks = {}
_local = threading.local()

@contextmanager
def manager_settings_lock(manager_dir):
    root = str(Path(manager_dir).resolve())
    with _guard:
        lock = _locks.setdefault(root, threading.RLock())
    if not lock.acquire(blocking=False):
        raise SettingsBusyError('Настройки уже изменяются. Дождитесь завершения операции и повторите попытку.')
    active = getattr(_local, 'active', None)
    if active is None:
        active = _local.active = set()
    descriptor = None
    try:
        if root not in active:
            directory = Path(root) / 'utils'
            directory.mkdir(parents=True, exist_ok=True)
            path = directory / '.settings.lock'
            flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW
            try:
                descriptor = os.open(path, flags | os.O_CREAT | os.O_EXCL, 0o644)
                # Decky may create the lock as root with a restrictive umask.
                # Locking a read-only fd lets the desktop user use it as well.
                os.fchmod(descriptor, 0o644)
            except FileExistsError:
                descriptor = os.open(path, flags)
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise SettingsBusyError(
                    'Настройки уже изменяются в другом окне или Decky. Повторите попытку после завершения операции.'
                ) from error
            active.add(root)
        yield
    finally:
        if descriptor is not None:
            active.discard(root)
            os.close(descriptor)
        lock.release()

class PayloadUnavailable(ValueError):
    pass

def validate_payloads(text, root=None, starter='/opt/zapret/starter.sh', payload_dir=None):
    root = Path(root) if root is not None else Path.home() / 'Zapret_DPI_Manager'
    # No external payload means no dependency on the installed alias registry.
    clean = '\n'.join(line.split('#', 1)[0] for line in text.lstrip('\ufeff').splitlines())
    values = re.findall(r'--dpi-desync-(?:fake-(?:http|tls|quic|discord|stun|syndata|unknown|unknown-udp)|split-seqovl-pattern|fakedsplit-pattern|udplen-pattern)=([^\s]+)', clean)
    external = [v for v in values if v != '!' and not re.fullmatch(r'0x[0-9a-fA-F]*', v)]
    aliases = set(re.findall(r'\{([^{}]+)\}', clean)) - {
        'list_general', 'list_general_user', 'list_exclude', 'list_exclude_user',
        'list_google', 'ipset_all', 'ipset_all_user', 'ipset_exclude', 'ipset_exclude_user',
        'GameFilter', 'gw', 'other'}
    if not external and not aliases:
        return []
    starter = Path(starter)
    if str(starter) == '/opt/zapret/starter.sh' and not starter.exists() and not starter.is_symlink():
        starter = root / 'zapret/system/starter.sh'
    if starter.is_symlink() or not starter.is_file():
        raise PayloadUnavailable(f'Не найден обычный starter.sh: {starter}')
    mapping = dict(re.findall(r'^    line="\$\{line//\\\{([A-Za-z0-9_.-]+)\\\}/\$TEMP_DIR/([A-Za-z0-9_.-]+)\}"[ \t]*$', starter.read_text(), re.M))
    paths = set()
    for alias in aliases:
        filename = mapping.get(alias)
        if not filename or not filename.endswith('.bin'):
            raise PayloadUnavailable(f'Неизвестная подстановка BIN: {{{alias}}}')
        paths.add((Path(payload_dir) if payload_dir else root / 'files/bin') / filename)
    for value in external:
        if '"' in value or "'" in value:
            raise PayloadUnavailable('Пути BIN в кавычках не поддерживаются starter.sh. Используйте зарегистрированную подстановку {alias} или путь без пробелов и кавычек.')
        if re.fullmatch(r'\{[^{}]+\}', value):
            continue
        if '{' in value or '}' in value:
            raise PayloadUnavailable(f'Некорректная ссылка BIN: {value}')
        path = Path(value)
        paths.add(path if path.is_absolute() else root / path)
    for path in sorted(paths):
        try:
            info = path.lstat()
            if not stat.S_ISREG(info.st_mode) or not info.st_size or not info.st_mode & 0o444:
                raise OSError('не обычный читаемый непустой файл')
            # O_NOFOLLOW also closes the symlink race between lstat and open.
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                opened = os.fstat(fd)
                if not stat.S_ISREG(opened.st_mode) or not os.read(fd, 1):
                    raise OSError('пустой или не обычный файл')
            finally:
                os.close(fd)
        except OSError as error:
            raise PayloadUnavailable(f'BIN недоступен: {path} ({error})') from error
    return sorted(paths)

class GameOperations:
    """Headless 2.8.0 adapter, adapted from manager 2.8.1 game_mode.

    All manager dependencies are resolved through the bridge origin guard.
    """
    def __init__(self, root, load):
        module = load(root, 'custom_game_presets')
        self._read = module._read
        self._commit = module._commit
        self._json = module._json
        module = load(root, 'game_presets')
        self.get_game_presets = module.get_game_presets
        self.get_active_preset_id = module.get_active_preset_id
        self.is_custom_preset = module.is_custom_preset
        self.apply_custom_preset = module.apply_custom_preset
        self.clear_custom_preset = module.clear_custom_preset
        self.validate_custom_preset = module.validate_custom_preset
        self.set_active_preset = module.set_active_preset
        self.clear_active_preset = module.clear_active_preset
        self.remove_preset_lines_from_config = module.remove_preset_lines_from_config
        self.restore_gamefilter_for_preset = module.restore_gamefilter_for_preset
        self.games_data_file = module.games_data_file
        self.substitute_gamefilter_in_config = module.substitute_gamefilter_in_config
        self.preset_switch_transaction = module.preset_switch_transaction
        module = load(root, 'game_filter_settings')
        self.disable_standalone_gamefilter = module.disable_standalone_gamefilter
        self.read_game_filter_custom_ports = module.read_game_filter_custom_ports
        self.read_game_filter_protocol_mode = module.read_game_filter_protocol_mode
        self.write_game_filter_settings = module.write_game_filter_settings
        self.validate_game_filter_custom_ports = module.validate_game_filter_custom_ports
        module = load(root, 'game_filter_extras')
        self.clear_game_mode_extras_if_inactive = module.clear_game_mode_extras_if_inactive

    def _preset_read_nonempty_lines(self, path):
        """Читает непустые строки файла без комментариев."""
        if not os.path.isfile(path):
            return []
        with open(path, "r", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]

    def _list_state(self, root):
        path = Path(root) / 'utils' / 'builtin_game_lists.state.json'
        raw = self._read(path)
        data = json.loads(raw) if raw is not None else {'version': 1, 'sources': {}}
        if not isinstance(data, dict) or data.get('version') != 1 or not isinstance(data.get('sources'), dict):
            raise ValueError('Повреждены сведения о списках встроенного пресета.')
        return path, data

    def _preset_apply_user_list(self, manager_dir, source_name, target_name):
        """Append only missing game entries and remember exactly what this adds."""
        root = Path(manager_dir)
        source = self.games_data_file(str(root), source_name)
        additions = self._preset_read_nonempty_lines(source)
        if not additions:
            raise FileNotFoundError(f'Файл не найден или пуст: {source}')
        target = root / 'files/lists' / target_name
        state_path, state = self._list_state(root)
        if source_name in state['sources']:
            # Stable Desktop can clear a preset without knowing our journal.
            # Only keep the old baseline while its activation marker survives.
            preset_id = 'fall_guys' if 'fallguys' in source_name else 'roblox'
            if self.get_active_preset_id(str(root)) == preset_id:
                return
            del state['sources'][source_name]
        before = self._read(target)
        existing = set(self._preset_read_nonempty_lines(target))
        owned = []
        for line in additions:
            if line not in existing:
                owned.append(line)
                existing.add(line)
        after = before or b''
        if owned:
            newline = b'\r\n' if b'\r\n' in after else b'\n'
            if after and not after.endswith((b'\r', b'\n')):
                after += newline
            after += newline.join(line.encode('utf-8') for line in owned) + newline
        state['sources'][source_name] = dict(target=target_name,
            before=before.hex() if before is not None else None, after=after.hex(), added=owned)
        self._commit({target: after, state_path: self._json(state)})

    def _preset_remove_user_list(self, manager_dir, source_name, target_name):
        root = Path(manager_dir)
        state_path, state = self._list_state(root)
        entry = state['sources'].get(source_name)
        if entry is None:
            # An older installation did not record ownership. Removing every source
            # match would also erase pre-existing user entries, so keep those lines.
            logging.getLogger(__name__).warning(
                'Legacy preset %s has no list journal; preserving user list %s', source_name, target_name)
            return
        if not isinstance(entry, dict) or entry.get('target') != target_name:
            raise ValueError('Повреждены сведения о списках встроенного пресета.')
        target = root / 'files/lists' / target_name
        current = self._read(target)
        before = bytes.fromhex(entry['before']) if entry.get('before') is not None else None
        after = bytes.fromhex(entry['after'])
        if current == after:
            restored = before
        elif current is None:
            restored = None
        else:
            # Keep comments, ordering, duplicates and later user edits. Remove at
            # most one occurrence per entry that this preset actually appended.
            lines = current.decode('utf-8').splitlines(keepends=True)
            for owned in reversed(entry['added']):
                for index in range(len(lines) - 1, -1, -1):
                    if lines[index].strip() == owned:
                        del lines[index]
                        break
            restored = ''.join(lines).encode('utf-8')
        del state['sources'][source_name]
        self._commit({target: restored, state_path: self._json(state) if state['sources'] else None})

    def _preset_remove_list_general_user_domains(self, manager_dir, games_list_file):
        self._preset_remove_user_list(manager_dir, games_list_file, 'list-general_user.txt')

    def _preset_apply_list_general_user_domains(self, manager_dir, games_list_file):
        self._preset_apply_user_list(manager_dir, games_list_file, 'list-general_user.txt')

    def _preset_remove_ipset_user_entries(self, manager_dir, games_ipset_file):
        self._preset_remove_user_list(manager_dir, games_ipset_file, 'ipset-all_user.txt')

    def _preset_apply_ipset_user_entries(self, manager_dir, games_ipset_file):
        self._preset_apply_user_list(manager_dir, games_ipset_file, 'ipset-all_user.txt')

    def _preset_remove_roblox_domains(self, manager_dir):
        self._preset_remove_list_general_user_domains(manager_dir, "list-general_roblox.txt")

    def _preset_remove_roblox_ipset(self, manager_dir):
        self._preset_remove_ipset_user_entries(manager_dir, "ipset-all_roblox.txt")

    def _preset_remove_fallguys_domains(self, manager_dir):
        self._preset_remove_list_general_user_domains(manager_dir, "list-general_fallguys.txt")

    def _preset_remove_fallguys_ipset(self, manager_dir):
        self._preset_remove_ipset_user_entries(manager_dir, "ipset-all_fallguys.txt")

    def _preset_set_ipset_none(self, manager_dir):
        target_path = os.path.join(manager_dir, "files", "lists", "ipset-all.txt")
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with open(target_path, "w", encoding="utf-8") as f:
            f.write("203.0.113.113/32")

    def clear_active_game_preset_disk(self, manager_dir: str) -> None:
        """Снимает активный пресет с диска (без перезапуска службы и без диалогов)."""
        with self.preset_switch_transaction(manager_dir):
            active_before = self.get_active_preset_id(manager_dir)
            if active_before:
                if self.is_custom_preset(active_before, manager_dir):
                    self.clear_custom_preset(active_before, manager_dir)
                    self.clear_active_preset(manager_dir)
                    return
                if active_before == "roblox":
                    self._preset_remove_roblox_domains(manager_dir)
                    self._preset_remove_roblox_ipset(manager_dir)
                elif active_before == "fall_guys":
                    self._preset_remove_fallguys_domains(manager_dir)
                    self._preset_remove_fallguys_ipset(manager_dir)
                else:
                    self.remove_preset_lines_from_config(active_before, manager_dir)
                if active_before == "elite_dangerous":
                    self._preset_set_ipset_none(manager_dir)
                self.restore_gamefilter_for_preset(active_before, manager_dir)
            self.clear_active_preset(manager_dir)

    def apply_game_preset_disk(self, manager_dir, preset_id):
        """Apply or clear a built-in/custom preset identically in either UI."""
        root = Path(manager_dir)
        presets = self.get_game_presets(str(root))
        if preset_id is not None and preset_id not in presets:
            raise ValueError('Пресет не найден.')
        if preset_id and self.is_custom_preset(preset_id, str(root)):
            self.validate_custom_preset(preset_id, str(root), check_config=False)
        with self.preset_switch_transaction(str(root)):
            previous = self.get_active_preset_id(str(root))
            if preset_id is None:
                self.clear_active_game_preset_disk(str(root))
                self.clear_game_mode_extras_if_inactive(str(root))
                return
            if previous and previous != preset_id:
                self.clear_active_game_preset_disk(str(root))
            if self.is_custom_preset(preset_id, str(root)):
                self.apply_custom_preset(preset_id, str(root))
                self.set_active_preset(preset_id, str(root))
                return
            self.disable_standalone_gamefilter(str(root))
            preset = presets[preset_id]
            tcp, udp = preset.get('game_filter_tcp'), preset.get('game_filter_udp')
            if tcp is not None and udp is not None:
                self.substitute_gamefilter_in_config(tcp, udp, str(root))
            game = {'roblox': 'roblox', 'fall_guys': 'fallguys'}.get(preset_id)
            if game:
                self._preset_apply_list_general_user_domains(str(root), f'list-general_{game}.txt')
                self._preset_apply_ipset_user_entries(str(root), f'ipset-all_{game}.txt')
            elif preset_id == 'elite_dangerous':
                source = root / 'utils/ipset-all.txt'
                (root / 'files/lists/ipset-all.txt').write_bytes(source.read_bytes())
            lines = preset.get('lines') or []
            if lines:
                path = root / 'config.txt'
                content = path.read_text(encoding='utf-8') if path.exists() else ''
                block = '\n'.join(lines)
                if content != block and not content.startswith(block + '\n'):
                    path.write_text(block + '\n' + content, encoding='utf-8')
            self.set_active_preset(preset_id, str(root))

    def toggle_gamefilter_disk(self, manager_dir, mode=None):
        """Preserve current custom ports when enabling; clear the full tuple when disabling."""
        root = Path(manager_dir)
        with self.preset_switch_transaction(str(root)):
            if (root / 'utils/gamefilter.enable').is_file():
                self.disable_standalone_gamefilter(str(root))
                self.clear_game_mode_extras_if_inactive(str(root))
                return False
            current_mode = self.read_game_filter_protocol_mode(str(root))
            current_ports = self.read_game_filter_custom_ports(str(root))
            chosen_mode = mode or current_mode
            if chosen_mode not in ('tcp', 'udp', 'both'):
                raise ValueError('Некорректный режим GameFilter.')
            # A protocol switch must not silently discard or invent user ports.
            ports = self.validate_game_filter_custom_ports(chosen_mode, current_ports)
            self.clear_active_game_preset_disk(str(root))
            self.write_game_filter_settings(chosen_mode, ports, str(root))
            (root / 'utils/gamefilter.enable').write_text('', encoding='utf-8')
            return True

    def set_gamefilter_mode_disk(self, manager_dir, mode):
        root = Path(manager_dir)
        with self.preset_switch_transaction(str(root)):
            if not (root / 'utils/gamefilter.enable').is_file():
                raise ValueError('GameFilter выключен.')
            if mode not in ('tcp', 'udp', 'both'):
                raise ValueError('Некорректный режим GameFilter.')
            ports = self.read_game_filter_custom_ports(str(root))
            if ports is not None:
                protocols = ('tcp', 'udp') if mode == 'both' else (mode,)
                if any(protocol not in ports for protocol in protocols):
                    raise ValueError('Сначала задайте порты выбранного протокола в «Режим и порты GameFilter».')
            self.write_game_filter_settings(mode, ports, str(root))
