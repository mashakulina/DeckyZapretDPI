"""
In-plugin strategy autopicker: reuses Zapret DPI Manager StrategyTester with root-friendly commands.
"""
from __future__ import annotations

import asyncio
import collections
import importlib.util
import json
import os
import re
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

_MAX_LOG_CHARS = 96_000
_LOG_LINES: collections.deque[str] = collections.deque(maxlen=5000)
_log_lock = threading.Lock()

_MANAGER = Path("/home/deck/Zapret_DPI_Manager")
_CORE = _MANAGER / "core"


def _ensure_manager_on_syspath() -> None:
    for _p in (_CORE, _MANAGER):
        if not _p.is_dir():
            continue
        s = str(_p)
        if s not in sys.path:
            sys.path.insert(0, s)


_ensure_manager_on_syspath()


def _clean_env() -> dict[str, str]:
    """Окружение для curl/ping без LD_* от Decky Loader / Steam (вариант B, см. strategy_tester)."""
    env = os.environ.copy()
    env.pop("LD_LIBRARY_PATH", None)
    env.pop("LD_PRELOAD", None)
    return env


_StrategyTester = None
DeckyStrategyTester: Optional[type] = None
_import_err: Optional[str] = None
_import_lock = threading.Lock()


def _make_decky_subclass(Base: type) -> type:
    class _DeckyStrategyTester(Base):
        """systemctl/pkill без sudo — бэкенд плагина уже root."""

        def _run_command(self, command: str, use_sudo: bool = False, timeout: int = 10):  # noqa: ARG002
            try:
                result = subprocess.run(
                    command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    env=_clean_env(),
                )
                if result.returncode == 0:
                    return True, result.stdout.strip()
                return False, result.stderr.strip()
            except subprocess.TimeoutExpired:
                return False, "Таймаут выполнения команды"
            except Exception as e:
                return False, str(e)

        # Копии subprocess-веток из strategy_tester.py с env=_clean_env() для curl/ping.
        # При обновлении менеджера сверяйте: _smart_curl_check, _rutracker_test, _ping_test, _json_request.

        async def _smart_curl_check(self, url: str, method: str = "HEAD") -> Dict[str, Any]:
            cmd = [
                "curl",
                "-s",
                "-o",
                "/dev/null",
                "-I" if method.upper() == "HEAD" else "",
                "-L",
                "-k",
                "-4",
                "--connect-timeout",
                "1",
                "--max-time",
                "3",
                "--user-agent",
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "-w",
                "%{http_code}::%{time_total}::%{num_redirects}",
                url,
            ]
            cmd = [arg for arg in cmd if arg]

            result: Dict[str, Any] = {
                "success": False,
                "blocked": False,
                "http_code": 0,
                "time_taken": "0",
                "details": "",
                "raw_output": "",
            }

            try:
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=_clean_env(),
                )
                stdout, stderr = await process.communicate()

                output = stdout.decode("utf-8", errors="ignore").strip()
                error_output = stderr.decode("utf-8", errors="ignore").lower()
                result["raw_output"] = output

                if process.returncode == 0 and "::" in output:
                    parts = output.split("::")
                    http_code, time_taken = parts[0], parts[1]
                    result["http_code"] = int(http_code) if http_code.isdigit() else 0
                    result["time_taken"] = time_taken

                    success_codes = {
                        "200",
                        "204",
                        "301",
                        "302",
                        "303",
                        "304",
                        "307",
                        "308",
                        "403",
                        "404",
                        "405",
                    }
                    if http_code in success_codes:
                        result["success"] = True
                        result["details"] = f"HTTP: код {http_code}, время {time_taken}с"
                    else:
                        result["details"] = f"HTTP: код {http_code}"

                elif "ssl" in error_output or "certificate" in error_output:
                    result["blocked"] = True
                    result["details"] = "SSL блокировка"
                elif "reset" in error_output or "rst" in error_output:
                    result["blocked"] = True
                    result["details"] = "Сброс соединения (Connection Reset)"
                elif "could not resolve" in error_output:
                    result["details"] = "DNS ошибка"
                elif "timed out" in error_output:
                    result["details"] = "Таймаут"
                else:
                    result["details"] = f"Ошибка curl: {process.returncode}"

            except Exception as e:
                result["details"] = f"Исключение: {str(e)}"

            return result

        async def _rutracker_test(self, target: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
            test_url = target["url"]
            curl_result = await self._smart_curl_check(test_url, method="HEAD")

            headers_cmd = [
                "curl",
                "-k",
                "-I",
                "-s",
                "-m",
                "5",
                "-L",
                "-4",
                "--user-agent",
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
                test_url,
            ]

            try:
                proc_headers = await asyncio.create_subprocess_exec(
                    *headers_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=_clean_env(),
                )
                stdout_headers, _ = await proc_headers.communicate()
                headers_text = stdout_headers.decode("utf-8", errors="ignore")

                has_keep_alive = False
                for line in headers_text.split("\n"):
                    if line.lower().startswith("connection:"):
                        if "keep-alive" in line.lower():
                            has_keep_alive = True
                        break

                if has_keep_alive:
                    result["success"] = True
                    result["blocked"] = False
                    result["details"] = (
                        f"HTTP: код {curl_result.get('http_code', 'N/A')}, Connection: keep-alive"
                    )
                else:
                    result["success"] = False
                    result["blocked"] = True
                    result["details"] = (
                        f"HTTP: код {curl_result.get('http_code', 'N/A')}, "
                        "Connection: close или отсутствует (блокировка РКН)"
                    )

            except Exception as e:
                result["details"] = f"Ошибка проверки заголовков: {str(e)}"
                result["success"] = False
                result["blocked"] = True

            result["protocol"] = "HTTP"
            return result

        async def _ping_test(self, target: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
            host = target["ping_target"]

            try:
                proc = await asyncio.create_subprocess_exec(
                    "ping",
                    "-c",
                    "2",
                    "-W",
                    "3",
                    host,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=_clean_env(),
                )

                stdout, stderr = await proc.communicate()
                output = stdout.decode("utf-8", errors="ignore")

                if proc.returncode == 0:
                    time_match = re.search(r"time=([\d.]+)\s*ms", output)
                    if time_match:
                        ping_time = time_match.group(1)
                        result["details"] = f"Ping: {ping_time} ms"
                    else:
                        result["details"] = "Ping: успешно"
                    result["success"] = True
                else:
                    result["details"] = "Ping: неудачно"
                    result["success"] = False

            except Exception as e:
                result["details"] = f"Ping ошибка: {str(e)}"
                result["success"] = False

            return result

        async def _json_request(self, url: str, protocol: str, args: List[str]) -> Dict[str, Any]:
            status_cmd = [
                "curl",
                "-s",
                "-L",
                "-m",
                "1",
                "-H",
                "Accept: application/json",
                "-H",
                "User-Agent: Zapret-Tester/1.0",
                "-o",
                "/dev/null",
                "-w",
                "%{http_code}::%{time_total}",
            ]
            status_cmd.extend(args)
            status_cmd.append(url)

            content_cmd = [
                "curl",
                "-s",
                "-L",
                "-m",
                "1",
                "-H",
                "Accept: application/json",
                "-H",
                "User-Agent: Zapret-Tester/1.0",
            ]
            content_cmd.extend(args)
            content_cmd.append(url)

            out: Dict[str, Any] = {
                "protocol": protocol,
                "success": False,
                "blocked": False,
                "details": "",
            }

            try:
                proc_status = await asyncio.create_subprocess_exec(
                    *status_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=_clean_env(),
                )

                stdout_status, stderr_status = await proc_status.communicate()
                status_output = stdout_status.decode("utf-8", errors="ignore").strip()
                error_output = stderr_status.decode("utf-8", errors="ignore").lower()

                if proc_status.returncode == 0 and "::" in status_output:
                    http_code, time_taken = status_output.split("::", 1)

                    if http_code == "200":
                        proc_content = await asyncio.create_subprocess_exec(
                            *content_cmd,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                            env=_clean_env(),
                        )

                        stdout_content, stderr_content = await proc_content.communicate()
                        json_content = stdout_content.decode("utf-8", errors="ignore").strip()

                        if json_content:
                            try:
                                json_data = json.loads(json_content)

                                if isinstance(json_data, list):
                                    if len(json_data) > 0 and isinstance(json_data[0], dict):
                                        first_item = json_data[0]
                                        expected_fields = ["id", "name", "versions"]
                                        found_fields = [f for f in expected_fields if f in first_item]

                                        if len(found_fields) >= 2:
                                            out["success"] = True
                                            out["details"] = (
                                                f"{protocol}: JSON валиден (список плагинов), "
                                                f"{len(json_data)} элементов, время {time_taken}с"
                                            )
                                        elif (
                                            "name" in first_item
                                            or "author" in first_item
                                            or "description" in first_item
                                        ):
                                            out["success"] = True
                                            out["details"] = (
                                                f"{protocol}: JSON валиден (альтернативный формат), "
                                                f"{len(json_data)} элементов, время {time_taken}с"
                                            )
                                        else:
                                            out["details"] = f"{protocol}: Неожиданная структура списка"
                                    else:
                                        out["details"] = (
                                            f"{protocol}: Пустой список или элементы не являются объектами"
                                        )

                                elif isinstance(json_data, dict):
                                    expected_fields = [
                                        "id",
                                        "name",
                                        "author",
                                        "description",
                                        "tags",
                                        "versions",
                                    ]
                                    found_fields = [f for f in expected_fields if f in json_data]

                                    if len(found_fields) >= 3:
                                        out["success"] = True
                                        out["details"] = (
                                            f"{protocol}: JSON валиден (объект плагина), "
                                            f"{len(found_fields)} полей, время {time_taken}с"
                                        )
                                    elif len(json_data) > 0:
                                        out["success"] = True
                                        out["details"] = (
                                            f"{protocol}: JSON валиден (объект), "
                                            f"{len(json_data)} полей, время {time_taken}с"
                                        )
                                    else:
                                        out["details"] = f"{protocol}: Пустой объект"
                                else:
                                    out["details"] = (
                                        f"{protocol}: Ответ не является JSON объектом/массивом"
                                    )

                            except json.JSONDecodeError as e:
                                out["details"] = f"{protocol}: Невалидный JSON ({str(e)})"
                            except Exception as e:
                                out["details"] = f"{protocol}: Ошибка обработки JSON ({str(e)})"
                        else:
                            out["details"] = f"{protocol}: Пустой ответ"
                    else:
                        out["details"] = f"{protocol}: код {http_code} (ожидался 200)"
                elif "ssl" in error_output or "certificate" in error_output:
                    out["blocked"] = True
                    out["details"] = f"{protocol}: SSL блокировка"
                elif "reset" in error_output or "rst" in error_output:
                    out["blocked"] = True
                    out["details"] = f"{protocol}: сброс соединения"
                elif "timed out" in error_output or "timeout" in error_output:
                    out["details"] = f"{protocol}: таймаут"
                elif "could not resolve" in error_output:
                    out["details"] = f"{protocol}: DNS ошибка"
                else:
                    out["details"] = f"{protocol}: ошибка {proc_status.returncode}"

            except Exception as e:
                out["details"] = f"{protocol}: исключение {str(e)}"

            return out

    return _DeckyStrategyTester


def _ensure_strategy_tester() -> bool:
    """Подгружает StrategyTester с диска при первом запросе (после установки менеджера без перезапуска Decky)."""
    global _StrategyTester, DeckyStrategyTester, _import_err
    if DeckyStrategyTester is not None:
        return True
    with _import_lock:
        if DeckyStrategyTester is not None:
            return True
        _ensure_manager_on_syspath()
        st_path = _CORE / "strategy_tester.py"
        if not st_path.is_file():
            _import_err = f"Файл не найден: {st_path}"
            _StrategyTester = None
            DeckyStrategyTester = None
            return False
        mod_name = "decky_zapret_strategy_tester"
        try:
            if mod_name in sys.modules:
                del sys.modules[mod_name]
            spec = importlib.util.spec_from_file_location(mod_name, st_path)
            if spec is None or spec.loader is None:
                _import_err = "spec_from_file_location failed"
                return False
            mod = importlib.util.module_from_spec(spec)
            sys.modules[mod_name] = mod
            spec.loader.exec_module(mod)
            base = getattr(mod, "StrategyTester", None)
            if not isinstance(base, type):
                _import_err = "StrategyTester is not a class"
                return False
            _StrategyTester = base
            DeckyStrategyTester = _make_decky_subclass(base)
            _import_err = None
            return True
        except Exception as e:
            _import_err = f"{type(e).__name__}: {e}"
            _StrategyTester = None
            DeckyStrategyTester = None
            if mod_name in sys.modules:
                del sys.modules[mod_name]
            return False


_lock = threading.Lock()
_state: dict[str, Any] = {
    "running": False,
    "phase": "idle",
    "message": "",
    "error": None,
    "started_at": 0.0,
    "finished_at": 0.0,
    "mode": "standard",
    "working_count": 0,
}
_current_tester: Any = None


def _log_append_line(line: str) -> None:
    with _log_lock:
        _LOG_LINES.append(line)


def clear_autopicker_log() -> None:
    with _log_lock:
        _LOG_LINES.clear()


def _log_text_snapshot() -> str:
    with _log_lock:
        lines = list(_LOG_LINES)
    text = "\n".join(lines)
    if len(text) > _MAX_LOG_CHARS:
        return text[-_MAX_LOG_CHARS:]
    return text


def _suppress_autopicker_log_line(line: str) -> bool:
    """Убираем из лога плагина строки про отчёт и сохранение списка (оставляем свой финальный текст)."""
    s = line.lower()
    if "отчет сохранен" in s or "частичный отчет" in s:
        return True
    if "отчет можно открыть" in s:
        return True
    if "не удалось сохранить список рабочих стратегий" in s:
        return True
    if "рабочих стратегий" in s and ("сохранено" in s or "💾" in line):
        return True
    if "тестирование youtube/discord завершено" in s:
        return True
    if "dpi тестирование завершено" in s:
        return True
    if "тестирование завершено!" in s and "✅" in line:
        return True
    return False


def _finalize_autopicker_log(working_names: list[str]) -> None:
    """Фильтр хвоста лога + единый финальный блок со списком успешных стратегий."""
    with _log_lock:
        kept = [L for L in _LOG_LINES if not _suppress_autopicker_log_line(L)]
        _LOG_LINES.clear()
        for L in kept:
            _LOG_LINES.append(L)
        _LOG_LINES.append("")
        _LOG_LINES.append("Тестирование завершено.")
        _LOG_LINES.append("Теперь успешные стратегии можно выбирать на главном экране плагина.")
        _LOG_LINES.append("Список успешных стратегий")
        _LOG_LINES.append("")
        if working_names:
            for name in working_names:
                n = name.strip()
                if n:
                    _LOG_LINES.append(f"  • {n}")
        else:
            _LOG_LINES.append("  (нет стратегий, прошедших порог теста)")


class _StdoutCapture:
    """Перехватывает print/traceback как в консоли десктопной версии (stdout/stderr)."""

    def __init__(self) -> None:
        self._buf = ""

    def write(self, s: str) -> int:
        if not s:
            return 0
        self._buf += s
        while True:
            i = self._buf.find("\n")
            if i < 0:
                break
            line = self._buf[:i]
            self._buf = self._buf[i + 1 :]
            _log_append_line(line)
        return len(s)

    def flush(self) -> None:
        if self._buf:
            _log_append_line(self._buf)
            self._buf = ""


def tester_available() -> tuple[bool, str]:
    if not _MANAGER.is_dir():
        return False, "manager_dir_missing"
    if not _ensure_strategy_tester():
        return False, _import_err or "strategy_tester not available"
    return True, ""


def get_status() -> dict:
    with _lock:
        snap = {
            "running": _state["running"],
            "phase": _state["phase"],
            "message": _state["message"],
            "error": _state["error"],
            "started_at": _state["started_at"],
            "finished_at": _state["finished_at"],
            "mode": _state["mode"],
            "working_count": _state["working_count"],
        }
    snap["log_text"] = _log_text_snapshot()
    if not snap["running"] and not (snap.get("log_text") or "").strip():
        if not _MANAGER.is_dir():
            snap["log_text"] = f"Менеджер не найден: {_MANAGER}"
        elif not _ensure_strategy_tester():
            snap["log_text"] = _import_err or "strategy_tester недоступен (проверьте core/strategy_tester.py)"
    return snap


def _set_state(**kwargs: Any) -> None:
    with _lock:
        for k, v in kwargs.items():
            if k in _state:
                _state[k] = v


def list_strategy_names() -> list[str]:
    d = _MANAGER / "files" / "strategy"
    if not d.is_dir():
        return []
    names = []
    for f in sorted(d.iterdir()):
        if f.is_file() and not f.name.startswith("."):
            names.append(f.name)
    return names


def _result_passes_working_threshold(result: Dict[str, Any], mode: str) -> bool:
    """Те же пороги, что при сохранении utils/working_strategies.txt в strategy_tester.run_full_test."""
    if result.get("error"):
        return False
    name = (result.get("strategy") or "").strip()
    if not name:
        return False
    success_rate = float(result.get("success_rate", 0) or 0)
    youtube_passed = result.get("youtube_passed")
    discord_passed = result.get("discord_passed")
    if mode == "YouTube/Discord":
        return youtube_passed is True and discord_passed is True
    if mode == "dpi":
        return success_rate >= 70.0
    return success_rate >= 60.0 and youtube_passed is True and discord_passed is True


def _pick_best_strategy_name(all_results: List[Dict[str, Any]], mode: str) -> Optional[str]:
    """Лучшая из прошедших порог: выше success_rate, затем больше successful, как в HTML-отчёте менеджера."""
    candidates: list[tuple[float, int, str]] = []
    for r in all_results:
        if not _result_passes_working_threshold(r, mode):
            continue
        n = (r.get("strategy") or "").strip()
        if not n:
            continue
        sr = float(r.get("success_rate", 0) or 0)
        ok = int(r.get("successful", 0) or 0)
        candidates.append((sr, ok, n))
    if not candidates:
        return None
    candidates.sort(key=lambda t: (-t[0], -t[1], t[2]))
    return candidates[0][2]


def _restart_zapret_for_autopick() -> tuple[bool, str]:
    try:
        r = subprocess.run(
            ["systemctl", "restart", "zapret"],
            capture_output=True,
            text=True,
            timeout=180,
            env=_clean_env(),
        )
        if r.returncode != 0:
            tail = ((r.stderr or r.stdout or "").strip()[:400] or "systemctl failed")
            return False, tail
        return True, "ok"
    except Exception as e:
        return False, str(e)


def _apply_working_strategy_name(strategy_name: str) -> tuple[bool, str]:
    """Как main._apply_strategy_from_file: только стратегии из utils/working_strategies.txt."""
    if not strategy_name or "/" in strategy_name or "\\" in strategy_name or ".." in strategy_name:
        return False, "invalid_name"
    if strategy_name.startswith("."):
        return False, "invalid_name"
    m = _MANAGER
    ws = m / "utils" / "working_strategies.txt"
    if not ws.is_file():
        return False, "no_working_list"
    try:
        allowed = {ln.strip() for ln in ws.read_text(encoding="utf-8").splitlines() if ln.strip()}
    except OSError as e:
        return False, str(e)
    if strategy_name not in allowed:
        return False, "not_in_working_list"
    sf = m / "files" / "strategy" / strategy_name
    if not sf.is_file():
        return False, "file_not_found"
    try:
        content = sf.read_text(encoding="utf-8").strip()
    except OSError as e:
        return False, str(e)
    name_f = m / "utils" / "name_strategy.txt"
    config_f = m / "config.txt"
    try:
        name_f.parent.mkdir(parents=True, exist_ok=True)
        if not content:
            name_f.write_text("", encoding="utf-8")
            config_f.write_text("", encoding="utf-8")
        else:
            name_f.write_text(strategy_name, encoding="utf-8")
            config_f.write_text(content, encoding="utf-8")
    except OSError as e:
        return False, str(e)
    return _restart_zapret_for_autopick()


def stop() -> dict:
    with _lock:
        t = _current_tester
    if t is not None:
        try:
            t.stop_testing()
        except Exception:
            pass
        return {"ok": True, "detail": "stop_requested"}
    return {"ok": False, "detail": "not_running"}


def start(strategies: Optional[list[str]] = None) -> dict:
    ok, err = tester_available()
    if not ok:
        return {"ok": False, "detail": err}

    with _lock:
        if _state["running"]:
            return {"ok": False, "detail": "already_running"}

    strat_arg = strategies if strategies is not None else None
    if strat_arg is not None and len(strat_arg) == 0:
        return {"ok": False, "detail": "no_strategies_selected"}

    mode = "standard"
    clear_autopicker_log()

    def worker() -> None:
        global _current_tester
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        cap = _StdoutCapture()
        old_out, old_err = sys.stdout, sys.stderr

        try:
            sys.stdout = cap  # type: ignore[assignment]
            sys.stderr = cap  # type: ignore[assignment]
            _set_state(
                running=True,
                phase="running",
                message="Тестирование…",
                error=None,
                started_at=time.time(),
                finished_at=0.0,
                mode=mode,
                working_count=0,
            )
            tester = DeckyStrategyTester(str(_MANAGER), None)
            with _lock:
                _current_tester = tester

            _raw_results = loop.run_until_complete(tester.run_full_test(mode, strategies=strat_arg))
            all_results: List[Dict[str, Any]] = _raw_results if isinstance(_raw_results, list) else []
            cap.flush()

            ws = _MANAGER / "utils" / "working_strategies.txt"
            working_names: list[str] = []
            if ws.is_file():
                working_names = [ln.strip() for ln in ws.read_text(encoding="utf-8").splitlines() if ln.strip()]
            wc = len(working_names)
            working_set = set(working_names)

            stopped = bool(getattr(tester, "stop_requested", False))
            best = _pick_best_strategy_name(all_results, mode)
            apply_ok = False
            apply_msg = ""
            if best and not stopped and best in working_set:
                apply_ok, apply_msg = _apply_working_strategy_name(best)

            _finalize_autopicker_log(working_names)

            if stopped:
                _log_append_line("")
                _log_append_line("Автовыбор пропущен: тест остановлен вручную.")
            elif best and best in working_set:
                _log_append_line("")
                if apply_ok:
                    _log_append_line(f"Автовыбор: активирована лучшая стратегия «{best}».")
                else:
                    _log_append_line(f"Автовыбор: не удалось активировать «{best}»: {apply_msg}")
            elif best and best not in working_set:
                _log_append_line("")
                _log_append_line(
                    "Автовыбор: лучшая по результатам стратегия не совпадает со списком рабочих — конфиг не менялся."
                )
            elif all_results and wc == 0:
                _log_append_line("")
                _log_append_line(
                    "Автовыбор: ни одна стратегия не прошла порог — активная конфигурация не менялась."
                )

            _set_state(
                running=False,
                phase="done",
                message="Тестирование завершено.",
                finished_at=time.time(),
                working_count=wc,
            )
        except Exception as e:
            _set_state(
                running=False,
                phase="error",
                error=str(e),
                message=str(e)[:240],
                finished_at=time.time(),
            )
        finally:
            cap.flush()
            sys.stdout = old_out
            sys.stderr = old_err
            with _lock:
                _current_tester = None
            loop.close()

    threading.Thread(target=worker, name="decky-autopicker", daemon=True).start()
    return {"ok": True, "detail": "started"}
