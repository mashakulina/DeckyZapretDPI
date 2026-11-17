(function (deckyFrontendLib, React) {
  'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  var React__default = /*#__PURE__*/_interopDefaultLegacy(React);

  var DefaultContext = {
    color: undefined,
    size: undefined,
    className: undefined,
    style: undefined,
    attr: undefined
  };
  var IconContext = React__default["default"].createContext && React__default["default"].createContext(DefaultContext);

  var __assign = window && window.__assign || function () {
    __assign = Object.assign || function (t) {
      for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
      }
      return t;
    };
    return __assign.apply(this, arguments);
  };
  var __rest = window && window.__rest || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0) t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function") for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
      if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i])) t[p[i]] = s[p[i]];
    }
    return t;
  };
  function Tree2Element(tree) {
    return tree && tree.map(function (node, i) {
      return React__default["default"].createElement(node.tag, __assign({
        key: i
      }, node.attr), Tree2Element(node.child));
    });
  }
  function GenIcon(data) {
    // eslint-disable-next-line react/display-name
    return function (props) {
      return React__default["default"].createElement(IconBase, __assign({
        attr: __assign({}, data.attr)
      }, props), Tree2Element(data.child));
    };
  }
  function IconBase(props) {
    var elem = function (conf) {
      var attr = props.attr,
        size = props.size,
        title = props.title,
        svgProps = __rest(props, ["attr", "size", "title"]);
      var computedSize = size || conf.size || "1em";
      var className;
      if (conf.className) className = conf.className;
      if (props.className) className = (className ? className + " " : "") + props.className;
      return React__default["default"].createElement("svg", __assign({
        stroke: "currentColor",
        fill: "currentColor",
        strokeWidth: "0"
      }, conf.attr, attr, svgProps, {
        className: className,
        style: __assign(__assign({
          color: props.color || conf.color
        }, conf.style), props.style),
        height: computedSize,
        width: computedSize,
        xmlns: "http://www.w3.org/2000/svg"
      }), title && React__default["default"].createElement("title", null, title), props.children);
    };
    return IconContext !== undefined ? React__default["default"].createElement(IconContext.Consumer, null, function (conf) {
      return elem(conf);
    }) : elem(DefaultContext);
  }

  // THIS FILE IS AUTO GENERATED
  function FaShieldAlt (props) {
    return GenIcon({"tag":"svg","attr":{"viewBox":"0 0 512 512"},"child":[{"tag":"path","attr":{"d":"M466.5 83.7l-192-80a48.15 48.15 0 0 0-36.9 0l-192 80C27.7 91.1 16 108.6 16 128c0 198.5 114.5 335.7 221.5 380.3 11.8 4.9 25.1 4.9 36.9 0C360.1 472.6 496 349.3 496 128c0-19.4-11.7-36.9-29.5-44.3zM256.1 446.3l-.1-381 175.9 73.3c-3.3 151.4-82.1 261.1-175.8 307.7z"}}]})(props);
  }

  // THIS FILE IS AUTO GENERATED
  function BsGearFill (props) {
    return GenIcon({"tag":"svg","attr":{"fill":"currentColor","viewBox":"0 0 16 16"},"child":[{"tag":"path","attr":{"d":"M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"}}]})(props);
  }

  const wrap = { width: "100%", minWidth: 0, overflowWrap: "anywhere", whiteSpace: "normal" };
  function GameFilterPorts({ state, ru, disabled, save, onSaved, onBusyChange, onEditingChange }) {
      const [editing, setEditing] = React.useState(false);
      const [tcp, setTcp] = React.useState("");
      const [udp, setUdp] = React.useState("");
      const [pending, setPending] = React.useState(false);
      const [message, setMessage] = React.useState("");
      const eligible = !!state.gamefilter_enabled && !state.game_preset_id && !!state.gamefilter_ports_available;
      const currentMode = state.gamefilter_protocol_mode || "both";
      // Compare primitive values: fresh polling objects must not invalidate a draft.
      const settingsKey = (settings) => JSON.stringify([
          settings.mode, settings.ports == null, settings.ports?.tcp ?? null,
          settings.ports?.udp ?? null, settings.error ?? null,
      ]);
      const saved = { mode: currentMode, ports: state.gamefilter_custom_ports, error: state.gamefilter_ports_error };
      const [expected, setExpected] = React.useState(saved);
      const stale = editing && settingsKey(saved) !== settingsKey(expected);
      const mode = currentMode;
      const visible = editing && eligible && expected.mode === currentMode;
      const close = () => { setEditing(false); onEditingChange(false); };
      React.useEffect(() => {
          if (!eligible || (editing && expected.mode !== currentMode)) {
              setEditing(false);
              setMessage("");
              onEditingChange(false);
          }
      }, [eligible, currentMode, editing, expected.mode, onEditingChange]);
      React.useEffect(() => () => onEditingChange(false), [onEditingChange]);
      const begin = () => {
          const ports = state.gamefilter_ports_error ? null : state.gamefilter_custom_ports ?? state.gamefilter_default_ports;
          setTcp(ports?.tcp || "");
          setUdp(ports?.udp || "");
          setMessage("");
          setExpected({ ...saved, ports: saved.ports ? { ...saved.ports } : saved.ports });
          onEditingChange(true);
          setEditing(true);
      };
      const apply = async (reset) => {
          if (stale || !visible || pending)
              return;
          setPending(true);
          onBusyChange(true);
          setMessage("");
          try {
              const ports = mode === "both" ? { tcp, udp } : mode === "tcp" ? { tcp } : { udp };
              const result = await save(mode, reset ? null : ports, reset, expected);
              onSaved(result);
              if (result.gamefilter_ok === false)
                  setMessage(result.gamefilter_message || (ru ? "Ошибка сохранения" : "Save failed"));
              else {
                  close();
                  setMessage(ru ? "Порты сохранены" : "Ports saved");
              }
          }
          catch (error) {
              setMessage((ru ? "Ошибка сохранения: " : "Save failed: ") + String(error));
          }
          finally {
              setPending(false);
              onBusyChange(false);
          }
      };
      const display = (protocol) => {
          if (!state.gamefilter_enabled || (currentMode !== "both" && currentMode !== protocol))
              return ru ? "отключён" : "disabled";
          if (state.gamefilter_ports_error)
              return ru ? "ошибка чтения" : "read error";
          const custom = state.gamefilter_custom_ports;
          const value = (custom ?? state.gamefilter_default_ports)?.[protocol];
          const isDefault = !custom || value === state.gamefilter_default_ports?.[protocol];
          return value ? `${value} (${isDefault ? (ru ? "по умолчанию" : "default") : (ru ? "свои" : "custom")})` : (ru ? "недоступно" : "unavailable");
      };
      return window.SP_REACT.createElement(window.SP_REACT.Fragment, null,
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("div", { style: { ...wrap, fontSize: 12 } }, state.game_preset_id && !state.gamefilter_enabled
                  ? (ru ? "Порты задаёт выбранный пресет игры." : "Ports are configured by the selected game preset.")
                  : window.SP_REACT.createElement(window.SP_REACT.Fragment, null,
                      "TCP: ",
                      display("tcp"),
                      window.SP_REACT.createElement("br", null),
                      "UDP: ",
                      display("udp")))),
          !state.gamefilter_ports_available && window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("div", { style: wrap }, ru ? "Редактор портов недоступен. Обновите Zapret DPI Manager." : "Port editing unavailable. Update Zapret DPI Manager.")),
          state.gamefilter_ports_error && window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("div", { style: { ...wrap, color: "#e57373", fontSize: 12 } }, state.gamefilter_ports_error)),
          eligible && !visible && window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", disabled: disabled || pending, onClick: begin }, ru ? "Изменить порты" : "Edit ports")),
          visible && window.SP_REACT.createElement(window.SP_REACT.Fragment, null,
              stale && window.SP_REACT.createElement(window.SP_REACT.Fragment, null,
                  window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
                      window.SP_REACT.createElement("div", { role: "alert", style: wrap }, ru ? "Настройки GameFilter изменились. Черновик сохранён. Загрузите текущие настройки или отмените редактирование." : "GameFilter settings changed. Your draft is preserved. Reload current settings or cancel editing.")),
                  window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
                      window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", disabled: pending, onClick: begin }, ru ? "Загрузить текущие настройки" : "Reload current settings"))),
              (mode === "both" || mode === "tcp") && window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
                  window.SP_REACT.createElement(deckyFrontendLib.TextField, { label: ru ? "Порты TCP" : "TCP ports", description: "443,27000-27100", style: { width: "100%", boxSizing: "border-box" }, value: tcp, disabled: disabled || pending, onChange: (event) => setTcp(event.target.value) })),
              (mode === "both" || mode === "udp") && window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
                  window.SP_REACT.createElement(deckyFrontendLib.TextField, { label: ru ? "Порты UDP" : "UDP ports", description: "443,27000-27100", style: { width: "100%", boxSizing: "border-box" }, value: udp, disabled: disabled || pending, onChange: (event) => setUdp(event.target.value) })),
              window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
                  window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", disabled: disabled || pending || stale, onClick: () => apply(false) }, pending ? (ru ? "Применение…" : "Applying…") : (ru ? "Применить порты" : "Apply ports"))),
              window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
                  window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", disabled: disabled || pending || stale, onClick: () => apply(true) }, ru ? "Порты по умолчанию" : "Reset ports to defaults")),
              window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
                  window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", disabled: pending, onClick: close }, ru ? "Отмена" : "Cancel"))),
          message && window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("div", { role: "status", style: { ...wrap, fontSize: 12 } }, message)));
  }

  const panelBodyNoIndent$3 = {
      display: "block",
      width: "100%",
      margin: 0,
      padding: 0,
      textIndent: 0,
      boxSizing: "border-box",
  };
  function AutopickerTab({ serverAPI }) {
      const ru = navigator.language?.toLowerCase().startsWith("ru");
      const [names, setNames] = React.useState([]);
      const [picked, setPicked] = React.useState({});
      const [busy, setBusy] = React.useState(false);
      const [st, setSt] = React.useState(null);
      const logRef = React.useRef(null);
      const refreshStatus = async () => {
          try {
              const r = await serverAPI.callPluginMethod("get_autopicker_status", {});
              if (r.success)
                  setSt(r.result);
          }
          catch {
              /* ignore */
          }
      };
      const loadNames = async () => {
          try {
              const r = await serverAPI.callPluginMethod("list_strategy_files", {});
              if (r.success && r.result.strategies) {
                  setNames(r.result.strategies);
                  setPicked({});
              }
          }
          catch {
              setNames([]);
          }
      };
      React.useEffect(() => {
          loadNames();
      }, []);
      React.useEffect(() => {
          refreshStatus();
          const id = setInterval(refreshStatus, 2000);
          return () => clearInterval(id);
      }, []);
      React.useEffect(() => {
          const el = logRef.current;
          if (el)
              el.scrollTop = el.scrollHeight;
      }, [st?.log_text]);
      const selectedList = names.filter((n) => picked[n]);
      const start = async (all) => {
          setBusy(true);
          try {
              const strategies = all ? null : selectedList.length > 0 ? selectedList : null;
              const r = await serverAPI.callPluginMethod("start_autopicker", { strategies });
              if (!r.success || !r.result.ok) {
                  setSt((prev) => ({
                      running: false,
                      phase: "error",
                      message: "",
                      error: (r.success ? r.result.detail : "error") || "error",
                      working_count: prev?.working_count ?? 0,
                      mode: "standard",
                      log_text: prev?.log_text,
                  }));
              }
          }
          finally {
              setBusy(false);
              refreshStatus();
          }
      };
      const stop = async () => {
          await serverAPI.callPluginMethod("stop_autopicker", {});
          refreshStatus();
      };
      const running = st?.running === true;
      const statusText = st == null
          ? ""
          : running
              ? ru
                  ? "Идёт тест…"
                  : "Testing…"
              : st.phase === "done"
                  ? ru
                      ? "Тестирование завершено."
                      : "Testing finished."
                  : st.phase === "error"
                      ? `${ru ? "Ошибка" : "Error"}: ${st.error || st.message}`
                      : st.message || (st.phase !== "idle" ? st.phase : "");
      const introRu = "Запустите тестирование всех стратегий, чтобы программа подобрала самые оптимальные стратегии.\nИли можете выбрать конкретные стратегии из списка и запустить автоподбор с выбранными стратегиями. Будут проверены только они.";
      const introEn = "Run testing for all strategies so the program can pick the most suitable ones.\nOr select specific strategies from the list and run auto-selection with those strategies only. Only they will be checked.";
      return (window.SP_REACT.createElement(deckyFrontendLib.PanelSection, null,
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent$3, fontSize: 13, opacity: 0.9, whiteSpace: "pre-wrap" } }, ru ? introRu : introEn)),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", disabled: running || busy, onClick: () => start(true) }, ru ? "Тестировать все стратегии" : "Test all strategies")),
          names.slice(0, 60).map((n) => (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, { key: n },
              window.SP_REACT.createElement(deckyFrontendLib.ToggleField, { label: n, checked: !!picked[n], disabled: running || busy, onChange: (c) => setPicked((p) => ({ ...p, [n]: c })) })))),
          names.length > 60 ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent$3, fontSize: 11, opacity: 0.7 } },
                  "\u2026 ",
                  names.length - 60,
                  " more"))) : null,
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", disabled: running || busy, onClick: () => start(false) }, ru ? "Запустить тест с выбранными стратегиями" : "Run test with selected strategies")),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", disabled: !running, onClick: stop }, ru ? "Остановить тест" : "Stop test")),
          statusText ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent$3, fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" } }, statusText))) : null,
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("div", { style: { ...panelBodyNoIndent$3, width: "100%" } },
                  window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent$3, fontSize: 12, opacity: 0.75, marginBottom: 4 } }, ru ? "Информация об автоподборе" : "Auto-selection information"),
                  window.SP_REACT.createElement("div", { ref: logRef, style: {
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
                      } }, st?.log_text?.length ? st.log_text : ru ? "(пусто — запустите тест)" : "(empty — start a test)")))));
  }

  /** Открыть URL во внешнем браузере (Steam Deck / Big Picture). */
  function openExternalUrl(url) {
      try {
          const sc = window
              .SteamClient;
          sc?.System?.OpenInChrome?.(url);
      }
      catch {
          /* ignore */
      }
      try {
          window.open(url, "_blank");
      }
      catch {
          /* ignore */
      }
  }

  const panelBodyNoIndent$2 = {
      display: "block",
      width: "100%",
      margin: 0,
      padding: 0,
      textIndent: 0,
      boxSizing: "border-box",
  };
  const URL_MANAGER = "https://github.com/mashakulina/Zapret-DPI-for-Steam-Deck";
  const URL_PLUGIN = "https://github.com/mashakulina/DeckyZapretDPI";
  const URL_FLOWSEAL = "https://github.com/Flowseal";
  const URL_IMMALWARE = "https://github.com/ImMALWARE";
  function InfoTab(_props) {
      const ru = navigator.language?.toLowerCase().startsWith("ru");
      const introRu = "Плагин работает совместно с Zapret DPI Manager — графической оболочкой для службы Zapret на Steam Deck.";
      const introEn = "This plugin works together with Zapret DPI Manager — the desktop GUI for the Zapret service on Steam Deck.";
      const flowRu = "Стратегии и некоторые доработки берутся из версии Zapret для Windows (автор Flowseal).";
      const flowEn = "Strategies and some enhancements come from the Windows Zapret project by Flowseal.";
      const malRu = "Служба Zapret DPI основана на разработке ImMALWARE.";
      const malEn = "The Zapret DPI service builds on work by ImMALWARE.";
      return (window.SP_REACT.createElement(deckyFrontendLib.PanelSection, null,
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent$2, fontSize: 13, opacity: 0.9, whiteSpace: "pre-wrap" } }, ru ? introRu : introEn)),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", onClick: () => openExternalUrl(URL_MANAGER) }, ru ? "Zapret DPI Manager (GitHub)" : "Zapret DPI Manager (GitHub)")),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", onClick: () => openExternalUrl(URL_PLUGIN) }, ru ? "Плагин DeckyZapretDPI (GitHub)" : "DeckyZapretDPI plugin (GitHub)")),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: {
                      ...panelBodyNoIndent$2,
                      fontSize: 12,
                      opacity: 0.85,
                      whiteSpace: "pre-wrap",
                      marginTop: 14,
                  } }, ru ? flowRu : flowEn)),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", onClick: () => openExternalUrl(URL_FLOWSEAL) }, "Flowseal (GitHub)")),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: {
                      ...panelBodyNoIndent$2,
                      fontSize: 12,
                      opacity: 0.85,
                      whiteSpace: "pre-wrap",
                      marginTop: 14,
                  } }, ru ? malRu : malEn)),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", onClick: () => openExternalUrl(URL_IMMALWARE) }, "ImMALWARE (GitHub)"))));
  }

  const panelBodyNoIndent$1 = {
      display: "block",
      width: "100%",
      margin: 0,
      padding: 0,
      textIndent: 0,
      boxSizing: "border-box",
  };
  function UpdatesTab({ serverAPI }) {
      const ru = navigator.language?.toLowerCase().startsWith("ru");
      const [localVer, setLocalVer] = React.useState("");
      const [localErr, setLocalErr] = React.useState(null);
      const [checkResult, setCheckResult] = React.useState(null);
      const [checkBusy, setCheckBusy] = React.useState(false);
      const [installBusy, setInstallBusy] = React.useState(false);
      const loadLocal = React.useCallback(async () => {
          try {
              const r = await serverAPI.callPluginMethod("get_plugin_version", {});
              if (r.success && r.result) {
                  if (r.result.ok) {
                      setLocalVer(r.result.current_version);
                      setLocalErr(null);
                  }
                  else {
                      setLocalVer("");
                      setLocalErr(r.result.error || r.result.error_code || "error");
                  }
              }
          }
          catch {
              setLocalVer("");
              setLocalErr(ru ? "Не удалось прочитать версию" : "Could not read version");
          }
      }, [serverAPI, ru]);
      React.useEffect(() => {
          void loadLocal();
      }, [loadLocal]);
      const runCheck = async () => {
          setCheckBusy(true);
          setCheckResult(null);
          try {
              const r = await serverAPI.callPluginMethod("check_plugin_updates", {});
              if (r.success && r.result) {
                  setCheckResult(r.result);
                  await loadLocal();
              }
              else {
                  setCheckResult({
                      status: "error",
                      detail: ru ? "Не удалось вызвать проверку обновлений" : "Could not run update check",
                  });
              }
          }
          catch {
              setCheckResult({
                  status: "error",
                  detail: ru ? "Сеть или плагин недоступны" : "Network or plugin unavailable",
              });
          }
          finally {
              setCheckBusy(false);
          }
      };
      const runInstall = async () => {
          setInstallBusy(true);
          try {
              const r = await serverAPI.callPluginMethod("update_plugin", {});
              if (r.success && r.result?.status) {
                  const s = r.result.status;
                  if (s === "update_started" || s === "update_started_with_sudo") {
                      serverAPI.toaster.toast({
                          title: ru ? "Zapret DPI" : "Zapret DPI",
                          body: ru
                              ? "Обновление запущено. Плагин скоро перезапустится."
                              : "Update started. The plugin will restart shortly.",
                      });
                  }
                  else if (s.startsWith("update_failed")) {
                      setCheckResult((prev) => ({
                          status: "error",
                          detail: s,
                          latest: prev?.latest,
                          current: prev?.current,
                      }));
                  }
              }
          }
          catch (e) {
              setCheckResult((prev) => ({
                  status: "error",
                  detail: String(e),
                  latest: prev?.latest,
                  current: prev?.current,
              }));
          }
          finally {
              setInstallBusy(false);
          }
      };
      const onPrimaryClick = () => {
          if (checkResult?.status === "update_available") {
              void runInstall();
          }
          else {
              void runCheck();
          }
      };
      const primaryLabel = () => {
          if (installBusy)
              return ru ? "Установка…" : "Installing…";
          if (checkBusy)
              return ru ? "Проверяем…" : "Checking…";
          if (checkResult?.status === "update_available") {
              return ru ? "Установить обновление" : "Install update";
          }
          return ru ? "Проверить обновления" : "Check for updates";
      };
      const statusText = () => {
          if (!checkResult)
              return "";
          if (checkResult.status === "checking")
              return ru ? "Проверка…" : "Checking…";
          if (checkResult.status === "error") {
              return `${ru ? "Ошибка" : "Error"}: ${checkResult.detail || ""}`;
          }
          if (checkResult.status === "up_to_date") {
              return ru
                  ? "У вас уже установлена актуальная версия плагина."
                  : "You already have the latest version of the plugin.";
          }
          if (checkResult.status === "update_available") {
              const v = checkResult.latest ? ` (${checkResult.latest})` : "";
              return ru ? `Доступна новая версия${v}.` : `A new version is available${v}.`;
          }
          return "";
      };
      const showStatusBlock = checkResult && checkResult.status !== "checking";
      const showChangelog = checkResult?.status === "update_available" &&
          typeof checkResult.changelog === "string" &&
          checkResult.changelog.length > 0;
      return (window.SP_REACT.createElement(deckyFrontendLib.PanelSection, null,
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent$1, fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" } },
                  ru ? "Версия плагина:" : "Plugin version:",
                  " ",
                  localErr ? (window.SP_REACT.createElement("span", { style: { color: "#e57373" } }, localErr)) : (window.SP_REACT.createElement("span", { style: { fontWeight: 500 } }, localVer || "—")))),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", disabled: checkBusy || installBusy, onClick: () => void onPrimaryClick() }, primaryLabel())),
          showStatusBlock ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: {
                      ...panelBodyNoIndent$1,
                      marginTop: 14,
                      fontSize: 12,
                      opacity: 0.85,
                      whiteSpace: "pre-wrap",
                  } }, statusText()))) : null,
          showChangelog ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("div", { style: {
                      marginTop: 8,
                      maxHeight: 220,
                      overflowY: "auto",
                      width: "100%",
                      fontSize: 12,
                      opacity: 0.9,
                  } },
                  window.SP_REACT.createElement("pre", { style: { whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" } }, checkResult.changelog)))) : null));
  }

  const ru = navigator.language?.toLowerCase().startsWith("ru");
  function SettingsPageRouter({ serverAPI }) {
      return (window.SP_REACT.createElement(deckyFrontendLib.SidebarNavigation, { pages: [
              {
                  title: ru ? "Автоподбор стратегий" : "Strategy auto-pick",
                  route: "/deckyzapretdpi/settings/autopicker",
                  content: window.SP_REACT.createElement(AutopickerTab, { serverAPI: serverAPI }),
              },
              {
                  title: ru ? "Обновление" : "Updates",
                  route: "/deckyzapretdpi/settings/updates",
                  content: window.SP_REACT.createElement(UpdatesTab, { serverAPI: serverAPI }),
              },
              {
                  title: ru ? "Информация" : "Information",
                  route: "/deckyzapretdpi/settings/info",
                  content: window.SP_REACT.createElement(InfoTab, { serverAPI: serverAPI }),
              },
          ] }));
  }

  /** Сброс абзацного отступа у поясняющего текста в строках панели. */
  const panelBodyNoIndent = {
      display: "block",
      width: "100%",
      margin: 0,
      padding: 0,
      textIndent: 0,
      boxSizing: "border-box",
      minWidth: 0,
      overflowWrap: "anywhere",
  };
  let api;
  const setServerAPI = (s) => (api = s);
  async function call(name, params = {}) {
      const r = await api.callPluginMethod(name, params);
      if (r.success)
          return r.result;
      throw r.result;
  }
  const get_zapret_state = () => call("get_zapret_state", {});
  const toggle_zapret = () => call("toggle_zapret", {});
  const apply_working_strategy = (strategy_name) => call("apply_working_strategy", { strategy_name });
  const toggle_gamefilter = (params) => call("toggle_gamefilter", params ?? {});
  const set_gamefilter_protocol_mode = (mode) => call("set_gamefilter_protocol_mode", { mode });
  const set_game_preset = (preset_id) => call("set_game_preset", { preset_id });
  const list_game_presets = () => call("list_game_presets", {});
  const set_ipset_filter_mode = (mode) => call("set_ipset_filter_mode", { mode });
  function serviceStatusText(ru, active) {
      const ruMap = {
          active: "Служба Zapret: запущена",
          inactive: "Служба Zapret: остановлена",
          failed: "Служба Zapret: ошибка (failed)",
          activating: "Служба Zapret: запускается…",
          deactivating: "Служба Zapret: останавливается…",
          unknown: "Служба Zapret: неизвестно",
      };
      const enMap = {
          active: "Zapret service: running",
          inactive: "Zapret service: stopped",
          failed: "Zapret service: failed",
          activating: "Zapret service: starting…",
          deactivating: "Zapret service: stopping…",
          unknown: "Zapret service: unknown",
      };
      return (ru ? ruMap : enMap)[active] ?? (ru ? ruMap.unknown : enMap.unknown);
  }
  function applyErrorText(ru, code) {
      const ruM = {
          invalid_name: "Некорректное имя стратегии",
          not_in_working_list: "Стратегия не в списке проверенных",
          file_not_found: "Файл стратегии не найден",
      };
      const enM = {
          invalid_name: "Invalid strategy name",
          not_in_working_list: "Strategy not in verified list",
          file_not_found: "Strategy file not found",
      };
      const m = ru ? ruM : enM;
      if (code in m)
          return m[code];
      if (code === "systemctl failed")
          return ru ? "Не удалось перезапустить службу" : "Could not restart service";
      return code.length > 80 ? code.slice(0, 80) + "…" : code;
  }
  function gamePresetErrorText(ru, code) {
      const ruM = {
          game_presets_unavailable: "Модуль пресетов недоступен (проверьте Zapret DPI Manager)",
          invalid_preset: "Неизвестный пресет",
          gamefilter_disabled: "Сначала включите GameFilter",
      };
      const enM = {
          game_presets_unavailable: "Game presets unavailable (check Zapret DPI Manager)",
          invalid_preset: "Unknown preset",
          gamefilter_disabled: "Turn on GameFilter first",
      };
      const m = ru ? ruM : enM;
      if (code in m)
          return m[code];
      if (code === "systemctl failed")
          return ru ? "Не удалось перезапустить службу" : "Could not restart service";
      return code.length > 80 ? code.slice(0, 80) + "…" : code;
  }
  function gameFilterProtocolSuffix(ru, m) {
      const mode = (m || "both").toLowerCase();
      if (mode === "tcp")
          return ru ? " · только TCP" : " · TCP only";
      if (mode === "udp")
          return ru ? " · только UDP" : " · UDP only";
      return ru ? " · TCP и UDP" : " · TCP and UDP";
  }
  function gameFilterStatusLine(ru, s) {
      const prefix = ru ? "GameFilter: " : "GameFilter: ";
      const suf = s.gamefilter_enabled ? gameFilterProtocolSuffix(ru, s.gamefilter_protocol_mode) : "";
      if (s.game_preset_id)
          return prefix + (s.game_preset_name || s.game_preset_id) + suf;
      if (s.gamefilter_enabled)
          return prefix + (ru ? "включено" : "enabled") + suf;
      return prefix + (ru ? "отключено" : "disabled");
  }
  function ipsetFilterStatusLine(_ru, s) {
      const m = s.ipset_filter_mode || "none";
      return `IPsetFilter: ${m}`;
  }
  function ipsetErrorText(ru, code) {
      const ruM = {
          invalid_ipset_mode: "Некорректный режим IPset",
          ipset_utils_missing: "Нет файла utils/ipset-all.txt (нужен для loaded)",
      };
      const enM = {
          invalid_ipset_mode: "Invalid IPset mode",
          ipset_utils_missing: "utils/ipset-all.txt missing (required for loaded)",
      };
      const m = ru ? ruM : enM;
      if (code in m)
          return m[code];
      if (code === "systemctl failed")
          return ru ? "Не удалось перезапустить службу" : "Could not restart service";
      return code.length > 80 ? code.slice(0, 80) + "…" : code;
  }
  const NONE_PRESET = "none";
  /** Совпадает с preset_id в game_presets.py менеджера; текст окна только в плагине. */
  const FALL_GUYS_PRESET_ID = "fall_guys";
  const FALL_GUYS_PRESET_INFO_RU = "Данный пресет применяется для игры из Epic Games Store. Для игры из Steam в настройках игры смените регион на США (восток).";
  const FALL_GUYS_PRESET_INFO_EN = "This preset applies to the Epic Games Store version. For the Steam version, set the in-game region to USA (East).";
  const GF_POWER_OFF = "off";
  /** Предупреждение перед первым включением GameFilter (режим уже выбран в выпадающем списке). */
  function openGameFilterEnableWarningModal(ru, onConfirm) {
      const warnRu = "Фильтр GameFilter — экспериментальная функция. Возможны чёрный экран при переходе в игровой режим, долгая загрузка, проблемы с YouTube и Discord и другие нестабильности. Пользуйтесь на свой страх и риск.";
      const warnEn = "GameFilter is experimental. You may see a black screen when switching to Gaming Mode, slow boot, broken YouTube/Discord, or other issues. Use at your own risk.";
      let modal;
      modal = deckyFrontendLib.showModal(window.SP_REACT.createElement(deckyFrontendLib.ConfirmModal, { strTitle: ru ? "ВНИМАНИЕ!" : "WARNING", strDescription: ru ? warnRu : warnEn, strOKButtonText: ru ? "Включить" : "Enable", strCancelButtonText: ru ? "Отмена" : "Cancel", onOK: () => {
              modal.Close();
              window.setTimeout(onConfirm, 150);
          }, closeModal: () => modal.Close(), onCancel: () => modal.Close() }));
  }
  function openFallGuysPresetInfoModal(ru) {
      const title = ru ? "Пресет Fall Guys" : "Fall Guys preset";
      let modal;
      modal = deckyFrontendLib.showModal(window.SP_REACT.createElement(deckyFrontendLib.ConfirmModal, { bAlertDialog: true, strTitle: title, strDescription: ru ? FALL_GUYS_PRESET_INFO_RU : FALL_GUYS_PRESET_INFO_EN, strOKButtonText: ru ? "Понятно" : "OK", onOK: () => modal.Close(), closeModal: () => modal.Close() }), undefined, {
          strTitle: title,
          popupWidth: 440,
          popupHeight: 260,
      });
  }
  /** Главный экран: установка менеджера вместо кнопок службы, пока приложение не установлено. */
  function ManagerInstallHome({ ru, onInstalled }) {
      const [busy, setBusy] = React.useState(false);
      const [lastDetail, setLastDetail] = React.useState(null);
      const pollRef = React.useRef(null);
      const clearPoll = React.useCallback(() => {
          if (pollRef.current != null) {
              clearInterval(pollRef.current);
              pollRef.current = null;
          }
      }, []);
      React.useEffect(() => () => clearPoll(), [clearPoll]);
      const startPolling = React.useCallback(() => {
          clearPoll();
          let n = 0;
          pollRef.current = setInterval(() => {
              n += 1;
              if (n > 90) {
                  clearPoll();
                  return;
              }
              void api
                  .callPluginMethod("get_zapret_state", {})
                  .then((r) => {
                  if (r.success && r.result?.manager_installed === true) {
                      clearPoll();
                      onInstalled();
                  }
              })
                  .catch(() => { });
          }, 4000);
      }, [clearPoll, onInstalled]);
      const runInstall = async () => {
          setBusy(true);
          setLastDetail(null);
          try {
              const r = await api.callPluginMethod("install_zapret_dpi_manager", {});
              if (r.success && r.result) {
                  const st = r.result.status;
                  if (st === "already_installed") {
                      api.toaster.toast({
                          title: window.SP_REACT.createElement("span", null, "Zapret DPI"),
                          body: ru ? "Zapret DPI Manager уже установлен." : "Zapret DPI Manager is already installed.",
                      });
                      onInstalled();
                  }
                  else if (st === "started") {
                      api.toaster.toast({
                          title: window.SP_REACT.createElement("span", null, "Zapret DPI"),
                          body: ru
                              ? "Установка запущена в фоне. Подождите несколько минут. Если не появится — откройте лог /tmp/deckyzapretdpi_manager_install.log в режиме рабочего стола или установите менеджер вручную с GitHub."
                              : "Installation started in the background. Wait a few minutes. If nothing changes, open /tmp/deckyzapretdpi_manager_install.log in Desktop mode or install the manager manually from GitHub.",
                      });
                      startPolling();
                  }
                  else {
                      const d = r.result.detail || "error";
                      setLastDetail(d);
                      const lr = await api.callPluginMethod("get_manager_install_log_tail", {});
                      if (lr.success && lr.result?.tail?.trim()) {
                          setLastDetail(`${d}\n---\n${lr.result.tail}`);
                      }
                  }
              }
              else {
                  setLastDetail(ru ? "Вызов установки не удался" : "Install call failed");
              }
          }
          catch (e) {
              setLastDetail(String(e));
          }
          finally {
              setBusy(false);
          }
      };
      return (window.SP_REACT.createElement(deckyFrontendLib.PanelSection, null,
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" } }, ru
                  ? "Zapret DPI Manager не установлен (нужен каталог /home/deck/Zapret_DPI_Manager с приложением). Установите его кнопкой ниже или вручную с GitHub — затем здесь появятся кнопки управления службой и стратегиями."
                  : "Zapret DPI Manager is not installed (expected at /home/deck/Zapret_DPI_Manager). Install with the button below or manually from GitHub — then service and strategy controls will appear here.")),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", disabled: busy, onClick: () => void runInstall() }, busy
                  ? ru
                      ? "Запуск…"
                      : "Starting…"
                  : ru
                      ? "Установить Zapret DPI Manager"
                      : "Install Zapret DPI Manager")),
          lastDetail ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, marginTop: 12, fontSize: 11, color: "#e57373", whiteSpace: "pre-wrap" } }, lastDetail))) : null));
  }
  /** Экран установки службы zapret (аналог ManagerInstallHome), пока служба не установлена. */
  function ZapretServiceInstallHome({ ru, onInstalled }) {
      const [busy, setBusy] = React.useState(false);
      const [lastDetail, setLastDetail] = React.useState(null);
      const pollRef = React.useRef(null);
      const clearPoll = React.useCallback(() => {
          if (pollRef.current != null) {
              clearInterval(pollRef.current);
              pollRef.current = null;
          }
      }, []);
      React.useEffect(() => () => clearPoll(), [clearPoll]);
      const startPolling = React.useCallback(() => {
          clearPoll();
          let n = 0;
          pollRef.current = setInterval(() => {
              n += 1;
              if (n > 90) {
                  clearPoll();
                  return;
              }
              void api
                  .callPluginMethod("get_zapret_state", {})
                  .then((r) => {
                  if (r.success && r.result?.zapret_service_installed === true) {
                      clearPoll();
                      onInstalled();
                  }
              })
                  .catch(() => { });
          }, 4000);
      }, [clearPoll, onInstalled]);
      const runInstall = async () => {
          setBusy(true);
          setLastDetail(null);
          try {
              const r = await api.callPluginMethod("install_zapret_service", {});
              if (r.success && r.result) {
                  const st = r.result.status;
                  if (st === "already_installed") {
                      api.toaster.toast({
                          title: window.SP_REACT.createElement("span", null, "Zapret DPI"),
                          body: ru ? "Служба Zapret уже установлена." : "Zapret service is already installed.",
                      });
                      onInstalled();
                  }
                  else if (st === "started") {
                      api.toaster.toast({
                          title: window.SP_REACT.createElement("span", null, "Zapret DPI"),
                          body: ru
                              ? "Установка службы запущена в фоне. Подождите. Лог: /tmp/deckyzapretdpi_zapret_install.log (режим рабочего стола)."
                              : "Service install started in the background. Wait. Log: /tmp/deckyzapretdpi_zapret_install.log (Desktop mode).",
                      });
                      startPolling();
                  }
                  else {
                      const d = r.result.detail || "error";
                      setLastDetail(d);
                      const lr = await api.callPluginMethod("get_zapret_service_install_log_tail", {});
                      if (lr.success && lr.result?.tail?.trim()) {
                          setLastDetail(`${d}\n---\n${lr.result.tail}`);
                      }
                  }
              }
              else {
                  setLastDetail(ru ? "Вызов установки не удался" : "Install call failed");
              }
          }
          catch (e) {
              setLastDetail(String(e));
          }
          finally {
              setBusy(false);
          }
      };
      return (window.SP_REACT.createElement(deckyFrontendLib.PanelSection, null,
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" } }, ru
                  ? "Служба Zapret не установлена. Установите кнопкой ниже или через Zapret DPI Manager на рабочем столе."
                  : "Zapret service is not installed. Install with the button below or use Zapret DPI Manager on the desktop.")),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", disabled: busy, onClick: () => void runInstall() }, busy
                  ? ru
                      ? "Запуск…"
                      : "Starting…"
                  : ru
                      ? "Установить службу Zapret DPI"
                      : "Install Zapret DPI service")),
          lastDetail ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, marginTop: 12, fontSize: 11, color: "#e57373", whiteSpace: "pre-wrap" } }, lastDetail))) : null));
  }
  const Content = () => {
      const ru = navigator.language?.toLowerCase().startsWith("ru");
      const [state, setState] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [applyBusy, setApplyBusy] = React.useState(false);
      const [gfBusy, setGfBusy] = React.useState(false);
      const [gfEditing, setGfEditing] = React.useState(false);
      const [ipsetBusy, setIpsetBusy] = React.useState(false);
      const [gamePresets, setGamePresets] = React.useState([]);
      const refresh = async () => {
          try {
              const [nextState, presetsRes] = await Promise.all([get_zapret_state(), list_game_presets()]);
              setState(nextState);
              setGamePresets(presetsRes.presets ?? []);
          }
          catch {
              setState({
                  service: "unknown",
                  service_active: false,
                  strategy_label: ru ? "Не удалось прочитать состояние" : "Could not read state",
                  strategy_detail: "",
                  manager_path: "",
                  manager_installed: false,
                  zapret_service_installed: false,
                  working_strategies: [],
                  gamefilter_enabled: false,
                  game_preset_id: null,
                  game_preset_name: null,
                  game_presets_available: false,
                  gamefilter_protocol_mode: "both",
                  ipset_filter_mode: "none",
              });
          }
      };
      React.useEffect(() => {
          refresh();
          const id = setInterval(refresh, 3000);
          return () => clearInterval(id);
      }, []);
      const active = state?.service === "active";
      const svcKey = state?.service === "active"
          ? "active"
          : state?.service === "inactive"
              ? "inactive"
              : state?.service === "failed"
                  ? "failed"
                  : state?.service === "activating"
                      ? "activating"
                      : state?.service === "deactivating"
                          ? "deactivating"
                          : "unknown";
      const dropdownOptions = React.useMemo(() => {
          const names = state?.working_strategies ?? [];
          return names.map((name) => ({ data: name, label: name }));
      }, [state?.working_strategies]);
      const selectedDropdown = React.useMemo(() => {
          const label = state?.strategy_label;
          if (!label || label === "Не выбрано" || label === "Custom Strategy")
              return null;
          const found = dropdownOptions.find((o) => o.data === label);
          return found ?? null;
      }, [state?.strategy_label, dropdownOptions]);
      const emptyHint = ru
          ? "Список пуст. Откройте настройки плагина (шестерёнка) → «Автоподбор стратегий» и запустите автоподбор, как в Zapret DPI Manager."
          : "List is empty. Open plugin settings (gear) → “Strategy auto-pick” and run auto-pick, same as in Zapret DPI Manager.";
      const presetDropdownOptions = React.useMemo(() => {
          const noneLabel = ru ? "Не выбран" : "None";
          const head = [{ data: NONE_PRESET, label: noneLabel }];
          const tail = gamePresets.map((p) => ({ data: p.id, label: p.name }));
          if (state?.game_preset_id && !tail.some((p) => p.data === state.game_preset_id)) {
              tail.push({ data: state.game_preset_id, label: state.game_preset_name || state.game_preset_id });
          }
          return head.concat(tail);
      }, [ru, gamePresets, state?.game_preset_id, state?.game_preset_name]);
      const selectedPresetOption = React.useMemo(() => {
          const pid = state?.game_preset_id;
          if (!pid)
              return presetDropdownOptions[0] ?? null;
          const hit = presetDropdownOptions.find((o) => o.data === pid);
          return hit ?? { data: pid, label: state?.game_preset_name || pid };
      }, [state?.game_preset_id, presetDropdownOptions]);
      const ipsetModeOptions = React.useMemo(() => ru
          ? [
              { data: "none", label: "none" },
              { data: "loaded", label: "loaded" },
              { data: "any", label: "any" },
          ]
          : [
              { data: "none", label: "none" },
              { data: "loaded", label: "loaded" },
              { data: "any", label: "any" },
          ], [ru]);
      const selectedIpsetOption = React.useMemo(() => {
          const m = state?.ipset_filter_mode || "none";
          const hit = ipsetModeOptions.find((o) => o.data === m);
          return hit ?? ipsetModeOptions[0];
      }, [state?.ipset_filter_mode, ipsetModeOptions]);
      const gfPowerDropdownOptions = React.useMemo(() => ru
          ? [
              { data: GF_POWER_OFF, label: "Выключено" },
              { data: "both", label: "Включено · TCP и UDP" },
              { data: "tcp", label: "Включено · только TCP" },
              { data: "udp", label: "Включено · только UDP" },
          ]
          : [
              { data: GF_POWER_OFF, label: "Off" },
              { data: "both", label: "On · TCP and UDP" },
              { data: "tcp", label: "On · TCP only" },
              { data: "udp", label: "On · UDP only" },
          ], [ru]);
      const selectedGfPowerOption = React.useMemo(() => {
          if (!state?.gamefilter_enabled) {
              return gfPowerDropdownOptions.find((o) => o.data === GF_POWER_OFF) ?? gfPowerDropdownOptions[0];
          }
          const m = (state.gamefilter_protocol_mode || "both").toLowerCase();
          const hit = gfPowerDropdownOptions.find((o) => o.data === m);
          return hit ?? gfPowerDropdownOptions[1];
      }, [state?.gamefilter_enabled, state?.gamefilter_protocol_mode, gfPowerDropdownOptions]);
      const runToggleGameFilterOff = () => {
          setGfBusy(true);
          toggle_gamefilter({})
              .then(setState)
              .catch(() => setState((prev) => prev
              ? {
                  ...prev,
                  gamefilter_ok: false,
                  gamefilter_message: ru ? "Ошибка переключения GameFilter" : "GameFilter toggle failed",
              }
              : prev))
              .finally(() => setGfBusy(false));
      };
      const runEnableGameFilterWithProtocol = (mode) => {
          setGfBusy(true);
          toggle_gamefilter({ protocol_mode: mode })
              .then(setState)
              .catch(() => setState((prev) => prev
              ? {
                  ...prev,
                  gamefilter_ok: false,
                  gamefilter_message: ru ? "Ошибка переключения GameFilter" : "GameFilter toggle failed",
              }
              : prev))
              .finally(() => setGfBusy(false));
      };
      if (!state) {
          return (window.SP_REACT.createElement(deckyFrontendLib.PanelSection, null,
              window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
                  window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 13 } }, ru ? "Загрузка…" : "Loading…"))));
      }
      if (state.manager_installed !== true) {
          return window.SP_REACT.createElement(ManagerInstallHome, { ru: ru, onInstalled: () => void refresh() });
      }
      if (state.zapret_service_installed !== true) {
          return window.SP_REACT.createElement(ZapretServiceInstallHome, { ru: ru, onInstalled: () => void refresh() });
      }
      return (window.SP_REACT.createElement(deckyFrontendLib.PanelSection, null,
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 13 } }, serviceStatusText(ru, svcKey))),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 13 } },
                  ru ? "Стратегия: " : "Strategy: ",
                  state?.strategy_label ?? "—")),
          state?.strategy_detail ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" } }, state.strategy_detail))) : null,
          state ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 13 } }, gameFilterStatusLine(ru, state)))) : null,
          state ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 13 } }, ipsetFilterStatusLine(ru, state)))) : null,
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("div", { style: { height: 8 } })),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.ButtonItem, { layout: "below", disabled: busy || !state, onClick: async () => {
                      setBusy(true);
                      try {
                          setState(await toggle_zapret());
                      }
                      finally {
                          setBusy(false);
                      }
                  } }, active
                  ? ru
                      ? "Остановить Zapret DPI"
                      : "Stop Zapret DPI"
                  : ru
                      ? "Включить Zapret DPI"
                      : "Enable Zapret DPI")),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("div", { style: { height: 8 } })),
          state?.apply_message != null && state.apply_ok === false ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 12, color: "#e57373" } }, applyErrorText(ru, state.apply_message)))) : null,
          state?.apply_ok === true ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 12, color: "#81c784" } }, ru ? "Стратегия применена, служба перезапущена" : "Strategy applied, service restarted"))) : null,
          state?.gamefilter_message != null && state.gamefilter_ok === false ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 12, color: "#e57373" } }, gamePresetErrorText(ru, state.gamefilter_message)))) : null,
          state?.gamefilter_ok === true ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 12, color: "#81c784" } }, ru ? "GameFilter: изменения применены, служба перезапущена" : "GameFilter: changes applied, service restarted"))) : null,
          dropdownOptions.length > 0 ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.DropdownItem, { layout: "below", label: ru ? "Выбрать стратегию" : "Choose strategy", rgOptions: dropdownOptions, selectedOption: selectedDropdown?.data, disabled: applyBusy, strDefaultLabel: ru ? "Выберите стратегию…" : "Choose strategy…", renderButtonValue: (element) => (selectedDropdown ? selectedDropdown.label : element), onChange: async (opt) => {
                      const name = opt?.data;
                      if (!name)
                          return;
                      setApplyBusy(true);
                      try {
                          const next = await apply_working_strategy(name);
                          setState(next);
                      }
                      catch {
                          setState((prev) => prev
                              ? {
                                  ...prev,
                                  apply_ok: false,
                                  apply_message: ru ? "Ошибка применения" : "Apply failed",
                              }
                              : prev);
                      }
                      finally {
                          setApplyBusy(false);
                      }
                  } }))) : (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 12, opacity: 0.75, whiteSpace: "pre-wrap" } }, emptyHint))),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("div", { style: { height: 8 } })),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.DropdownItem, { layout: "below", label: ru ? "Включить GameFilter" : "Enable GameFilter", rgOptions: gfPowerDropdownOptions, selectedOption: selectedGfPowerOption?.data, disabled: gfBusy || !state, strDefaultLabel: ru ? "Выберите режим…" : "Choose mode…", renderButtonValue: (element) => selectedGfPowerOption ? selectedGfPowerOption.label : element, onChange: async (opt) => {
                      const raw = opt?.data;
                      if (raw == null)
                          return;
                      if (raw === GF_POWER_OFF) {
                          if (state?.gamefilter_enabled)
                              runToggleGameFilterOff();
                          return;
                      }
                      if (raw !== "both" && raw !== "tcp" && raw !== "udp")
                          return;
                      const mode = raw;
                      if (!state?.gamefilter_enabled) {
                          openGameFilterEnableWarningModal(ru, () => runEnableGameFilterWithProtocol(mode));
                          return;
                      }
                      const cur = (state.gamefilter_protocol_mode || "both").toLowerCase();
                      if (raw.toLowerCase() === cur)
                          return;
                      setGfBusy(true);
                      try {
                          const custom = state.gamefilter_custom_ports;
                          const protocols = mode === "both" ? ["tcp", "udp"] : [mode];
                          const needsDefaults = custom && protocols.some((protocol) => !custom[protocol]);
                          const ports = Object.fromEntries(protocols.map((protocol) => [
                              protocol, custom?.[protocol] || state.gamefilter_default_ports?.[protocol] || "",
                          ]));
                          const next = needsDefaults
                              ? await call("set_gamefilter_ports", {
                                  mode, ports, reset: false,
                                  expected_settings: { mode: cur, ports: custom, error: state.gamefilter_ports_error },
                              })
                              : await set_gamefilter_protocol_mode(raw);
                          setState(next);
                      }
                      catch {
                          setState((prev) => prev
                              ? {
                                  ...prev,
                                  gamefilter_ok: false,
                                  gamefilter_message: ru ? "Не удалось сменить режим" : "Could not change mode",
                              }
                              : prev);
                      }
                      finally {
                          setGfBusy(false);
                      }
                  } })),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 12, opacity: 0.75 } }, ru ? "При смене режима новый протокол начинает со стандартных портов." : "When changing mode, a newly selected protocol starts with default ports.")),
          state && window.SP_REACT.createElement(GameFilterPorts, { state: state, ru: ru, disabled: gfBusy, onSaved: setState, onBusyChange: setGfBusy, onEditingChange: setGfEditing, save: (mode, ports, reset, expected_settings) => call("set_gamefilter_ports", { mode, ports, reset, expected_settings }) }),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.DropdownItem, { layout: "below", label: ru ? "Пресет для игры" : "Game preset", rgOptions: presetDropdownOptions, selectedOption: selectedPresetOption?.data, disabled: gfBusy || gfEditing || !state?.game_presets_available, strDefaultLabel: ru ? "Не выбран" : "None", renderButtonValue: () => {
                      if (!selectedPresetOption || selectedPresetOption.data === NONE_PRESET) {
                          return ru ? "Не выбран" : "None";
                      }
                      return selectedPresetOption.label;
                  }, onChange: async (opt) => {
                      if (gfEditing)
                          return;
                      const raw = opt?.data;
                      if (raw == null)
                          return;
                      const preset_id = raw === NONE_PRESET ? null : raw;
                      setGfBusy(true);
                      try {
                          if (preset_id === FALL_GUYS_PRESET_ID) {
                              openFallGuysPresetInfoModal(ru);
                          }
                          const next = await set_game_preset(preset_id);
                          setState(next);
                      }
                      catch {
                          setState((prev) => prev
                              ? {
                                  ...prev,
                                  gamefilter_ok: false,
                                  gamefilter_message: ru ? "Ошибка применения пресета" : "Preset apply failed",
                              }
                              : prev);
                      }
                      finally {
                          setGfBusy(false);
                      }
                  } })),
          state.game_preset_id && window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 12 } }, selectedPresetOption?.label)),
          !state?.game_presets_available ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 11, opacity: 0.7, whiteSpace: "pre-wrap" } }, ru
                  ? "Пресеты недоступны: не найден core/game_presets.py в каталоге Zapret DPI Manager."
                  : "Presets unavailable: core/game_presets.py not found in Zapret DPI Manager."))) : null,
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" } }, ru
                  ? "Отдельный GameFilter и пресет игры не работают одновременно: при выборе одного второй отключается. Либо включите GameFilter (режим TCP/UDP), либо выберите пресет ниже."
                  : "Standalone GameFilter and a game preset cannot run together—choosing one clears the other. Either enable GameFilter (TCP/UDP) or pick a game preset below.")),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("div", { style: { height: 8 } })),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement(deckyFrontendLib.DropdownItem, { layout: "below", label: ru ? "Режим IPsetFilter" : "IPsetFilter mode", rgOptions: ipsetModeOptions, selectedOption: selectedIpsetOption?.data, disabled: ipsetBusy || !state, strDefaultLabel: ru ? "Выберите режим…" : "Choose mode…", renderButtonValue: (element) => (selectedIpsetOption ? selectedIpsetOption.label : element), onChange: async (opt) => {
                      const mode = opt?.data;
                      if (!mode || mode === state?.ipset_filter_mode)
                          return;
                      setIpsetBusy(true);
                      try {
                          const next = await set_ipset_filter_mode(mode);
                          setState(next);
                      }
                      catch {
                          setState((prev) => prev
                              ? {
                                  ...prev,
                                  ipset_ok: false,
                                  ipset_message: ru ? "Ошибка применения IPset" : "IPset apply failed",
                              }
                              : prev);
                      }
                      finally {
                          setIpsetBusy(false);
                      }
                  } })),
          window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" } }, ru
                  ? "none — тестовый IP, без списка; loaded — проверка по списку ipset; any — любой IP в фильтре. Полезно, если ресурс без Zapret работает, а с Zapret — нет."
                  : "none — test IP, no list; loaded — match ipset list; any — every IP filtered. Useful when a site works without Zapret but not with it.")),
          state?.ipset_message != null && state.ipset_ok === false ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 12, color: "#e57373" } }, ipsetErrorText(ru, state.ipset_message)))) : null,
          state?.ipset_ok === true ? (window.SP_REACT.createElement(deckyFrontendLib.PanelSectionRow, null,
              window.SP_REACT.createElement("span", { style: { ...panelBodyNoIndent, fontSize: 12, color: "#81c784" } }, ru ? "IPsetFilter: режим применён, служба перезапущена" : "IPsetFilter: mode applied, service restarted"))) : null));
  };
  /** Заголовок и шестерёнка как в DeckyWARP (BsGearFill + DialogButton). */
  const TitleView = () => {
      const openSettings = () => {
          deckyFrontendLib.Navigation.CloseSideMenus();
          deckyFrontendLib.Navigation.Navigate("/deckyzapretdpi/settings/autopicker");
      };
      return (window.SP_REACT.createElement(deckyFrontendLib.Focusable, { style: {
              display: "flex",
              padding: "0",
              width: "100%",
              boxShadow: "none",
              alignItems: "center",
              justifyContent: "space-between",
          }, className: deckyFrontendLib.staticClasses.Title },
          window.SP_REACT.createElement("div", { style: { marginLeft: 8 } }, "Zapret DPI"),
          window.SP_REACT.createElement(deckyFrontendLib.DialogButton, { style: { height: "28px", width: "40px", minWidth: 0, padding: "10px 12px" }, onClick: openSettings },
              window.SP_REACT.createElement(BsGearFill, { style: { marginTop: "-4px", display: "block" } }))));
  };
  var index = deckyFrontendLib.definePlugin((serverAPI) => {
      setServerAPI(serverAPI);
      serverAPI.routerHook.addRoute("/deckyzapretdpi/settings", () => (window.SP_REACT.createElement(SettingsPageRouter, { serverAPI: serverAPI })));
      return {
          // Decky temporarily hides QAM for native dropdowns; keep editor drafts mounted.
          alwaysRender: true,
          title: window.SP_REACT.createElement("span", null, "Zapret DPI"),
          titleView: window.SP_REACT.createElement(TitleView, null),
          content: window.SP_REACT.createElement(Content, null),
          icon: window.SP_REACT.createElement(FaShieldAlt, null),
      };
  });

  return index;

})(DFL, SP_REACT);
