import asyncio
import importlib.util
import json
import os
import pathlib
import shlex
import shutil
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Optional

# Shared backend bridge is loaded by path because Decky may omit the plugin
# directory from sys.path. Core modules always come from the explicit manager.
_bridge_spec = importlib.util.spec_from_file_location("decky_manager_bridge", pathlib.Path(__file__).with_name("manager_bridge.py"))
_bridge = importlib.util.module_from_spec(_bridge_spec)
_bridge_spec.loader.exec_module(_bridge)


def _plugin_json_path() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parent / "plugin.json"


def _read_local_version_fallback() -> dict:
    try:
        data = json.loads(_plugin_json_path().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        _bridge.diagnostics.record_exception("read_plugin_version", e)
        return {
            "ok": False,
            "current_version": "",
            "error": str(e),
            "error_code": "local_version_unavailable",
        }
    ver = data.get("version")
    if not isinstance(ver, str) or not ver.strip():
        return {
            "ok": False,
            "current_version": "",
            "error": "plugin.json: нет поля version",
            "error_code": "local_version_unavailable",
        }
    return {
        "ok": True,
        "current_version": ver.strip(),
        "error": None,
        "error_code": None,
    }


def _get_plugin_version_info_thread() -> dict:
    info = _read_local_version_fallback()
    if info.get("ok"):
        return {
            "ok": True,
            "current_version": info["current_version"],
            "error": None,
            "error_code": None,
        }
    return {
        "ok": False,
        "current_version": "",
        "error": info.get("error"),
        "error_code": info.get("error_code"),
    }


# Zapret DPI Manager install location on Steam Deck (same as desktop app default)
_MANAGER_ROOT = pathlib.Path("/home/deck/Zapret_DPI_Manager")


def _manager_installed() -> bool:
    """Полная установка менеджера: каталог + точка входа GUI (как в репозитории Zapret-DPI-for-Steam-Deck)."""
    root = _MANAGER_ROOT
    if not root.is_dir():
        return False
    main_py = root / "main.py"
    presets = root / "core" / "game_presets.py"
    return main_py.is_file() and presets.is_file()


_ZAPRET_OPT = pathlib.Path("/opt/zapret")
# Как в Zapret DPI Manager: unit в /etc (immutable-/usr, обновлённый SteamOS); legacy — старые установки.
_ZAPRET_SYSTEMD_UNIT = pathlib.Path("/etc/systemd/system/zapret.service")
_ZAPRET_SYSTEMD_UNIT_LEGACY = pathlib.Path("/usr/lib/systemd/system/zapret.service")


def _zapret_service_installed() -> bool:
    """Служба zapret: /opt/zapret и unit в /etc или в legacy /usr (старые установки / до синхронизации с менеджером)."""
    if not _ZAPRET_OPT.is_dir():
        return False
    return _ZAPRET_SYSTEMD_UNIT.is_file() or _ZAPRET_SYSTEMD_UNIT_LEGACY.is_file()


# Загружаем decky_autopicker по пути рядом с main.py: в песочнице Decky sys.path может не содержать каталог плагина.
_autopicker: Any = None
_autopicker_load_error: Optional[str] = None


def _load_decky_autopicker() -> None:
    global _autopicker, _autopicker_load_error
    _autopicker = None
    _autopicker_load_error = None
    mod_path = pathlib.Path(__file__).resolve().parent / "decky_autopicker.py"
    if not mod_path.is_file():
        _autopicker_load_error = f"Файл не найден: {mod_path}"
        return
    try:
        spec = importlib.util.spec_from_file_location("decky_autopicker", mod_path)
        if spec is None or spec.loader is None:
            _autopicker_load_error = "Не удалось создать spec для decky_autopicker"
            return
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _autopicker = mod
    except Exception as e:
        _autopicker_load_error = f"{type(e).__name__}: {e}"
        _autopicker = None


_load_decky_autopicker()

_game_presets: Any = None
_game_presets_load_error: Optional[str] = None
_game_presets_mtime: Optional[float] = None
_DECKY_GAME_PRESETS_MOD = "decky_game_presets"


def _ensure_manager_syspath_for_presets() -> None:
    """Чтобы game_presets.py мог импортировать соседние модули из core/ (если появятся)."""
    for p in (_MANAGER_ROOT / "core", _MANAGER_ROOT):
        if not p.is_dir():
            continue
        s = str(p.resolve())
        if s not in sys.path:
            sys.path.insert(0, s)


def _load_game_presets() -> None:
    global _game_presets, _game_presets_load_error, _game_presets_mtime
    _game_presets = None
    _game_presets_load_error = None
    _game_presets_mtime = None
    mod_path = _MANAGER_ROOT / "core" / "game_presets.py"
    if not mod_path.is_file():
        _game_presets_load_error = f"Файл не найден: {mod_path}"
        return
    try:
        _game_presets = _bridge.manager_module(_MANAGER_ROOT, 'game_presets')
        try:
            _game_presets_mtime = mod_path.stat().st_mtime
        except OSError:
            _game_presets_mtime = None
    except Exception as e:
        _game_presets_load_error = f"{type(e).__name__}: {e}"
        _game_presets = None


def _maybe_reload_game_presets() -> None:
    """Повторная загрузка после появления менеджера (при старте плагина файла ещё не было или импорт упал)."""
    manager_ok = _manager_installed()
    mod_path = _MANAGER_ROOT / "core" / "game_presets.py"
    current_mtime: Optional[float] = None
    try:
        current_mtime = mod_path.stat().st_mtime
    except OSError:
        current_mtime = None
    if not manager_ok:
        return
    needs_reload = (_game_presets is None) or (_game_presets_mtime != current_mtime)
    if not needs_reload:
        return
    _load_game_presets()


_load_game_presets()


def _clean_env():
    env = os.environ.copy()
    env.pop("LD_LIBRARY_PATH", None)
    env.pop("LD_PRELOAD", None)
    return env


def _manager_dir() -> pathlib.Path:
    return _MANAGER_ROOT


def _systemctl_exe() -> str:
    for p in ("/usr/bin/systemctl", "/bin/systemctl"):
        if pathlib.Path(p).is_file():
            return p
    return "systemctl"


def _run_systemctl(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [_systemctl_exe(), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=30,
        env=_clean_env(),
    )


def _zapret_daemon_looks_up() -> bool:
    try:
        for name in ("nfqws", "tpws"):
            r = subprocess.run(
                ["pgrep", "-x", name],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=5,
                env=_clean_env(),
            )
            if r.returncode == 0 and (r.stdout or "").strip():
                return True
        return False
    except (subprocess.TimeoutExpired, OSError):
        return False


def _service_state() -> str:
    try:
        r = _run_systemctl("show", "zapret", "-p", "ActiveState", "--value")
        v = (r.stdout or "").strip().lower()
        if v in ("active", "reloading"):
            return "active"
        if v == "inactive":
            return "inactive"
        if v == "failed":
            return "failed"
        if v == "activating":
            return "activating"
        if v == "deactivating":
            return "deactivating"

        r2 = _run_systemctl("is-active", "zapret")
        s = (r2.stdout or "").strip()
        if s in ("active", "inactive", "failed", "activating", "deactivating"):
            return s
        if r2.returncode == 0 and s:
            return s

        r3 = _run_systemctl("status", "zapret", "--no-pager", "-n", "0")
        out = (r3.stdout or "").lower()
        if "active (running)" in out:
            return "active"
        if "inactive (dead)" in out:
            return "inactive"
        if "failed" in out:
            return "failed"
    except (subprocess.TimeoutExpired, OSError):
        pass
    return "unknown"


def _read_strategy_label(manager: pathlib.Path) -> str:
    """Текущая стратегия: имя из name_strategy.txt; иначе Custom Strategy при непустом config."""
    name_strategy_file = manager / "utils" / "name_strategy.txt"
    config_file = manager / "config.txt"
    default = "Не выбрано"

    try:
        name_content = ""
        if name_strategy_file.is_file():
            name_content = name_strategy_file.read_text(encoding="utf-8").strip()
        config_content = ""
        if config_file.is_file():
            config_content = config_file.read_text(encoding="utf-8").strip()

        if name_content:
            return name_content
        if config_content:
            return "Custom Strategy"
        return default
    except OSError:
        return default


def _read_strategy_detail(manager: pathlib.Path) -> str:
    chosen = manager / "utils" / "chosen_strategies.txt"
    try:
        if not chosen.is_file():
            return ""
        text = chosen.read_text(encoding="utf-8").strip()
        if not text:
            return ""
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        return " · ".join(lines[:8]) if lines else ""
    except OSError:
        return ""


def _read_working_strategy_names(manager: pathlib.Path) -> list[str]:
    """Names marked as working by auto-test (star in StrategyWindow); one per line."""
    path = manager / "utils" / "working_strategies.txt"
    if not path.is_file():
        return []
    try:
        return [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    except OSError:
        return []


def _safe_strategy_basename(name: str) -> bool:
    if not name or "/" in name or "\\" in name:
        return False
    if ".." in name or name.startswith("."):
        return False
    return True


def _apply_strategy_from_file(manager: pathlib.Path, strategy_name: str) -> tuple[bool, str]:
    return _bridge.apply_strategy(manager, strategy_name, _restart_zapret_service)


def _restart_zapret_service() -> tuple[bool, str]:
    try:
        result = _run_systemctl("restart", "zapret")
        if result.returncode != 0:
            error = RuntimeError((result.stdout or '').strip()[:200] or 'systemctl failed')
            error_id = _bridge.diagnostics.record_exception('restart_zapret_service', error)
            return False, f'{error} (ID: {error_id})'
        active = _run_systemctl("is-active", "zapret")
        if active.returncode != 0 or (active.stdout or '').strip() != 'active':
            return False, 'Служба Zapret не активна после перезапуска.'
        return True, "ok"
    except Exception as error:
        error_id = _bridge.diagnostics.record_exception('restart_zapret_service', error)
        return False, f'{error} (ID: {error_id})'


def _gamefilter_enable_path(manager: pathlib.Path) -> pathlib.Path:
    return manager / "utils" / "gamefilter.enable"


def _gamefilter_mode_path(manager: pathlib.Path) -> pathlib.Path:
    return manager / "utils" / "gamefilter.mode"


def _normalize_gamefilter_protocol_mode(value: Optional[str]) -> str:
    v = (value or "").strip().lower()
    if v in ("both", "tcp", "udp"):
        return v
    return "both"


def _read_gamefilter_protocol_mode(manager: pathlib.Path) -> str:
    p = _gamefilter_mode_path(manager)
    if not p.is_file():
        return "both"
    try:
        text = p.read_text(encoding="utf-8")
        line = text.splitlines()[0] if text.strip() else ""
        return _normalize_gamefilter_protocol_mode(line)
    except OSError:
        return "both"


def _remove_gamefilter_mode_file(manager: pathlib.Path) -> None:
    p = _gamefilter_mode_path(manager)
    try:
        p.unlink(missing_ok=True)
    except OSError:
        pass


def _read_gamefilter_state(manager: pathlib.Path) -> tuple[bool, Optional[str], Optional[str]]:
    """enabled, preset_id, preset_display_name."""
    _maybe_reload_game_presets()
    enabled = _gamefilter_enable_path(manager).is_file()
    preset_id: Optional[str] = None
    preset_name: Optional[str] = None
    if _game_presets is not None:
        try:
            pid = _game_presets.get_active_preset_id(str(manager))
            preset_id = pid
            if pid and pid in _game_presets.get_game_presets(str(manager)):
                preset_name = _game_presets.get_game_presets(str(manager))[pid]["name"]
        except Exception:
            pass
    return enabled, preset_id, preset_name


def _list_game_presets_dicts() -> list[dict[str, str]]:
    _maybe_reload_game_presets()
    if _game_presets is None:
        return []
    out: list[dict[str, str]] = []
    try:
        for pid, data in _game_presets.get_game_presets(str(_manager_dir())).items():
            out.append({"id": pid, "name": str(data.get("name", pid))})
    except Exception:
        return []
    return out


def _set_game_preset_impl(manager: pathlib.Path, preset_id: Optional[str]) -> tuple[bool, str]:
    clear = not preset_id or str(preset_id).strip().lower() in ("", "none", "null")
    pid = None if clear else str(preset_id).strip()
    return _bridge.mutate(manager, lambda: _bridge.game_operation(manager, 'apply_game_preset_disk', pid), _restart_zapret_service)


def _toggle_gamefilter_impl(manager: pathlib.Path, protocol_mode: Optional[str] = None) -> tuple[bool, str]:
    return _bridge.mutate(manager, lambda: _bridge.game_operation(manager, 'toggle_gamefilter_disk', protocol_mode), _restart_zapret_service)


def _gamefilter_ports_state(manager: pathlib.Path) -> dict:
    """Expose stored settings, never starter.sh's disabled-protocol sentinel."""
    result = {"gamefilter_ports_available": False, "gamefilter_custom_ports": None,
              "gamefilter_default_ports": None, "gamefilter_ports_error": None}
    try:
        settings = _bridge.manager_module(manager, 'game_filter_settings')
        required = ('read_game_filter_custom_ports', 'validate_game_filter_custom_ports',
                    'write_game_filter_settings', 'DEFAULT_GAME_FILTER_TCP_PORTS',
                    'DEFAULT_GAME_FILTER_UDP_PORTS')
        if not all(hasattr(settings, name) for name in required):
            return result
        result['gamefilter_ports_available'] = True
        result['gamefilter_default_ports'] = {
            'tcp': settings.DEFAULT_GAME_FILTER_TCP_PORTS,
            'udp': settings.DEFAULT_GAME_FILTER_UDP_PORTS,
        }
        result['gamefilter_custom_ports'] = settings.read_game_filter_custom_ports(str(manager))
    except (ImportError, AttributeError):
        pass
    except Exception as error:
        result['gamefilter_ports_error'] = str(error)
    return result


def _set_gamefilter_ports_impl(manager: pathlib.Path, mode: Any, ports: Any,
                               reset: bool = False, expected_mode: Any = None,
                               expected_settings: Any = None) -> tuple[bool, str]:
    def save():
        settings = _bridge.manager_module(manager, 'game_filter_settings')
        if not all(hasattr(settings, name) for name in
                   ('validate_game_filter_custom_ports', 'write_game_filter_settings')):
            raise ValueError('GameFilter port editing requires an updated manager.')
        if not _gamefilter_enable_path(manager).is_file():
            raise ValueError('GameFilter выключен / GameFilter is disabled.')
        if _bridge.manager_module(manager, 'game_presets').get_active_preset_id(str(manager)):
            raise ValueError('Активен пресет игры / A game preset is active.')
        if expected_mode is not None and settings.read_game_filter_protocol_mode(str(manager)) != expected_mode:
            raise ValueError('Режим изменился. Откройте редактор снова / Mode changed. Reopen the editor.')
        current = _gamefilter_ports_state(manager)
        if expected_settings is not None and expected_settings != {
                'mode': settings.read_game_filter_protocol_mode(str(manager)),
                'ports': current['gamefilter_custom_ports'],
                'error': current['gamefilter_ports_error']}:
            raise ValueError('Настройки изменились. Откройте редактор снова / Settings changed. Reopen the editor.')
        if not reset and ports is None:
            raise ValueError('Укажите порты / Enter ports.')
        normalized = settings.validate_game_filter_custom_ports(mode, None if reset else ports)
        settings.write_game_filter_settings(mode, normalized, str(manager))
    return _bridge.mutate(manager, save, _restart_zapret_service)


def _set_gamefilter_protocol_mode_impl(manager: pathlib.Path, mode: str) -> tuple[bool, str]:
    return _bridge.mutate(manager, lambda: _bridge.game_operation(manager, 'set_gamefilter_mode_disk', mode), _restart_zapret_service)


_IPSET_NONE_MARKER = "203.0.113.113/32"


def _ipset_all_list_path(manager: pathlib.Path) -> pathlib.Path:
    return manager / "files" / "lists" / "ipset-all.txt"


def _ipset_all_utils_path(manager: pathlib.Path) -> pathlib.Path:
    return manager / "utils" / "ipset-all.txt"


def _set_ipset_all_to_none_marker(manager: pathlib.Path) -> None:
    """Как GamePresetWindow._set_ipset_none — режим IPsetFilter «none»."""
    path = _ipset_all_list_path(manager)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_IPSET_NONE_MARKER, encoding="utf-8")


def _apply_ipset_loaded_from_utils(manager: pathlib.Path) -> None:
    """Как GamePresetWindow._apply_ipset_loaded — копия utils/ipset-all.txt в lists (режим «loaded»)."""
    src = _ipset_all_utils_path(manager)
    dst = _ipset_all_list_path(manager)
    if not src.is_file():
        raise FileNotFoundError(f"Нет файла {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")


def _read_ipset_filter_mode(manager: pathlib.Path) -> str:
    """Как IpsetFilterWindow.load_current_mode: none | loaded | any."""
    ipset_all_file = _ipset_all_list_path(manager)
    ipset_utils_file = _ipset_all_utils_path(manager)
    try:
        if not ipset_all_file.is_file():
            return "none"
        content = ipset_all_file.read_text(encoding="utf-8").strip()
        try:
            file_size = ipset_all_file.stat().st_size
        except OSError:
            file_size = len(content.encode("utf-8"))

        if file_size == 0 or not content:
            return "any"

        if content == _IPSET_NONE_MARKER:
            return "none"

        if ipset_utils_file.is_file():
            utils_content = ipset_utils_file.read_text(encoding="utf-8").strip()
            content_lines = [line.strip() for line in content.split("\n") if line.strip()]
            utils_lines = [line.strip() for line in utils_content.split("\n") if line.strip()]
            if set(content_lines) == set(utils_lines):
                return "loaded"

        return "loaded"
    except Exception:
        return "none"


def _set_ipset_filter_mode_disk(manager: pathlib.Path, mode: str) -> tuple[bool, str]:
    m = (mode or "").strip().lower()
    if m not in ("none", "loaded", "any"):
        return False, "invalid_ipset_mode"
    ipset_all_file = _ipset_all_list_path(manager)
    ipset_utils_file = _ipset_all_utils_path(manager)
    try:
        ipset_all_file.parent.mkdir(parents=True, exist_ok=True)
        if m == "any":
            ipset_all_file.write_text("", encoding="utf-8")
        elif m == "loaded":
            if not ipset_utils_file.is_file():
                return False, "ipset_utils_missing"
            ipset_all_file.write_text(ipset_utils_file.read_text(encoding="utf-8"), encoding="utf-8")
        else:
            ipset_all_file.write_text(_IPSET_NONE_MARKER, encoding="utf-8")
    except OSError as e:
        return False, str(e)
    return True, "ok"



def _set_ipset_filter_mode_impl(manager: pathlib.Path, mode: str) -> tuple[bool, str]:
    def save():
        ok, message = _set_ipset_filter_mode_disk(manager, mode)
        if not ok:
            raise ValueError(message)
    return _bridge.mutate(manager, save, _restart_zapret_service)


def _collect_state() -> dict:
    _maybe_reload_game_presets()
    manager = _manager_dir()
    st = _service_state()
    if st == "unknown" and _zapret_daemon_looks_up():
        st = "active"
    gf_on, gf_pid, gf_name = _read_gamefilter_state(manager)
    return {
        "service": st,
        "service_active": st == "active",
        "strategy_label": _read_strategy_label(manager),
        "strategy_detail": _read_strategy_detail(manager),
        "manager_path": str(manager),
        "manager_installed": _manager_installed(),
        "zapret_service_installed": _zapret_service_installed(),
        "working_strategies": _read_working_strategy_names(manager),
        "gamefilter_enabled": gf_on,
        "game_preset_id": gf_pid,
        "game_preset_name": gf_name,
        "game_presets_available": _game_presets is not None,
        "gamefilter_protocol_mode": _read_gamefilter_protocol_mode(manager),
        **_gamefilter_ports_state(manager),
        "ipset_filter_mode": _read_ipset_filter_mode(manager),
    }


# --- Установка Zapret DPI Manager (install_zapret.tar.gz с GitHub) ---

_INSTALL_ZAPRET_TAR_URL = (
    "https://raw.githubusercontent.com/mashakulina/Zapret-DPI-for-Steam-Deck/main/install_zapret.tar.gz"
)
_MANAGER_INSTALL_WORK = pathlib.Path("/tmp/deckyzapretdpi_manager_install")
_MANAGER_INSTALL_LOG = pathlib.Path("/tmp/deckyzapretdpi_manager_install.log")
_MANAGER_INSTALL_RUNNER = pathlib.Path("/tmp/deckyzapretdpi_manager_run.sh")
_MANAGER_INSTALL_UNIT = "deckyzapretdpi-manager-install"


def _download_url_to_file_insecure(url: str, dest: pathlib.Path) -> None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "DeckyZapretDPI-Plugin/1.0"},
    )
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, timeout=120.0, context=ctx) as resp:
        dest.write_bytes(resp.read())


