(function (deckyFrontendLib, React) {
  "use strict";

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;
  var useRef = React.useRef;
  var F = deckyFrontendLib;

  var api;
  function setServerAPI(s) {
    api = s;
  }

  function call(name, params) {
    return api.callPluginMethod(name, params || {}).then(function (r) {
      if (r.success) return r.result;
      throw r.result;
    });
  }

  function get_zapret_state() {
    return call("get_zapret_state", {});
  }
  function toggle_zapret() {
    return call("toggle_zapret", {});
  }
  function apply_working_strategy(strategy_name) {
    return call("apply_working_strategy", { strategy_name: strategy_name });
  }
  function toggle_gamefilter() {
    return call("toggle_gamefilter", {});
  }
  function set_game_preset(preset_id) {
    return call("set_game_preset", { preset_id: preset_id });
  }
  function list_game_presets() {
    return call("list_game_presets", {});
  }
  function set_ipset_filter_mode(mode) {
    return call("set_ipset_filter_mode", { mode: mode });
  }

  var NONE_PRESET = "none";

  function serviceStatusText(ru, active) {
    var ruMap = {
      active: "Служба Zapret: запущена",
      inactive: "Служба Zapret: остановлена",
      failed: "Служба Zapret: ошибка (failed)",
      activating: "Служба Zapret: запускается…",
      deactivating: "Служба Zapret: останавливается…",
      unknown: "Служба Zapret: неизвестно",
    };
    var enMap = {
      active: "Zapret service: running",
      inactive: "Zapret service: stopped",
      failed: "Zapret service: failed",
      activating: "Zapret service: starting…",
      deactivating: "Zapret service: stopping…",
      unknown: "Zapret service: unknown",
    };
    var m = ru ? ruMap : enMap;
    return m[active] || m.unknown;
  }

  function applyErrorText(ru, code) {
    var ruM = {
      invalid_name: "Некорректное имя стратегии",
      not_in_working_list: "Стратегия не в списке проверенных",
      file_not_found: "Файл стратегии не найден",
    };
    var enM = {
      invalid_name: "Invalid strategy name",
      not_in_working_list: "Strategy not in verified list",
      file_not_found: "Strategy file not found",
    };
    var m = ru ? ruM : enM;
    if (m[code]) return m[code];
    if (code === "systemctl failed") return ru ? "Не удалось перезапустить службу" : "Could not restart service";
    return code && code.length > 80 ? code.slice(0, 80) + "…" : code;
  }

  function gamePresetErrorText(ru, code) {
    var ruM = {
      game_presets_unavailable: "Модуль пресетов недоступен (проверьте Zapret DPI Manager)",
      invalid_preset: "Неизвестный пресет",
    };
    var enM = {
      game_presets_unavailable: "Game presets unavailable (check Zapret DPI Manager)",
      invalid_preset: "Unknown preset",
    };
    var m = ru ? ruM : enM;
    if (m[code]) return m[code];
    if (code === "systemctl failed") return ru ? "Не удалось перезапустить службу" : "Could not restart service";
    return code && code.length > 80 ? code.slice(0, 80) + "…" : code;
  }

  function gameFilterStatusLine(ru, s) {
    var prefix = ru ? "GameFilter: " : "GameFilter: ";
    if (s.game_preset_name) return prefix + s.game_preset_name;
    if (s.gamefilter_enabled) return prefix + (ru ? "включено" : "enabled");
    return prefix + (ru ? "отключено" : "disabled");
  }

  function ipsetFilterStatusLine(ru, s) {
    var m = (s.ipset_filter_mode) || "none";
    return "IPsetFilter: " + m;
  }

  function ipsetErrorText(ru, code) {
    var ruM = {
      invalid_ipset_mode: "Некорректный режим IPset",
      ipset_utils_missing: "Нет файла utils/ipset-all.txt (нужен для loaded)",
    };
    var enM = {
      invalid_ipset_mode: "Invalid IPset mode",
      ipset_utils_missing: "utils/ipset-all.txt missing (required for loaded)",
    };
    var m = ru ? ruM : enM;
    if (m[code]) return m[code];
    if (code === "systemctl failed") return ru ? "Не удалось перезапустить службу" : "Could not restart service";
    return code && code.length > 80 ? code.slice(0, 80) + "…" : code;
  }

  function ruLang() {
    return (
      typeof navigator !== "undefined" &&
      navigator.language &&
      navigator.language.toLowerCase().indexOf("ru") === 0
    );
  }

  function AutopickerTab(props) {
    var ru = ruLang();
    var serverAPI = props.serverAPI;

    var sn = useState([]);
    var names = sn[0];
    var setNames = sn[1];

    var sp = useState({});
    var picked = sp[0];
    var setPicked = sp[1];

    var bs = useState(false);
    var busy = bs[0];
    var setBusy = bs[1];

    var ss = useState(null);
    var st = ss[0];
    var setSt = ss[1];

    var logRef = useRef(null);

    function refreshStatus() {
      serverAPI.callPluginMethod("get_autopicker_status", {}).then(function (r) {
        if (r.success) setSt(r.result);
      });
    }

    function loadNames() {
      serverAPI.callPluginMethod("list_strategy_files", {}).then(function (r) {
        if (r.success && r.result && r.result.strategies) {
          setNames(r.result.strategies);
          setPicked({});
        }
      });
    }

    useEffect(function () {
      loadNames();
    }, []);

    useEffect(function () {
      refreshStatus();
      var id = setInterval(refreshStatus, 2000);
      return function () {
        clearInterval(id);
      };
    }, []);

    useEffect(
      function () {
        var el = logRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      },
      [st && st.log_text],
    );

    function selectedList() {
      var out = [];
      for (var i = 0; i < names.length; i++) {
        if (picked[names[i]]) out.push(names[i]);
      }
      return out;
    }

    function start(all) {
      setBusy(true);
      var sl = selectedList();
      var strategies = all ? null : sl.length > 0 ? sl : null;
      serverAPI
        .callPluginMethod("start_autopicker", { strategies: strategies })
        .then(function (r) {
          if (!r.success || !r.result || !r.result.ok) {
            setSt(function (prev) {
              return {
                running: false,
                phase: "error",
                message: "",
                error: r.success ? r.result.detail : "error",
                working_count: prev && prev.working_count ? prev.working_count : 0,
                mode: "standard",
                log_text: prev && prev.log_text,
              };
            });
          }
        })
        .finally(function () {
          setBusy(false);
          refreshStatus();
        });
    }

    function stop() {
      serverAPI.callPluginMethod("stop_autopicker", {}).then(refreshStatus);
    }

    var running = st && st.running === true;

    var introRu =
      "Запустите тестирование всех стратегий, чтобы программа подобрала самые оптимальные стратегии.\nИли можете выбрать конкретные стратегии из списка и запустить автоподбор с выбранными стратегиями. Будут проверены только они.";
    var introEn =
      "Run testing for all strategies so the program can pick the most suitable ones.\nOr select specific strategies from the list and run auto-selection with those strategies only. Only they will be checked.";

    var panelBodyNoIndentAp = {
      display: "block",
      width: "100%",
      margin: 0,
      padding: 0,
      textIndent: 0,
      boxSizing: "border-box",
    };

    var rows = [
      e(F.PanelSectionRow, null,
        e(
          "span",
          { style: Object.assign({}, panelBodyNoIndentAp, { fontSize: 13, opacity: 0.9, whiteSpace: "pre-wrap" }) },
          ru ? introRu : introEn,
        ),
      ),
      e(F.PanelSectionRow, null,
        e(F.ButtonItem, { layout: "below", disabled: running || busy, onClick: function () { start(true); } },
          ru ? "Тестировать все стратегии" : "Test all strategies",
        ),
      ),
    ];

    var maxT = Math.min(names.length, 60);
    for (var ti = 0; ti < maxT; ti++) {
      (function (name) {
        rows.push(
          e(F.PanelSectionRow, { key: name },
            e(F.ToggleField, {
              label: name,
              checked: !!picked[name],
              disabled: running || busy,
              onChange: function (c) {
                setPicked(function (p) {
                  var x = Object.assign({}, p);
                  x[name] = c;
                  return x;
                });
              },
            }),
          ),
        );
      })(names[ti]);
    }

    if (names.length > 60) {
      rows.push(
        e(
          F.PanelSectionRow,
          null,
          e(
            "span",
            { style: Object.assign({}, panelBodyNoIndentAp, { fontSize: 11, opacity: 0.7 }) },
            "… " + (names.length - 60) + " more",
          ),
        ),
      );
    }

    rows.push(
      e(F.PanelSectionRow, null,
        e(F.ButtonItem, { layout: "below", disabled: running || busy, onClick: function () { start(false); } },
          ru ? "Запустить тест с выбранными стратегиями" : "Run test with selected strategies",
        ),
      ),
      e(F.PanelSectionRow, null,
        e(F.ButtonItem, { layout: "below", disabled: !running, onClick: stop },
          ru ? "Остановить тест" : "Stop test",
        ),
      ),
    );

    if (st) {
      var msg = running
        ? ru
          ? "Идёт тест…"
          : "Testing…"
        : st.phase === "done"
          ? ru
            ? "Тестирование завершено."
            : "Testing finished."
          : st.phase === "error"
            ? (ru ? "Ошибка" : "Error") + ": " + (st.error || st.message)
            : st.message || (st.phase !== "idle" ? st.phase : "");
      if (msg) {
        rows.push(
          e(
            F.PanelSectionRow,
            null,
            e(
              "span",
              { style: Object.assign({}, panelBodyNoIndentAp, { fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" }) },
              msg,
            ),
          ),
        );
      }
    }

    var logBody =
      st && st.log_text && st.log_text.length
        ? st.log_text
        : ru
          ? "(пусто — запустите тест)"
          : "(empty — start a test)";

    rows.push(
      e(F.PanelSectionRow, null,
        e("div", { style: Object.assign({}, panelBodyNoIndentAp, { width: "100%" }) },
          e(
            "span",
            { style: Object.assign({}, panelBodyNoIndentAp, { fontSize: 12, opacity: 0.75, marginBottom: 4 }) },
            ru ? "Информация об автоподборе" : "Auto-selection information",
          ),
          e("div", {
            ref: logRef,
            style: {
              width: "100%",
              maxHeight: 280,
              overflow: "auto",
              padding: 8,
              fontSize: 11,
              fontFamily: "Consolas, monospace",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "rgba(0,0,0,0.35)",
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.08)",
              margin: 0,
              textIndent: 0,
              boxSizing: "border-box",
            },
          }, logBody),
        ),
      ),
    );

    return e(F.PanelSection, null, rows);
  }

  function openExternalUrl(url) {
    try {
      var sc = typeof window !== "undefined" ? window.SteamClient : undefined;
      if (sc && sc.System && sc.System.OpenInChrome) sc.System.OpenInChrome(url);
    } catch (e0) {}
    try {
      window.open(url, "_blank");
    } catch (e1) {}
  }

  function UpdatesTab(props) {
    var ru = ruLang();
    var serverAPI = props.serverAPI;

    var lv = useState("");
    var localVer = lv[0];
    var setLocalVer = lv[1];

    var le = useState(null);
    var localErr = le[0];
    var setLocalErr = le[1];

    var cr = useState(null);
    var checkResult = cr[0];
    var setCheckResult = cr[1];

    var cbs = useState(false);
    var checkBusy = cbs[0];
    var setCheckBusy = cbs[1];

    var ibs = useState(false);
    var installBusy = ibs[0];
    var setInstallBusy = ibs[1];

    function loadLocal() {
      return serverAPI
        .callPluginMethod("get_plugin_version", {})
        .then(function (r) {
          if (r.success && r.result) {
            if (r.result.ok) {
              setLocalVer(r.result.current_version);
              setLocalErr(null);
            } else {
              setLocalVer("");
              setLocalErr(r.result.error || r.result.error_code || "error");
            }
          }
        })
        .catch(function () {
          setLocalVer("");
          setLocalErr(ru ? "Не удалось прочитать версию" : "Could not read version");
        });
    }

    useEffect(function () {
      loadLocal();
    }, []);

    function runCheck() {
      setCheckBusy(true);
      setCheckResult(null);
      serverAPI
        .callPluginMethod("check_plugin_updates", {})
        .then(function (r) {
          if (r.success && r.result) {
            setCheckResult(r.result);
            return loadLocal();
          }
          setCheckResult({
            status: "error",
            detail: ru ? "Не удалось вызвать проверку обновлений" : "Could not run update check",
          });
        })
        .catch(function () {
          setCheckResult({
            status: "error",
            detail: ru ? "Сеть или плагин недоступны" : "Network or plugin unavailable",
          });
        })
        .finally(function () {
          setCheckBusy(false);
        });
    }

    function runInstall() {
      setInstallBusy(true);
      serverAPI
        .callPluginMethod("update_plugin", {})
        .then(function (r) {
          if (r.success && r.result && r.result.status) {
            var s = r.result.status;
            if (s === "update_started" || s === "update_started_with_sudo") {
              serverAPI.toaster.toast({
                title: ru ? "Zapret DPI" : "Zapret DPI",
                body: ru
                  ? "Обновление запущено. Плагин скоро перезапустится."
                  : "Update started. The plugin will restart shortly.",
              });
            } else if (s.indexOf("update_failed") === 0) {
              setCheckResult(function (prev) {
                return {
                  status: "error",
                  detail: s,
                  latest: prev && prev.latest,
                  current: prev && prev.current,
                };
              });
            }
          }
        })
        .catch(function (e) {
          setCheckResult(function (prev) {
            return {
              status: "error",
              detail: String(e),
              latest: prev && prev.latest,
              current: prev && prev.current,
            };
          });
        })
        .finally(function () {
          setInstallBusy(false);
        });
    }

    function onPrimaryClick() {
      if (checkResult && checkResult.status === "update_available") {
        runInstall();
      } else {
        runCheck();
      }
    }

    function primaryLabel() {
      if (installBusy) return ru ? "Установка…" : "Installing…";
      if (checkBusy) return ru ? "Проверяем…" : "Checking…";
      if (checkResult && checkResult.status === "update_available") {
        return ru ? "Установить обновление" : "Install update";
      }
      return ru ? "Проверить обновления" : "Check for updates";
    }

    function statusText() {
      if (!checkResult) return "";
      if (checkResult.status === "checking") return ru ? "Проверка…" : "Checking…";
      if (checkResult.status === "error") {
        return (ru ? "Ошибка" : "Error") + ": " + (checkResult.detail || "");
      }
      if (checkResult.status === "up_to_date") {
        return ru
          ? "У вас уже установлена актуальная версия плагина."
          : "You already have the latest version of the plugin.";
      }
      if (checkResult.status === "update_available") {
        var v = checkResult.latest ? " (" + checkResult.latest + ")" : "";
        return ru ? "Доступна новая версия" + v + "." : "A new version is available" + v + ".";
      }
      return "";
    }

    var showStatusBlock = checkResult && checkResult.status !== "checking";
    var showChangelog =
      checkResult &&
      checkResult.status === "update_available" &&
      typeof checkResult.changelog === "string" &&
      checkResult.changelog.length > 0;

    var panelBodyNoIndentUp = {
      display: "block",
      width: "100%",
      margin: 0,
      padding: 0,
      textIndent: 0,
      boxSizing: "border-box",
    };

    var updRows = [
      e(F.PanelSectionRow, null,
        e(
          "span",
          { style: Object.assign({}, panelBodyNoIndentUp, { fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" }) },
          (ru ? "Версия плагина:" : "Plugin version:") + " ",
          localErr
            ? e("span", { style: { color: "#e57373" } }, localErr)
            : e("span", { style: { fontWeight: 500 } }, localVer || "—"),
        ),
      ),
      e(F.PanelSectionRow, null,
        e(F.ButtonItem, {
          layout: "below",
          disabled: checkBusy || installBusy,
          onClick: onPrimaryClick,
        }, primaryLabel()),
      ),
    ];

    if (showStatusBlock) {
      updRows.push(
        e(
          F.PanelSectionRow,
          null,
          e(
            "span",
            {
              style: Object.assign({}, panelBodyNoIndentUp, {
                marginTop: 14,
                fontSize: 12,
                opacity: 0.85,
                whiteSpace: "pre-wrap",
              }),
            },
            statusText(),
          ),
        ),
      );
    }

    if (showChangelog) {
      updRows.push(
        e(
          F.PanelSectionRow,
          null,
          e(
            "div",
            {
              style: {
                marginTop: 8,
                maxHeight: 220,
                overflowY: "auto",
                width: "100%",
                fontSize: 12,
                opacity: 0.9,
              },
            },
            e("pre", { style: { whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" } }, checkResult.changelog),
          ),
        ),
      );
    }

    return e(F.PanelSection, null, updRows);
  }

  function InfoTab(props) {
    var ru = ruLang();
    var panelBodyNoIndentInfo = {
      display: "block",
      width: "100%",
      margin: 0,
      padding: 0,
      textIndent: 0,
      boxSizing: "border-box",
    };
    var URL_MANAGER = "https://github.com/mashakulina/Zapret-DPI-for-Steam-Deck";
    var URL_PLUGIN = "https://github.com/mashakulina/DeckyZapretDPI";
    var URL_FLOWSEAL = "https://github.com/Flowseal";
    var URL_IMMALWARE = "https://github.com/ImMALWARE";

    var introRu =
      "Плагин работает совместно с Zapret DPI Manager — графической оболочкой для службы Zapret на Steam Deck.";
    var introEn =
      "This plugin works together with Zapret DPI Manager — the desktop GUI for the Zapret service on Steam Deck.";
    var flowRu =
      "Стратегии и некоторые доработки берутся из версии Zapret для Windows (автор Flowseal).";
    var flowEn = "Strategies and some enhancements come from the Windows Zapret project by Flowseal.";
    var malRu = "Служба Zapret DPI основана на разработке ImMALWARE.";
    var malEn = "The Zapret DPI service builds on work by ImMALWARE.";

    var infoRows = [
      e(F.PanelSectionRow, null,
        e(
          "span",
          { style: Object.assign({}, panelBodyNoIndentInfo, { fontSize: 13, opacity: 0.9, whiteSpace: "pre-wrap" }) },
          ru ? introRu : introEn,
        ),
      ),
      e(F.PanelSectionRow, null,
        e(F.ButtonItem, { layout: "below", onClick: function () { openExternalUrl(URL_MANAGER); } },
          ru ? "Zapret DPI Manager (GitHub)" : "Zapret DPI Manager (GitHub)",
        ),
      ),
      e(F.PanelSectionRow, null,
        e(F.ButtonItem, { layout: "below", onClick: function () { openExternalUrl(URL_PLUGIN); } },
          ru ? "Плагин DeckyZapretDPI (GitHub)" : "DeckyZapretDPI plugin (GitHub)",
        ),
      ),
      e(F.PanelSectionRow, null,
        e(
          "span",
          {
            style: Object.assign({}, panelBodyNoIndentInfo, {
              fontSize: 12,
              opacity: 0.85,
              whiteSpace: "pre-wrap",
              marginTop: 14,
            }),
          },
          ru ? flowRu : flowEn,
        ),
      ),
      e(F.PanelSectionRow, null,
        e(F.ButtonItem, { layout: "below", onClick: function () { openExternalUrl(URL_FLOWSEAL); } }, "Flowseal (GitHub)"),
      ),
      e(F.PanelSectionRow, null,
        e(
          "span",
          {
            style: Object.assign({}, panelBodyNoIndentInfo, {
              fontSize: 12,
              opacity: 0.85,
              whiteSpace: "pre-wrap",
              marginTop: 14,
            }),
          },
          ru ? malRu : malEn,
        ),
      ),
      e(F.PanelSectionRow, null,
        e(F.ButtonItem, { layout: "below", onClick: function () { openExternalUrl(URL_IMMALWARE); } }, "ImMALWARE (GitHub)"),
      ),
    ];

    return e(F.PanelSection, null, infoRows);
  }

  function ManagerInstallHome(propz) {
    var ru = propz.ru;
    var onInstalled = propz.onInstalled;
    var bs = useState(false);
    var busy = bs[0];
    var setBusy = bs[1];
    var det = useState(null);
    var lastDetail = det[0];
    var setLastDetail = det[1];
    var pollRef = useRef(null);

    useEffect(function () {
      return function () {
        if (pollRef.current != null) clearInterval(pollRef.current);
      };
    }, []);

    function clearPoll() {
      if (pollRef.current != null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    function startPolling() {
      clearPoll();
      var n = 0;
      pollRef.current = setInterval(function () {
        n += 1;
        if (n > 90) {
          clearPoll();
          return;
        }
        api
          .callPluginMethod("get_zapret_state", {})
          .then(function (r) {
            if (r.success && r.result && r.result.manager_installed === true) {
              clearPoll();
              onInstalled();
            }
          })
          .catch(function () {});
      }, 4000);
    }

    function runInstall() {
      setBusy(true);
      setLastDetail(null);
      api
        .callPluginMethod("install_zapret_dpi_manager", {})
        .then(function (r) {
          if (r.success && r.result) {
            var st = r.result.status;
            if (st === "already_installed") {
              api.toaster.toast({
                title: "Zapret DPI",
                body: ru ? "Zapret DPI Manager уже установлен." : "Zapret DPI Manager is already installed.",
              });
              onInstalled();
            } else if (st === "started") {
              api.toaster.toast({
                title: "Zapret DPI",
                body: ru
                  ? "Установка запущена в фоне. Подождите несколько минут. Если не появится — откройте лог /tmp/deckyzapretdpi_manager_install.log в режиме рабочего стола или установите менеджер вручную с GitHub."
                  : "Installation started in the background. Wait a few minutes. If nothing changes, open /tmp/deckyzapretdpi_manager_install.log in Desktop mode or install the manager manually from GitHub.",
              });
              startPolling();
            } else {
              var d = r.result.detail || "error";
              setLastDetail(d);
              return api.callPluginMethod("get_manager_install_log_tail", {}).then(function (lr) {
                if (lr.success && lr.result && lr.result.tail && lr.result.tail.trim()) {
                  setLastDetail(d + "\n---\n" + lr.result.tail);
                }
              });
            }
          } else {
            setLastDetail(ru ? "Вызов установки не удался" : "Install call failed");
          }
        })
        .catch(function (e) {
          setLastDetail(String(e));
        })
        .finally(function () {
          setBusy(false);
        });
    }

    var panelBodyMi = {
      display: "block",
      width: "100%",
      margin: 0,
      padding: 0,
      textIndent: 0,
      boxSizing: "border-box",
    };

    var miRows = [
      e(F.PanelSectionRow, null,
        e(
          "span",
          { style: Object.assign({}, panelBodyMi, { fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" }) },
          ru
            ? "Zapret DPI Manager не установлен (нужен каталог /home/deck/Zapret_DPI_Manager с приложением). Установите его кнопкой ниже или вручную с GitHub — затем здесь появятся кнопки управления службой и стратегиями."
            : "Zapret DPI Manager is not installed (expected at /home/deck/Zapret_DPI_Manager). Install with the button below or manually from GitHub — then service and strategy controls will appear here.",
        ),
      ),
      e(F.PanelSectionRow, null,
        e(F.ButtonItem, { layout: "below", disabled: busy, onClick: runInstall },
          busy
            ? ru
              ? "Запуск…"
              : "Starting…"
            : ru
              ? "Установить Zapret DPI Manager"
              : "Install Zapret DPI Manager",
        ),
      ),
    ];
    if (lastDetail) {
      miRows.push(
        e(F.PanelSectionRow, null,
          e(
            "span",
            {
              style: Object.assign({}, panelBodyMi, {
                marginTop: 12,
                fontSize: 11,
                color: "#e57373",
                whiteSpace: "pre-wrap",
              }),
            },
            lastDetail,
          ),
        ),
      );
    }
    return e(F.PanelSection, null, miRows);
  }

  function SettingsPageRouter(props) {
    var ru = ruLang();
    var serverAPI = props.serverAPI;
    return e(F.SidebarNavigation, {
      pages: [
        {
          title: ru ? "Автоподбор стратегий" : "Strategy auto-pick",
          route: "/deckyzapretdpi/settings/autopicker",
          content: e(AutopickerTab, { serverAPI: serverAPI }),
        },
        {
          title: ru ? "Обновление" : "Updates",
          route: "/deckyzapretdpi/settings/updates",
          content: e(UpdatesTab, { serverAPI: serverAPI }),
        },
        {
          title: ru ? "Информация" : "Information",
          route: "/deckyzapretdpi/settings/info",
          content: e(InfoTab, { serverAPI: serverAPI }),
        },
      ],
    });
  }

  function Content() {
    var ru = ruLang();
    var st = useState(null);
    var state = st[0];
    var setState = st[1];
    var bs = useState(false);
    var busy = bs[0];
    var setBusy = bs[1];
    var ab = useState(false);
    var applyBusy = ab[0];
    var setApplyBusy = ab[1];
    var gfSt = useState(false);
    var gfBusy = gfSt[0];
    var setGfBusy = gfSt[1];
    var ipSt = useState(false);
    var ipsetBusy = ipSt[0];
    var setIpsetBusy = ipSt[1];
    var gpSt = useState([]);
    var gamePresets = gpSt[0];
    var setGamePresets = gpSt[1];

    var panelBodyNoIndent = {
      display: "block",
      width: "100%",
      margin: 0,
      padding: 0,
      textIndent: 0,
      boxSizing: "border-box",
    };

    function refresh() {
      return get_zapret_state()
        .then(setState)
        .catch(function () {
          setState({
            service: "unknown",
            service_active: false,
            strategy_label: ru ? "Не удалось прочитать состояние" : "Could not read state",
            strategy_detail: "",
            manager_path: "",
            manager_installed: false,
            working_strategies: [],
            gamefilter_enabled: false,
            game_preset_id: null,
            game_preset_name: null,
            game_presets_available: false,
            ipset_filter_mode: "none",
          });
        });
    }

    useEffect(function () {
      refresh();
      var id = setInterval(refresh, 3000);
      return function () {
        clearInterval(id);
      };
    }, []);

    useEffect(function () {
      list_game_presets()
        .then(function (r) {
          setGamePresets((r && r.presets) || []);
        })
        .catch(function () {
          setGamePresets([]);
        });
    }, []);

    var active = state && state.service === "active";
    var svcKey =
      state && state.service === "active"
        ? "active"
        : state && state.service === "inactive"
          ? "inactive"
          : state && state.service === "failed"
            ? "failed"
            : state && state.service === "activating"
              ? "activating"
              : state && state.service === "deactivating"
                ? "deactivating"
                : "unknown";

    var dropdownOptions = useMemo(
      function () {
        var names = (state && state.working_strategies) || [];
        return names.map(function (name) {
          return { data: name, label: name };
        });
      },
      [state && state.working_strategies],
    );

    var selectedDropdown = useMemo(
      function () {
        var label = state && state.strategy_label;
        if (!label || label === "Не выбрано" || label === "Custom Strategy") return null;
        for (var i = 0; i < dropdownOptions.length; i++) {
          if (dropdownOptions[i].data === label) return dropdownOptions[i];
        }
        return null;
      },
      [state && state.strategy_label, dropdownOptions],
    );

    var emptyHint = ru
      ? "Список пуст. Откройте настройки плагина (шестерёнка) → «Автоподбор стратегий» и запустите автоподбор, как в Zapret DPI Manager."
      : "List is empty. Open plugin settings (gear) → “Strategy auto-pick” and run auto-pick, same as in Zapret DPI Manager.";

    var presetDropdownOptions = useMemo(
      function () {
        var noneLabel = ru ? "Ничего" : "None";
        var head = [{ data: NONE_PRESET, label: noneLabel }];
        var tail = gamePresets.map(function (p) {
          return { data: p.id, label: p.name };
        });
        return head.concat(tail);
      },
      [ru, gamePresets],
    );

    var selectedPresetOption = useMemo(
      function () {
        var pid = state && state.game_preset_id;
        if (!pid) return presetDropdownOptions[0] || null;
        for (var i = 0; i < presetDropdownOptions.length; i++) {
          if (presetDropdownOptions[i].data === pid) return presetDropdownOptions[i];
        }
        return presetDropdownOptions[0] || null;
      },
      [state && state.game_preset_id, presetDropdownOptions],
    );

    var ipsetModeOptions = useMemo(
      function () {
        return ru
          ? [
              { data: "none", label: "none — тестовый IP, без списка" },
              { data: "loaded", label: "loaded — проверка по списку ipset" },
              { data: "any", label: "any — любой IP в фильтре" },
            ]
          : [
              { data: "none", label: "none — test IP, no list" },
              { data: "loaded", label: "loaded — match ipset list" },
              { data: "any", label: "any — every IP filtered" },
            ];
      },
      [ru],
    );

    var selectedIpsetOption = useMemo(
      function () {
        var m = (state && state.ipset_filter_mode) || "none";
        for (var i = 0; i < ipsetModeOptions.length; i++) {
          if (ipsetModeOptions[i].data === m) return ipsetModeOptions[i];
        }
        return ipsetModeOptions[0];
      },
      [state && state.ipset_filter_mode, ipsetModeOptions],
    );

    function runToggleGameFilter() {
      setGfBusy(true);
      toggle_gamefilter()
        .then(setState)
        .catch(function () {
          setState(function (prev) {
            if (!prev) return prev;
            return Object.assign({}, prev, {
              gamefilter_ok: false,
              gamefilter_message: ru ? "Ошибка переключения GameFilter" : "GameFilter toggle failed",
            });
          });
        })
        .finally(function () {
          setGfBusy(false);
        });
    }

    function openGameFilterEnableModal() {
      var warnRu =
        "Фильтр GameFilter — экспериментальная функция. Возможны чёрный экран при переходе в игровой режим, долгая загрузка, проблемы с YouTube и Discord и другие нестабильности. Пользуйтесь на свой страх и риск.";
      var warnEn =
        "GameFilter is experimental. You may see a black screen when switching to Gaming Mode, slow boot, broken YouTube/Discord, or other issues. Use at your own risk.";
      var modal;
      modal = F.showModal(
        e(F.ConfirmModal, {
          strTitle: ru ? "ВНИМАНИЕ!" : "WARNING",
          strDescription: ru ? warnRu : warnEn,
          strOKButtonText: ru ? "Включить" : "Enable",
          strCancelButtonText: ru ? "Отмена" : "Cancel",
          onOK: function () {
            modal.Close();
            runToggleGameFilter();
          },
          closeModal: function () {
            modal.Close();
          },
          onCancel: function () {
            modal.Close();
          },
        }),
      );
    }

    if (!state) {
      return e(F.PanelSection, null,
        e(F.PanelSectionRow, null,
          e("span", { style: Object.assign({}, panelBodyNoIndent, { fontSize: 13 }) }, ru ? "Загрузка…" : "Loading…"),
        ),
      );
    }

    if (state.manager_installed !== true) {
      return e(ManagerInstallHome, {
        ru: ru,
        onInstalled: function () {
          refresh();
        },
      });
    }

    var rows = [
      e(
        F.PanelSectionRow,
        null,
        e(
          "span",
          { style: Object.assign({}, panelBodyNoIndent, { fontSize: 13 }) },
          serviceStatusText(ru, svcKey),
        ),
      ),
      e(
        F.PanelSectionRow,
        null,
        e(
          "span",
          { style: Object.assign({}, panelBodyNoIndent, { fontSize: 13 }) },
          (ru ? "Стратегия: " : "Strategy: ") + (state && state.strategy_label ? state.strategy_label : "—"),
        ),
      ),
    ];

    if (state && state.strategy_detail) {
      rows.push(
        e(
          F.PanelSectionRow,
          null,
          e(
            "span",
            { style: Object.assign({}, panelBodyNoIndent, { fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" }) },
            state.strategy_detail,
          ),
        ),
      );
    }

    if (state) {
      rows.push(
        e(
          F.PanelSectionRow,
          null,
          e("span", { style: Object.assign({}, panelBodyNoIndent, { fontSize: 13 }) }, gameFilterStatusLine(ru, state)),
        ),
      );
    }

    if (state) {
      rows.push(
        e(
          F.PanelSectionRow,
          null,
          e("span", { style: Object.assign({}, panelBodyNoIndent, { fontSize: 13 }) }, ipsetFilterStatusLine(ru, state)),
        ),
      );
    }

    rows.push(e(F.PanelSectionRow, null, e("div", { style: { height: 8 } })));

    var btnLabel = active
      ? ru
        ? "Остановить Zapret DPI"
        : "Stop Zapret DPI"
      : ru
        ? "Включить Zapret DPI"
        : "Enable Zapret DPI";

    rows.push(
      e(F.PanelSectionRow, null,
        e(F.ButtonItem, {
          layout: "below",
          disabled: busy || !state,
          onClick: function () {
            setBusy(true);
            toggle_zapret()
              .then(setState)
              .finally(function () {
                setBusy(false);
              });
          },
        }, btnLabel),
      ),
    );

    rows.push(e(F.PanelSectionRow, null, e("div", { style: { height: 8 } })));

    if (state && state.apply_message != null && state.apply_ok === false) {
      rows.push(
        e(
          F.PanelSectionRow,
          null,
          e(
            "span",
            { style: Object.assign({}, panelBodyNoIndent, { fontSize: 12, color: "#e57373" }) },
            applyErrorText(ru, state.apply_message),
          ),
        ),
      );
    }

    if (state && state.apply_ok === true) {
      rows.push(
        e(
          F.PanelSectionRow,
          null,
          e(
            "span",
            { style: Object.assign({}, panelBodyNoIndent, { fontSize: 12, color: "#81c784" }) },
            ru ? "Стратегия применена, служба перезапущена" : "Strategy applied, service restarted",
          ),
        ),
      );
    }

    if (state && state.gamefilter_message != null && state.gamefilter_ok === false) {
      rows.push(
        e(
          F.PanelSectionRow,
          null,
          e(
            "span",
            { style: Object.assign({}, panelBodyNoIndent, { fontSize: 12, color: "#e57373" }) },
            gamePresetErrorText(ru, state.gamefilter_message),
          ),
        ),
      );
    }

    if (state && state.gamefilter_ok === true) {
      rows.push(
        e(
          F.PanelSectionRow,
          null,
          e(
            "span",
            { style: Object.assign({}, panelBodyNoIndent, { fontSize: 12, color: "#81c784" }) },
            ru
              ? "GameFilter: изменения применены, служба перезапущена"
              : "GameFilter: changes applied, service restarted",
          ),
        ),
      );
    }

    if (dropdownOptions.length > 0) {
      rows.push(
        e(F.PanelSectionRow, null,
          e(F.DropdownItem, {
            label: ru ? "Выбрать стратегию" : "Choose strategy",
            rgOptions: dropdownOptions,
            selectedOption: selectedDropdown,
            disabled: applyBusy,
            strDefaultLabel: ru ? "Выберите стратегию…" : "Choose strategy…",
            renderButtonValue: function (element) {
              return selectedDropdown ? selectedDropdown.label : element;
            },
            onChange: function (opt) {
              var name = opt && opt.data;
              if (!name) return;
              setApplyBusy(true);
              apply_working_strategy(name)
                .then(setState)
                .catch(function () {
                  setState(function (prev) {
                    if (!prev) return prev;
                    return Object.assign({}, prev, {
                      apply_ok: false,
                      apply_message: ru ? "Ошибка применения" : "Apply failed",
                    });
                  });
                })
                .finally(function () {
                  setApplyBusy(false);
                });
            },
          }),
        ),
      );
    } else {
      rows.push(
        e(
          F.PanelSectionRow,
          null,
          e(
            "span",
            { style: Object.assign({}, panelBodyNoIndent, { fontSize: 12, opacity: 0.75, whiteSpace: "pre-wrap" }) },
            emptyHint,
          ),
        ),
      );
    }

    rows.push(e(F.PanelSectionRow, null, e("div", { style: { height: 8 } })));
    rows.push(
      e(F.PanelSectionRow, null,
        e(F.DropdownItem, {
          label: ru ? "Режим GameFilter" : "GameFilter mode",
          rgOptions: presetDropdownOptions,
          selectedOption: selectedPresetOption,
          disabled: gfBusy || !(state && state.game_presets_available),
          strDefaultLabel: ru ? "Включить пресет для игры" : "Enable game preset",
          renderButtonValue: function () {
            if (!selectedPresetOption || selectedPresetOption.data === NONE_PRESET) {
              return ru ? "Включить пресет для игры" : "Enable game preset";
            }
            return selectedPresetOption.label;
          },
          onChange: function (opt) {
            var raw = opt && opt.data;
            if (raw == null) return;
            var preset_id = raw === NONE_PRESET ? null : raw;
            setGfBusy(true);
            set_game_preset(preset_id)
              .then(setState)
              .catch(function () {
                setState(function (prev) {
                  if (!prev) return prev;
                  return Object.assign({}, prev, {
                    gamefilter_ok: false,
                    gamefilter_message: ru ? "Ошибка применения пресета" : "Preset apply failed",
                  });
                });
              })
              .finally(function () {
                setGfBusy(false);
              });
          },
        }),
      ),
    );
    if (state && !state.game_presets_available) {
      rows.push(
        e(
          F.PanelSectionRow,
          null,
          e(
            "span",
            { style: Object.assign({}, panelBodyNoIndent, { fontSize: 11, opacity: 0.7, whiteSpace: "pre-wrap" }) },
            ru
              ? "Пресеты недоступны: не найден core/game_presets.py в каталоге Zapret DPI Manager."
              : "Presets unavailable: core/game_presets.py not found in Zapret DPI Manager.",
          ),
        ),
      );
    }
    rows.push(
      e(F.PanelSectionRow, null,
        e(F.ButtonItem, {
          layout: "below",
          disabled: gfBusy || !state,
          onClick: function () {
            if (state && state.gamefilter_enabled) runToggleGameFilter();
            else openGameFilterEnableModal();
          },
        },
          state && state.gamefilter_enabled
            ? ru
              ? "Отключить GameFilter"
              : "Disable GameFilter"
            : ru
              ? "Включить GameFilter"
              : "Enable GameFilter",
        ),
      ),
    );
    rows.push(
      e(
        F.PanelSectionRow,
        null,
        e(
          "span",
          { style: Object.assign({}, panelBodyNoIndent, { fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" }) },
          ru
            ? "Выберите один из вариантов работы GameFilter:\n• с пресетом для игры\n• просто включить фильтр"
            : "Choose one of the ways to use GameFilter:\n• with a game preset\n• enable the filter only",
        ),
      ),
    );

    rows.push(e(F.PanelSectionRow, null, e("div", { style: { height: 8 } })));
    rows.push(
      e(F.PanelSectionRow, null,
        e(F.DropdownItem, {
          label: ru ? "Режим IPsetFilter" : "IPsetFilter mode",
          rgOptions: ipsetModeOptions,
          selectedOption: selectedIpsetOption,
          disabled: ipsetBusy || !state,
          strDefaultLabel: ru ? "Выберите режим…" : "Choose mode…",
          renderButtonValue: function (element) {
            return selectedIpsetOption ? selectedIpsetOption.label : element;
          },
          onChange: function (opt) {
            var mode = opt && opt.data;
            if (mode == null || mode === (state && state.ipset_filter_mode)) return;
            setIpsetBusy(true);
            set_ipset_filter_mode(mode)
              .then(setState)
              .catch(function () {
                setState(function (prev) {
                  if (!prev) return prev;
                  return Object.assign({}, prev, {
                    ipset_ok: false,
                    ipset_message: ru ? "Ошибка применения IPset" : "IPset apply failed",
                  });
                });
              })
              .finally(function () {
                setIpsetBusy(false);
              });
          },
        }),
      ),
    );
    rows.push(
      e(
        F.PanelSectionRow,
        null,
        e(
          "span",
          { style: Object.assign({}, panelBodyNoIndent, { fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" }) },
          ru
            ? "Полезно, если ресурс без Zapret работает, а с Zapret — нет."
            : "Useful when a site works without Zapret but not with it.",
        ),
      ),
    );
    if (state && state.ipset_message != null && state.ipset_ok === false) {
      rows.push(
        e(
          F.PanelSectionRow,
          null,
          e(
            "span",
            { style: Object.assign({}, panelBodyNoIndent, { fontSize: 12, color: "#e57373" }) },
            ipsetErrorText(ru, state.ipset_message),
          ),
        ),
      );
    }
    if (state && state.ipset_ok === true) {
      rows.push(
        e(
          F.PanelSectionRow,
          null,
          e(
            "span",
            { style: Object.assign({}, panelBodyNoIndent, { fontSize: 12, color: "#81c784" }) },
            ru
              ? "IPsetFilter: режим применён, служба перезапущена"
              : "IPsetFilter: mode applied, service restarted",
          ),
        ),
      );
    }

    return e.apply(null, [F.PanelSection, null].concat(rows));
  }

  /* Title + settings: как DeckyWARP (DialogButton + иконка шестерёнки, здесь SVG ≈ BsGearFill). */
  function TitleView() {
    function openSettings() {
      F.Navigation.CloseSideMenus();
      F.Navigation.Navigate("/deckyzapretdpi/settings/autopicker");
    }
    return e(
      F.Focusable,
      {
        style: {
          display: "flex",
          padding: "0",
          width: "100%",
          boxShadow: "none",
          alignItems: "center",
          justifyContent: "space-between",
        },
        className: F.staticClasses.Title,
      },
      e("div", { style: { marginLeft: 8 } }, "Zapret DPI"),
      e(
        F.DialogButton,
        {
          style: { height: "28px", width: "40px", minWidth: 0, padding: "10px 12px" },
          onClick: openSettings,
        },
        e(
          "svg",
          {
            fill: "currentColor",
            viewBox: "0 0 16 16",
            style: { marginTop: "-4px", display: "block", width: "18px", height: "18px" },
            "aria-hidden": "true",
          },
          e("path", {
            d: "M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z",
          }),
        ),
      ),
    );
  }

  var index = F.definePlugin(function (serverAPI) {
    setServerAPI(serverAPI);

    serverAPI.routerHook.addRoute("/deckyzapretdpi/settings", function () {
      return e(SettingsPageRouter, { serverAPI: serverAPI });
    });

    return {
      titleView: e(TitleView, null),
      content: e(Content, null),
      icon: e("span", { style: { fontSize: 18 } }, "\uD83D\uDEE1"),
    };
  });

  return index;
})(DFL, SP_REACT);
