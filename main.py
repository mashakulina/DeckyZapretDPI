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

def _plugin_json_path() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parent / "plugin.json"


def _read_local_version_fallback() -> dict:
    try:
        data = json.loads(_plugin_json_path().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
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
        sys.modules.pop(_DECKY_GAME_PRESETS_MOD, None)
        _ensure_manager_syspath_for_presets()
        spec = importlib.util.spec_from_file_location(_DECKY_GAME_PRESETS_MOD, mod_path)
        if spec is None or spec.loader is None:
            _game_presets_load_error = "Не удалось создать spec для game_presets"
            return
        mod = importlib.util.module_from_spec(spec)
        sys.modules[_DECKY_GAME_PRESETS_MOD] = mod
        spec.loader.exec_module(mod)
        _game_presets = mod
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
    """Same logic as Zapret DPI Manager strategy_window.apply_strategy (file preset)."""
    if not _safe_strategy_basename(strategy_name):
        return False, "invalid_name"
    allowed = set(_read_working_strategy_names(manager))
    if strategy_name not in allowed:
        return False, "not_in_working_list"
    strategy_file = manager / "files" / "strategy" / strategy_name
    if not strategy_file.is_file():
        return False, "file_not_found"
    try:
        strategy_content = strategy_file.read_text(encoding="utf-8").strip()
    except OSError as e:
        return False, str(e)
    name_strategy_file = manager / "utils" / "name_strategy.txt"
    config_file = manager / "config.txt"
    try:
        name_strategy_file.parent.mkdir(parents=True, exist_ok=True)
        if not strategy_content:
            name_strategy_file.write_text("", encoding="utf-8")
            config_file.write_text("", encoding="utf-8")
        else:
            name_strategy_file.write_text(strategy_name, encoding="utf-8")
            config_file.write_text(strategy_content, encoding="utf-8")
            # Как в менеджере (strategy_window): после перезаписи config.txt снова применить игровой пресет.
            _maybe_reload_game_presets()
            if _game_presets is not None:
                _game_presets.reapply_active_preset_to_config(str(manager))
    except OSError as e:
        return False, str(e)
    return _restart_zapret_service()


def _restart_zapret_service() -> tuple[bool, str]:
    r = _run_systemctl("restart", "zapret")
    if r.returncode != 0:
        tail = (r.stdout or "").strip()[:200] or "systemctl failed"
        return False, tail
    return True, "ok"


def _gamefilter_enable_path(manager: pathlib.Path) -> pathlib.Path:
    return manager / "utils" / "gamefilter.enable"


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
            if pid and pid in _game_presets.GAME_PRESETS:
                preset_name = _game_presets.GAME_PRESETS[pid]["name"]
        except Exception:
            pass
    return enabled, preset_id, preset_name


def _list_game_presets_dicts() -> list[dict[str, str]]:
    _maybe_reload_game_presets()
    if _game_presets is None:
        return []
    out: list[dict[str, str]] = []
    try:
        for pid, data in _game_presets.GAME_PRESETS.items():
            out.append({"id": pid, "name": str(data.get("name", pid))})
    except Exception:
        return []
    return out


def _gp_is_list_ipset_preset(preset_id: str) -> bool:
    """Старые game_presets.py без LIST_IPSET не ломают плагин."""
    if _game_presets is None:
        return False
    fn = getattr(_game_presets, "is_list_ipset_preset", None)
    if not callable(fn):
        return False
    try:
        return bool(fn(preset_id))
    except Exception:
        return False


def _gp_clear_list_ipset_if_needed(preset_id: str, mdir: str) -> None:
    if not _gp_is_list_ipset_preset(preset_id):
        return
    fn = getattr(_game_presets, "clear_list_ipset_for_preset", None) if _game_presets else None
    if callable(fn):
        fn(preset_id, mdir)


def _gp_apply_list_ipset_if_needed(preset_id: str, mdir: str) -> None:
    if not _gp_is_list_ipset_preset(preset_id):
        return
    fn = getattr(_game_presets, "apply_list_ipset_for_preset", None) if _game_presets else None
    if callable(fn):
        fn(preset_id, mdir)


def _set_game_preset_impl(manager: pathlib.Path, preset_id: Optional[str]) -> tuple[bool, str]:
    """preset_id None / empty / 'none' clears preset; otherwise apply known preset."""
    _maybe_reload_game_presets()
    if _game_presets is None:
        return False, "game_presets_unavailable"
    mdir = str(manager)
    clear = not preset_id or str(preset_id).strip().lower() in ("", "none", "null")
    if not clear:
        pid = str(preset_id).strip()
        if pid not in _game_presets.GAME_PRESETS:
            return False, "invalid_preset"

    try:
        if clear:
            active_before = _game_presets.get_active_preset_id(mdir)
            if active_before:
                _game_presets.remove_preset_lines_from_config(active_before, mdir)
                _gp_clear_list_ipset_if_needed(active_before, mdir)
                _game_presets.restore_gamefilter_for_preset(active_before, mdir)
            _game_presets.clear_active_preset(mdir)
            return _restart_zapret_service()

        pid = str(preset_id).strip()
        active_before = _game_presets.get_active_preset_id(mdir)
        if active_before:
            _game_presets.remove_preset_lines_from_config(active_before, mdir)
            _gp_clear_list_ipset_if_needed(active_before, mdir)
            _game_presets.restore_gamefilter_for_preset(active_before, mdir)

        _game_presets.set_active_preset(pid, mdir)
        preset = _game_presets.GAME_PRESETS[pid]
        tcp = preset.get("game_filter_tcp")
        udp = preset.get("game_filter_udp")
        if tcp is not None and udp is not None:
            _game_presets.substitute_gamefilter_in_config(tcp, udp, mdir)
        _gp_apply_list_ipset_if_needed(pid, mdir)
        lines = preset.get("lines") or []
        if lines:
            config_path = manager / "config.txt"
            existing = ""
            if config_path.is_file():
                existing = config_path.read_text(encoding="utf-8")
            config_path.parent.mkdir(parents=True, exist_ok=True)
            config_path.write_text("\n".join(lines) + "\n" + existing, encoding="utf-8")
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"

    return _restart_zapret_service()


def _toggle_gamefilter_impl(manager: pathlib.Path) -> tuple[bool, str]:
    path = _gamefilter_enable_path(manager)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.is_file():
            path.unlink()
        else:
            path.write_text("", encoding="utf-8")
    except OSError as e:
        return False, str(e)
    return _restart_zapret_service()


_IPSET_NONE_MARKER = "203.0.113.113/32"


def _ipset_all_list_path(manager: pathlib.Path) -> pathlib.Path:
    return manager / "files" / "lists" / "ipset-all.txt"


def _ipset_all_utils_path(manager: pathlib.Path) -> pathlib.Path:
    return manager / "utils" / "ipset-all.txt"


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


def _set_ipset_filter_mode_impl(manager: pathlib.Path, mode: str) -> tuple[bool, str]:
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
    return _restart_zapret_service()


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
        work_q = shlex.quote(str(_ZAPRET_SVC_INSTALL_WORK.resolve()))
        log_q = shlex.quote(str(_ZAPRET_SVC_INSTALL_LOG.resolve()))
        url_q = shlex.quote(_ZAPRET_SVC_ARCHIVE_URL)
        unit_body = r"""[Unit]
Description=zapret
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/zapret
ExecStart=/bin/bash /opt/zapret/starter.sh
ExecStop=/bin/bash /opt/zapret/stopper.sh

[Install]
WantedBy=multi-user.target
"""
        # Скрипт выполняется под root (systemd-run / sudo systemd-run)
        script = (
            f"""#!/bin/bash
set +e
exec > >(tee -a {log_q}) 2>&1
echo "== DeckyZapret: install zapret service $(date)"
if command -v steamos-readonly >/dev/null 2>&1; then
  steamos-readonly disable || true
fi
rm -rf {work_q}
mkdir -p {work_q}
cd {work_q} || exit 1
curl -fSL -o zapret.tar.gz {url_q} || exit 1
tar -xzf zapret.tar.gz || exit 1
SYSTEM_DIR=$(find . -type d -name system | head -n 1)
BINS_DIR=$(find . -type d -name bins | head -n 1)
if [[ -z "$SYSTEM_DIR" || ! -d "$SYSTEM_DIR" ]]; then
  echo "ERROR: system dir not found in archive"
  exit 1
fi
mkdir -p /opt/zapret
cp -a "$SYSTEM_DIR"/. /opt/zapret/ || exit 1
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) BARCH=x86_64 ;;
  aarch64) BARCH=arm64 ;;
  armv7l|armv6l) BARCH=arm ;;
  i386|i686) BARCH=x86 ;;
  *) BARCH=x86_64 ;;
esac
if [[ -n "$BINS_DIR" && -d "$BINS_DIR/$BARCH" ]]; then
  NFQWS="$BINS_DIR/$BARCH/nfqws"
  if [[ -f "$NFQWS" ]]; then
    cp -f "$NFQWS" /opt/zapret/nfqws
    chmod +x /opt/zapret/nfqws
  fi
fi
echo iptables > /opt/zapret/FWTYPE
chmod -R o+r /opt/zapret/ 2>/dev/null || true
cat > /tmp/zapret.service.deckyzapretdpi <<'EOFUNIT'
"""
            + f"{unit_body.rstrip()}\n"
            + """EOFUNIT
mkdir -p /etc/systemd/system
cp /tmp/zapret.service.deckyzapretdpi /etc/systemd/system/zapret.service
chmod 644 /etc/systemd/system/zapret.service
rm -f /usr/lib/systemd/system/zapret.service 2>/dev/null || true
systemctl daemon-reload || exit 1
systemctl enable zapret.service 2>/dev/null || true
systemctl start zapret.service 2>/dev/null || true
if command -v steamos-readonly >/dev/null 2>&1; then
  steamos-readonly enable || true
fi
echo "== finished $(date)"
"""
        )
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


# --- Plugin self-update (DeckyWARP-style: GitHub releases/latest, systemd-run + bash) ---

_GITHUB_API_LATEST = (
    "https://api.github.com/repos/mashakulina/DeckyZapretDPI/releases/latest"
)
_UPD_FLAG = pathlib.Path("/tmp/.deckyzapretdpi_updating")
_UPD_LOG = pathlib.Path("/tmp/deckyzapretdpi_update.log")
_UPD_UNIT = "deckyzapretdpi-update"
_CHK_FLAG = pathlib.Path("/tmp/.deckyzapretdpi_checking")
_CHK_LOG = pathlib.Path("/tmp/deckyzapretdpi_check.log")
_CHK_UNIT = "deckyzapretdpi-check"


def _decky_subprocess_unit_state(unit_base: str) -> str:
    try:
        r = subprocess.run(
            ["systemctl", "show", unit_base, "-p", "ActiveState"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=15,
            env=_clean_env(),
        )
        for line in (r.stdout or "").splitlines():
            if line.startswith("ActiveState="):
                return line.split("=", 1)[1].strip()
    except (subprocess.TimeoutExpired, OSError):
        pass
    return "inactive"


def _decky_cleanup_flag(flag: pathlib.Path, unit_base: str) -> None:
    if flag.exists() and _decky_subprocess_unit_state(unit_base) in ("inactive", "failed"):
        flag.unlink(missing_ok=True)


def _decky_flag_busy(flag: pathlib.Path) -> bool:
    return flag.exists()


def _write_deckyzapretdpi_check_script() -> str:
    pj = shlex.quote(str(_plugin_json_path()))
    path = pathlib.Path("/tmp/deckyzapretdpi_check.sh")
    path.write_text(
        f"""#!/bin/bash
set -e
exec > >(tee -a /tmp/deckyzapretdpi_check.log) 2>&1
echo "== START CHECK: $(date)"
RESP_JSON="/tmp/deckyzapretdpi_github_release.json"
PLUGIN_JSON_PATH={pj}
curl -fsSL -H 'Accept: application/vnd.github+json' "{_GITHUB_API_LATEST}" -o "$RESP_JSON" \\
  || {{ echo "ERROR: curl failed"; exit 1; }}
LATEST=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1],encoding="utf-8")); print(str(d.get("tag_name","") or "").lstrip("v"))' "$RESP_JSON")
CURRENT=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1],encoding="utf-8")); print(str(d.get("version","")).strip())' "$PLUGIN_JSON_PATH")
if [ "$LATEST" != "$CURRENT" ]; then
  echo "update_available $LATEST $CURRENT"
else
  echo "up_to_date $CURRENT"
fi
""",
        encoding="utf-8",
    )
    path.chmod(0o755)
    return str(path)


def _write_deckyzapretdpi_update_script() -> str:
    plugin_dir = shlex.quote(str(_plugin_json_path().parent))
    path = pathlib.Path("/tmp/deckyzapretdpi_update.sh")
    path.write_text(
        f"""#!/bin/bash
set -e
exec > >(tee -a /tmp/deckyzapretdpi_update.log) 2>&1
echo "== START UPDATE: $(date)"
PLUGIN_DIR={plugin_dir}
TMP_DIR="/tmp/deckyzapretdpi_update"
ZIP_URL="{_GITHUB_API_LATEST}"
mkdir -p "$TMP_DIR"
cd "$TMP_DIR"
echo "== FETCHING ASSET URL =="
ASSET_URL=$(curl -fsSL "$ZIP_URL" | grep '"zipball_url":' | head -1 | cut -d '"' -f 4)
[ -z "$ASSET_URL" ] && echo "ERROR: no asset url" && exit 1
echo "== DOWNLOADING ZIP =="
curl -fsSL -o latest.zip "$ASSET_URL"
[ ! -f latest.zip ] && echo "ERROR: download failed" && exit 1
echo "== UNZIPPING =="
unzip -qo latest.zip || {{ echo "ERROR: unzip failed"; exit 1; }}
INNER_DIR=$(find . -maxdepth 1 -type d -name "*DeckyZapretDPI*" | head -n 1)
if [ ! -d "$INNER_DIR" ]; then
  INNER_DIR=$(find . -maxdepth 1 -mindepth 1 -type d | head -n 1)
fi
[ ! -d "$INNER_DIR" ] && echo "ERROR: inner dir not found" && exit 1
echo "== COPYING PLUGIN =="
BACKUP="${{PLUGIN_DIR}}_backup_$(date +%s)"
cp -r "$PLUGIN_DIR" "$BACKUP" || true
rm -rf "$PLUGIN_DIR"
cp -r "$INNER_DIR" "$PLUGIN_DIR"
echo "== CLEANING BACKUP =="
rm -rf "$BACKUP"
rm -rf "$TMP_DIR"
echo "== RESTARTING DECKY =="
systemctl restart plugin_loader.service
echo "== DONE: $(date)"
""",
        encoding="utf-8",
    )
    path.chmod(0o755)
    return str(path)


def _fetch_github_release_changelog() -> str:
    """Парсинг body релиза как в DeckyWARP (_fetch_changelog)."""
    req = urllib.request.Request(
        _GITHUB_API_LATEST,
        headers={
            "User-Agent": "DeckyZapretDPI-Plugin/1.0",
            "Accept": "application/vnd.github+json",
        },
    )
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        with urllib.request.urlopen(req, timeout=20.0, context=ctx) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        body = data.get("body", "") or ""
        lines = body.splitlines()
        ru_lines: list[str] = []
        mode = 0
        for line in lines:
            if line.strip().startswith("## **Changelog**"):
                mode = 1
                continue
            if line.strip().startswith("## **Список изменений**"):
                mode = 2
                continue
            if line.strip().startswith("#"):
                mode = 0
                continue
            if mode == 2:
                ru_lines.append(line)
        if ru_lines:
            text = "\n".join(ru_lines).strip()
            if text:
                return "Список изменений\n\n" + text
        return ""
    except Exception as e:
        return f"[changelog error] {e}"


def _check_plugin_updates_thread() -> dict:
    _decky_cleanup_flag(_CHK_FLAG, _CHK_UNIT)
    if _decky_flag_busy(_CHK_FLAG):
        return {"status": "checking"}
    _CHK_FLAG.touch()
    try:
        script = _write_deckyzapretdpi_check_script()
        r = subprocess.run(
            [
                "systemd-run",
                "--unit",
                _CHK_UNIT,
                "--service-type=oneshot",
                "--quiet",
                script,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=120,
            env=_clean_env(),
        )
        if r.returncode != 0:
            _CHK_FLAG.unlink(missing_ok=True)
            tail = (r.stdout or "")[-400:]
            return {
                "status": "error",
                "detail": tail or f"systemd-run exit {r.returncode}",
            }
        time.sleep(1.5)
        if not _CHK_LOG.is_file():
            _CHK_FLAG.unlink(missing_ok=True)
            return {"status": "error", "detail": "log not found"}
        try:
            log_lines = _CHK_LOG.read_text(encoding="utf-8").splitlines()
        except OSError as e:
            _CHK_FLAG.unlink(missing_ok=True)
            return {"status": "error", "detail": str(e)}
        for line in reversed(log_lines):
            if line.startswith("update_available"):
                parts = line.strip().split()
                if len(parts) == 3:
                    return {
                        "status": "update_available",
                        "latest": parts[1],
                        "current": parts[2],
                        "changelog": _fetch_github_release_changelog(),
                    }
            if line.startswith("up_to_date"):
                parts = line.strip().split()
                if len(parts) == 2:
                    return {"status": "up_to_date", "current": parts[1]}
        _CHK_FLAG.unlink(missing_ok=True)
        return {"status": "error", "detail": "no update info in log"}
    except Exception as e:
        _CHK_FLAG.unlink(missing_ok=True)
        return {"status": "error", "detail": str(e)}


def _update_plugin_thread() -> str:
    _decky_cleanup_flag(_UPD_FLAG, _UPD_UNIT)
    if _decky_flag_busy(_UPD_FLAG):
        return "updating"
    _UPD_FLAG.touch()
    script = _write_deckyzapretdpi_update_script()
    try:
        r = subprocess.run(
            [
                "systemd-run",
                "--unit",
                _UPD_UNIT,
                "--service-type=oneshot",
                "--quiet",
                script,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=60,
            env=_clean_env(),
        )
        if r.returncode != 0:
            sudo_r = subprocess.run(
                [
                    "sudo",
                    "systemd-run",
                    "--unit",
                    f"{_UPD_UNIT}_sudo",
                    "--service-type=oneshot",
                    "--quiet",
                    script,
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=60,
                env=_clean_env(),
            )
            if sudo_r.returncode == 0:
                return "update_started_with_sudo"
            _UPD_FLAG.unlink(missing_ok=True)
            return f"update_failed: {(sudo_r.stdout or '')[:200]}"
        return "update_started"
    except Exception as e:
        _UPD_FLAG.unlink(missing_ok=True)
        return f"update_failed: {e}"


class Plugin:
    async def _main(self):
        pass

    async def _unload(self):
        pass

    async def get_zapret_state(self) -> dict:
        return await asyncio.to_thread(_collect_state)

    async def toggle_zapret(self) -> dict:
        def _toggle():
            if not _zapret_service_installed():
                out = _collect_state()
                out["toggle_ok"] = False
                out["toggle_message"] = "zapret_service_missing"
                return out
            st = _service_state()
            if st == "active":
                _run_systemctl("stop", "zapret")
            else:
                _run_systemctl("start", "zapret")
            return _collect_state()

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

    async def toggle_gamefilter(self) -> dict:
        def _do() -> dict:
            manager = _manager_dir()
            path = _gamefilter_enable_path(manager)
            was_enabled = path.is_file()
            ok, msg = _toggle_gamefilter_impl(manager)
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

    async def set_ipset_filter_mode(self, mode: Optional[Any] = None, **_kw: Any) -> dict:
        def _do() -> dict:
            m = mode if isinstance(mode, str) else ""
            ok, msg = _set_ipset_filter_mode_impl(_manager_dir(), m)
            state = _collect_state()
            state["ipset_ok"] = ok
            state["ipset_message"] = msg
            return state

        return await asyncio.to_thread(_do)

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


plugin = Plugin()