def _read_manager_install_log_tail(max_chars: int = 2400) -> str:
    if not _MANAGER_INSTALL_LOG.is_file():
        return ""
    try:
        raw = _MANAGER_INSTALL_LOG.read_text(encoding="utf-8", errors="replace")
        if len(raw) <= max_chars:
            return raw
        return raw[-max_chars:]
    except OSError:
        return ""


def _install_zapret_dpi_manager_thread() -> dict:
    log_path = str(_MANAGER_INSTALL_LOG)
    if _manager_installed():
        return {"status": "already_installed", "detail": None, "log_path": log_path}
    try:
        if _MANAGER_INSTALL_WORK.is_dir():
            shutil.rmtree(_MANAGER_INSTALL_WORK, ignore_errors=True)
        _MANAGER_INSTALL_WORK.mkdir(parents=True, exist_ok=True)
        bundle = _MANAGER_INSTALL_WORK / "_bundle.tar.gz"
        _download_url_to_file_insecure(_INSTALL_ZAPRET_TAR_URL, bundle)
        tr = subprocess.run(
            [
                "tar",
                "--no-same-owner",
                "-xzf",
                str(bundle),
                "-C",
                str(_MANAGER_INSTALL_WORK),
            ],
            capture_output=True,
            text=True,
            timeout=120,
            env=_clean_env(),
        )
        bundle.unlink(missing_ok=True)
        if tr.returncode != 0:
            tail = (tr.stderr or tr.stdout or "tar failed")[:500]
            return {"status": "error", "detail": tail, "log_path": log_path}
        script = _MANAGER_INSTALL_WORK / "install_zapret.sh"
        if not script.is_file():
            return {
                "status": "error",
                "detail": "install_zapret.sh missing after extract",
                "log_path": log_path,
            }
        script.chmod(0o755)
        work_q = shlex.quote(str(_MANAGER_INSTALL_WORK.resolve()))
        log_q = shlex.quote(str(_MANAGER_INSTALL_LOG.resolve()))
        mgr_q = shlex.quote(str(_MANAGER_ROOT.resolve()))
        home_deck_q = shlex.quote("/home/deck")
        _MANAGER_INSTALL_RUNNER.write_text(
            f"""#!/bin/bash
set +e
exec > >(tee -a {log_q}) 2>&1
echo "== Zapret DPI Manager install via DeckyZapretDPI $(date)"
cd {work_q}
export HOME=/home/deck
# Интерактивные запросы из Game Mode недоступны; при сбое смотрите лог или установите в Desktop.
bash ./install_zapret.sh </dev/null
echo "installer exit code: $?"
# Установщик под root оставляет файлы root:root — без этого пользователь не сможет править менеджер в Desktop.
MGR={mgr_q}
if [[ -d "$MGR" ]]; then
  U=$(stat -c '%U' {home_deck_q} 2>/dev/null || echo deck)
  G=$(stat -c '%G' {home_deck_q} 2>/dev/null || echo deck)
  echo "== chown -R $U:$G $MGR"
  chown -R "$U:$G" "$MGR" || echo "chown warning: $?"
fi
echo "== finished $(date)"
""",
            encoding="utf-8",
        )
        _MANAGER_INSTALL_RUNNER.chmod(0o755)
        try:
            _MANAGER_INSTALL_LOG.write_text("", encoding="utf-8")
        except OSError:
            pass
        r2 = subprocess.run(
            [
                "systemd-run",
                "--unit",
                _MANAGER_INSTALL_UNIT,
                "--service-type=oneshot",
                "--quiet",
                str(_MANAGER_INSTALL_RUNNER),
            ],
            capture_output=True,
            text=True,
            timeout=60,
            env=_clean_env(),
        )
        if r2.returncode != 0:
            sr = subprocess.run(
                [
                    "sudo",
                    "systemd-run",
                    "--unit",
                    f"{_MANAGER_INSTALL_UNIT}_sudo",
                    "--service-type=oneshot",
                    "--quiet",
                    str(_MANAGER_INSTALL_RUNNER),
                ],
                capture_output=True,
                text=True,
                timeout=60,
                env=_clean_env(),
            )
            if sr.returncode != 0:
                tail = (sr.stdout or sr.stderr or r2.stdout or r2.stderr or "")[:400]
                return {
                    "status": "error",
                    "detail": tail or "systemd-run failed",
                    "log_path": log_path,
                }
        return {"status": "started", "detail": None, "log_path": log_path}
    except Exception as e:
        return {"status": "error", "detail": str(e), "log_path": log_path}


# --- Установка службы Zapret (/opt/zapret + systemd), как в ZapretChecker без GUI ---
_ZAPRET_SVC_ARCHIVE_URL = (
    "https://github.com/mashakulina/Zapret-DPI-for-Steam-Deck/releases/latest/download/zapret.tar.gz"
)
_ZAPRET_SVC_INSTALL_WORK = pathlib.Path("/tmp/deckyzapretdpi_zapret_install")
_ZAPRET_SVC_INSTALL_LOG = pathlib.Path("/tmp/deckyzapretdpi_zapret_install.log")
_ZAPRET_SVC_INSTALL_RUNNER = pathlib.Path("/tmp/deckyzapretdpi_zapret_install_run.sh")
_ZAPRET_SVC_INSTALL_UNIT = "deckyzapretdpi-zapret-install"


def _read_zapret_service_install_log_tail(max_chars: int = 2400) -> str:
    if not _ZAPRET_SVC_INSTALL_LOG.is_file():
        return ""
    try:
        raw = _ZAPRET_SVC_INSTALL_LOG.read_text(encoding="utf-8", errors="replace")
        if len(raw) <= max_chars:
            return raw
        return raw[-max_chars:]
    except OSError:
        return ""


def _build_service_install_script(manager, work, log, opt=None, units=None):
    """Use the installed manager bundle; preserve the selected firewall backend."""
    system = pathlib.Path(manager) / 'zapret/system'
    for name in ('starter.sh', 'stopper.sh', 'firewall.sh', 'zapret.service', 'FWTYPE'):
        if not (system / name).is_file():
            raise ValueError('Обновите менеджер: отсутствует runtime-файл ' + name)
    quote = lambda path: shlex.quote(str(path))
    return f"""#!/bin/bash
set -e
exec > >(tee -a {quote(log)}) 2>&1
SYSTEM_DIR={quote(system)}
BINS_DIR={quote(pathlib.Path(manager) / 'zapret/bins')}
OPT={quote(opt or _ZAPRET_OPT)}
UNITS={quote(units or _ZAPRET_SYSTEMD_UNIT.parent)}
WORK={quote(work)}
mkdir -p "$WORK"
# Validate and retain both explicit firewall selection files before copying.
for name in FWTYPE FWTYPE.user; do
  rm -f "$WORK/$name.saved"
  if [[ -e "$OPT/$name" || -L "$OPT/$name" ]]; then
    value=$(cat "$OPT/$name")
    case "$value" in iptables|nftables) ;; *) echo "Invalid $name"; exit 1 ;; esac
    cp -p "$OPT/$name" "$WORK/$name.saved"
  fi
done
if [[ -f "$WORK/FWTYPE.user.saved" ]]; then
  [[ -f "$WORK/FWTYPE.saved" ]] && cmp -s "$WORK/FWTYPE.saved" "$WORK/FWTYPE.user.saved" || exit 1
fi
case "$(cat "$SYSTEM_DIR/FWTYPE")" in iptables|nftables) ;; *) exit 1 ;; esac
case "$(uname -m)" in
 x86_64) BARCH=x86_64 ;; aarch64) BARCH=arm64 ;;
 armv7l|armv6l) BARCH=arm ;; i386|i686) BARCH=x86 ;;
 *) echo "Unsupported architecture"; exit 1 ;;
esac
[[ -f "$BINS_DIR/$BARCH/nfqws" ]] || {{ echo "Update manager: nfqws missing"; exit 1; }}
if command -v steamos-readonly >/dev/null 2>&1; then
 steamos-readonly disable
 trap 'steamos-readonly enable || true' EXIT
fi
mkdir -p "$OPT" "$UNITS"
# Never overwrite backend selection, even if a later installation step fails.
for path in "$SYSTEM_DIR"/*; do
 name=$(basename "$path")
 [[ "$name" == FWTYPE || "$name" == FWTYPE.user ]] && continue
 cp -a "$path" "$OPT/"
done
if [[ ! -f "$OPT/FWTYPE" ]]; then cp "$SYSTEM_DIR/FWTYPE" "$OPT/FWTYPE"; fi
cp "$BINS_DIR/$BARCH/nfqws" "$OPT/nfqws"
chmod +x "$OPT/nfqws" "$OPT/starter.sh" "$OPT/stopper.sh"
cp "$SYSTEM_DIR/zapret.service" "$UNITS/zapret.service"
chmod 644 "$UNITS/zapret.service"
systemctl daemon-reload
systemctl enable zapret.service
systemctl start zapret.service
"""


def _install_zapret_service_thread() -> dict:
    """Фоновая установка zapret через systemd-run (root), по шагам как core/zapret_checker.install_zapret."""
    log_path = str(_ZAPRET_SVC_INSTALL_LOG)
    if _zapret_service_installed():
        return {"status": "already_installed", "detail": None, "log_path": log_path}
    if not _manager_installed():
        return {
            "status": "error",
            "detail": "Сначала установите Zapret DPI Manager",
            "log_path": log_path,
        }
    try:
        if _ZAPRET_SVC_INSTALL_WORK.is_dir():
            shutil.rmtree(_ZAPRET_SVC_INSTALL_WORK, ignore_errors=True)
        _ZAPRET_SVC_INSTALL_WORK.mkdir(parents=True, exist_ok=True)
        bundle = _bridge.prepare_service_bundle(_MANAGER_ROOT, _ZAPRET_SVC_INSTALL_WORK)
        script = _build_service_install_script(bundle, _ZAPRET_SVC_INSTALL_WORK, _ZAPRET_SVC_INSTALL_LOG)
        _ZAPRET_SVC_INSTALL_RUNNER.write_text(script, encoding="utf-8")
        _ZAPRET_SVC_INSTALL_RUNNER.chmod(0o755)
        try:
            _ZAPRET_SVC_INSTALL_LOG.write_text("", encoding="utf-8")
        except OSError:
            pass
        r2 = subprocess.run(
            [
                "systemd-run",
                "--unit",
                _ZAPRET_SVC_INSTALL_UNIT,
                "--service-type=oneshot",
                "--quiet",
                str(_ZAPRET_SVC_INSTALL_RUNNER),
            ],
            capture_output=True,
            text=True,
            timeout=60,
            env=_clean_env(),
        )
        if r2.returncode != 0:
            sr = subprocess.run(
                [
                    "sudo",
                    "systemd-run",
                    "--unit",
                    f"{_ZAPRET_SVC_INSTALL_UNIT}_sudo",
                    "--service-type=oneshot",
                    "--quiet",
                    str(_ZAPRET_SVC_INSTALL_RUNNER),
                ],
                capture_output=True,
                text=True,
                timeout=60,
                env=_clean_env(),
            )
            if sr.returncode != 0:
                tail = (sr.stdout or sr.stderr or r2.stdout or r2.stderr or "")[:400]
                return {
                    "status": "error",
                    "detail": tail or "systemd-run failed",
                    "log_path": log_path,
                }
        return {"status": "started", "detail": None, "log_path": log_path}
    except Exception as e:
        return {"status": "error", "detail": str(e), "log_path": log_path}


def _get_manager_install_state_thread() -> dict:
    ok = _manager_installed()
    if ok and _game_presets is None:
        _load_game_presets()
    return {"manager_installed": ok, "zapret_service_installed": _zapret_service_installed()}


# Release updates run outside Decky's process so loader restart cannot kill them.
_updater_spec = importlib.util.spec_from_file_location("decky_plugin_updater", pathlib.Path(__file__).with_name("plugin_updater.py"))
_updater = importlib.util.module_from_spec(_updater_spec)
_updater_spec.loader.exec_module(_updater)
_UPD_UNIT = "deckyzapretdpi-update"


def _check_plugin_updates_thread() -> dict:
    try:
        current = _updater.installed(_plugin_json_path().parent)
        release = _updater.release()
        latest = str(release['tag_name']).removeprefix('v')
        newer = _updater.version(latest) > _updater.version(current)
        return dict(status='update_available' if newer else 'up_to_date', latest=latest,
                    current=current, changelog=str(release.get('body') or '')[:16000])
    except Exception as error:
        error_id = _bridge.diagnostics.record_exception('check_plugin_updates', error)
        return dict(status='error', detail=f'{error} (ID: {error_id})')


def _status_age(result) -> float:
    try:
        import math
        age = time.time() - float(result.get('updated_at', 0))
        return age if math.isfinite(age) else float('inf')
    except (TypeError, ValueError, OverflowError):
        return float('inf')


def _update_status() -> dict:
    result = _updater.read_status(_updater.STATE)
    if result.get('status') == 'updating' and _status_age(result) > 120:
        import fcntl
        with open(_updater.LOCK, 'a') as guard:
            try:
                fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                pass
            else:
                # The queue may have changed after the optimistic read above.
                result = _updater.read_status(_updater.STATE)
                if result.get('status') == 'updating' and _status_age(result) > 120:
                    result.update(status='error', detail='Update worker stopped before reporting completion. Open Diagnostics.')
                    _updater.write_status(_updater.STATE, **result)
    result['current_version'] = _read_local_version_fallback().get('current_version', '')
    return result


def _update_plugin_thread() -> str:
    import fcntl
    with open(_updater.LOCK, 'a') as guard:
        try:
            fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 'updating'
        previous = _updater.read_status(_updater.STATE)
        if previous.get('status') == 'updating' and _status_age(previous) < 120:
            return 'updating'
        _updater.write_status(_updater.STATE, status='updating', detail='Queued', current_version=_updater.installed(_plugin_json_path().parent))

    # Queued state suppresses duplicate requests; worker must acquire the lock itself.
    try:
        # Unique unit and explicit argv avoid stale units and shell path expansion.
        unit = _UPD_UNIT + '-' + str(time.time_ns())
        python = '/usr/bin/python3' if pathlib.Path('/usr/bin/python3').is_file() else shutil.which('python3')
        if not python:
            raise RuntimeError('Python 3 interpreter is unavailable')
        log_dir = os.environ.get('DECKY_PLUGIN_LOG_DIR', '/tmp/deckyzapretdpi')
        command = ['systemd-run', '--unit', unit, '--service-type=oneshot', '--no-block', '--collect', '--quiet',
                   '--setenv=DECKY_PLUGIN_LOG_DIR=' + log_dir, python, str(pathlib.Path(__file__).with_name('plugin_updater.py')),
                   '--root', str(_plugin_json_path().parent)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=60, env=_clean_env())
        if result.returncode:
            raise RuntimeError((result.stderr or result.stdout or 'systemd-run failed')[-1000:])
        return 'update_started'
    except Exception as error:
        error_id = _bridge.diagnostics.record_exception('update_plugin', error)
        detail = f'{error} (ID: {error_id})'
        _updater.write_status(_updater.STATE, status='error', detail=detail)
        return 'update_failed: ' + detail


class Plugin:
    async def _main(self):
        _bridge.diagnostics.record_event("plugin_start", "loaded", version=_read_local_version_fallback().get("current_version", ""))

    async def _unload(self):
        pass

    async def get_zapret_state(self) -> dict:
        return await asyncio.to_thread(_collect_state)

    async def toggle_zapret(self) -> dict:
        def _perform_toggle():
            if not _zapret_service_installed():
                out = _collect_state()
                out["toggle_ok"] = False
                out["toggle_message"] = "zapret_service_missing"
                return out
            st = _service_state()
            action = "stop" if st == "active" else "start"
            result = _run_systemctl(action, "zapret")
            if result.returncode:
                raise RuntimeError((result.stdout or "systemctl failed")[-1000:])
            return _collect_state()

        def _toggle():
            try:
                with _bridge.manager_settings_lock(_MANAGER_ROOT):
                    return _perform_toggle()
            except Exception as error:
                out = _collect_state()
                out['toggle_ok'] = False
                out['toggle_message'] = str(error) + ' (ID: ' + _bridge.diagnostics.record_exception('toggle_zapret', error) + ')'
                return out

        return await asyncio.to_thread(_toggle)

    async def apply_working_strategy(self, strategy_name: str) -> dict:
        if not isinstance(strategy_name, str):
            strategy_name = ""

        def _apply():
            ok, msg = _apply_strategy_from_file(_manager_dir(), strategy_name)
            state = _collect_state()
            state["apply_ok"] = ok
            state["apply_message"] = msg
            return state

        return await asyncio.to_thread(_apply)

    async def list_strategy_files(self) -> dict:
        if _autopicker is None:
            return {"strategies": []}
        return await asyncio.to_thread(lambda: {"strategies": _autopicker.list_strategy_names()})

    async def get_autopicker_status(self) -> dict:
        if _autopicker is None:
            hint = (
                _autopicker_load_error
                or "Не удалось загрузить decky_autopicker.py рядом с main.py."
            )
            return {
                "running": False,
                "phase": "error",
                "message": "",
                "error": "decky_autopicker_unavailable",
                "started_at": 0.0,
                "finished_at": 0.0,
                "mode": "",
                "working_count": 0,
                "log_text": hint,
            }
        return await asyncio.to_thread(_autopicker.get_status)

    async def start_autopicker(self, strategies: Optional[Any] = None, **_kw: Any) -> dict:
        if _autopicker is None:
            return {
                "ok": False,
                "detail": _autopicker_load_error or "decky_autopicker_unavailable",
            }
        strat: Optional[list[str]] = None
        if isinstance(strategies, list):
            strat = [s for s in strategies if isinstance(s, str)]
            if len(strat) == 0:
                strat = None

        return await asyncio.to_thread(_autopicker.start, strat)

    async def stop_autopicker(self) -> dict:
        if _autopicker is None:
            return {
                "ok": False,
                "detail": _autopicker_load_error or "decky_autopicker_unavailable",
            }
        return await asyncio.to_thread(_autopicker.stop)

    async def list_game_presets(self) -> dict:
        return await asyncio.to_thread(lambda: {"presets": _list_game_presets_dicts()})

    async def set_game_preset(self, preset_id: Optional[Any] = None, **_kw: Any) -> dict:
        def _resolved_id() -> Optional[str]:
            raw: Any = preset_id
            if raw is None and _kw:
                raw = _kw.get("preset_id")
            if raw is None:
                return None
            s = str(raw).strip()
            if not s or s.lower() in ("none", "null", ""):
                return None
            return s

        def _do() -> dict:
            pid = _resolved_id()
            ok, msg = _set_game_preset_impl(_manager_dir(), pid)
            state = _collect_state()
            state["gamefilter_ok"] = ok
            state["gamefilter_message"] = msg
            return state

        return await asyncio.to_thread(_do)

    async def toggle_gamefilter(
        self, protocol_mode: Optional[Any] = None, **_kw: Any
    ) -> dict:
        def _resolved_protocol_mode() -> Optional[str]:
            raw: Any = protocol_mode
            if raw is None and _kw:
                raw = _kw.get("protocol_mode")
            if raw is None:
                return None
            return str(raw).strip()

        def _do() -> dict:
            manager = _manager_dir()
            path = _gamefilter_enable_path(manager)
            was_enabled = path.is_file()
            ok, msg = _toggle_gamefilter_impl(manager, _resolved_protocol_mode())
            state = _collect_state()
            if not ok:
                state["gamefilter_ok"] = False
                state["gamefilter_message"] = msg
            elif was_enabled:
                # выключение: без зелёного «успеха» в UI
                pass
            else:
                state["gamefilter_ok"] = True
                state["gamefilter_message"] = msg
            return state

        return await asyncio.to_thread(_do)

    async def set_gamefilter_ports(self, mode: Any = None, ports: Any = None,
                                   reset: bool = False, expected_mode: Any = None,
                                   expected_settings: Any = None, **_kw: Any) -> dict:
        def _do():
            ok, message = _set_gamefilter_ports_impl(_manager_dir(), mode, ports, reset is True, expected_mode, expected_settings)
            state = _collect_state()
            state.update(gamefilter_ok=ok, gamefilter_message=message)
            return state
        return await asyncio.to_thread(_do)

    async def set_gamefilter_protocol_mode(
        self, mode: Optional[Any] = None, **_kw: Any
    ) -> dict:
        def _resolved_mode() -> str:
            raw: Any = mode
            if raw is None and _kw:
                raw = _kw.get("mode")
            return str(raw or "").strip()

        def _do() -> dict:
            ok, msg = _set_gamefilter_protocol_mode_impl(_manager_dir(), _resolved_mode())
            state = _collect_state()
            state["gamefilter_ok"] = ok
            state["gamefilter_message"] = msg
            return state

        return await asyncio.to_thread(_do)

    async def set_ipset_filter_mode(self, mode: Optional[Any] = None, **_kw: Any) -> dict:
        def _do() -> dict:
            m = mode if isinstance(mode, str) else ""
            ok, msg = _set_ipset_filter_mode_impl(_manager_dir(), m)
            state = _collect_state()
            state["ipset_ok"] = ok
            state["ipset_message"] = msg
            return state

        return await asyncio.to_thread(_do)

    async def get_diagnostics(self) -> dict:
        return await asyncio.to_thread(_bridge.diagnostics.snapshot, _MANAGER_ROOT, _plugin_json_path().parent)

    async def get_plugin_update_status(self) -> dict:
        return await asyncio.to_thread(_update_status)

    async def get_plugin_version(self) -> dict:
        return await asyncio.to_thread(_get_plugin_version_info_thread)

    async def check_plugin_updates(self) -> dict:
        return await asyncio.to_thread(_check_plugin_updates_thread)

    async def update_plugin(self) -> dict:
        msg = await asyncio.to_thread(_update_plugin_thread)
        return {"status": msg}

    async def get_manager_install_state(self) -> dict:
        return await asyncio.to_thread(_get_manager_install_state_thread)

    async def install_zapret_dpi_manager(self) -> dict:
        return await asyncio.to_thread(_install_zapret_dpi_manager_thread)

    async def install_zapret_service(self) -> dict:
        return await asyncio.to_thread(_install_zapret_service_thread)

    async def get_manager_install_log_tail(self) -> dict:
        return await asyncio.to_thread(lambda: {"tail": _read_manager_install_log_tail()})

    async def get_zapret_service_install_log_tail(self) -> dict:
        return await asyncio.to_thread(lambda: {"tail": _read_zapret_service_install_log_tail()})


# Preserve existing RPC return shapes while recording otherwise uncaught failures.
def _diagnosed_rpc(name, method):
    async def call(self, *args, **kwargs):
        try:
            return await method(self, *args, **kwargs)
        except Exception as error:
            _bridge.diagnostics.record_exception(name, error)
            raise
    call.__name__ = method.__name__
    return call

for _rpc_name, _rpc_method in list(vars(Plugin).items()):
    if not _rpc_name.startswith('_') and asyncio.iscoroutinefunction(_rpc_method):
        setattr(Plugin, _rpc_name, _diagnosed_rpc(_rpc_name, _rpc_method))

plugin = Plugin()
