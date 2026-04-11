import {
  definePlugin,
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  ServerAPI,
  staticClasses,
  DialogButton,
  Focusable,
  Navigation,
  DropdownItem,
  showModal,
  ConfirmModal,
} from "decky-frontend-lib";
import { FaShieldAlt } from "react-icons/fa";
import { BsGearFill } from "react-icons/bs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import SettingsPageRouter from "./pages/SettingsPageRouter";

/** Сброс абзацного отступа у поясняющего текста в строках панели. */
const panelBodyNoIndent: CSSProperties = {
  display: "block",
  width: "100%",
  margin: 0,
  padding: 0,
  textIndent: 0,
  boxSizing: "border-box",
};

export type ZapretState = {
  service: string;
  service_active: boolean;
  strategy_label: string;
  strategy_detail: string;
  manager_path: string;
  manager_installed?: boolean;
  zapret_service_installed?: boolean;
  working_strategies: string[];
  apply_ok?: boolean;
  apply_message?: string;
  gamefilter_enabled?: boolean;
  game_preset_id?: string | null;
  game_preset_name?: string | null;
  game_presets_available?: boolean;
  gamefilter_ok?: boolean;
  gamefilter_message?: string;
  ipset_filter_mode?: string;
  ipset_ok?: boolean;
  ipset_message?: string;
};

type GamePresetRow = { id: string; name: string };

let api: ServerAPI;
const setServerAPI = (s: ServerAPI) => (api = s);

async function call<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const r = await api.callPluginMethod<T>(name, params);
  if (r.success) return r.result;
  throw r.result;
}

const get_zapret_state = () => call<ZapretState>("get_zapret_state", {});
const toggle_zapret = () => call<ZapretState>("toggle_zapret", {});
const apply_working_strategy = (strategy_name: string) =>
  call<ZapretState>("apply_working_strategy", { strategy_name });
const toggle_gamefilter = () => call<ZapretState>("toggle_gamefilter", {});
const set_game_preset = (preset_id: string | null) =>
  call<ZapretState>("set_game_preset", { preset_id });
const list_game_presets = () => call<{ presets: GamePresetRow[] }>("list_game_presets", {});
const set_ipset_filter_mode = (mode: string) => call<ZapretState>("set_ipset_filter_mode", { mode });

function serviceStatusText(ru: boolean, active: string): string {
  const ruMap: Record<string, string> = {
    active: "Служба Zapret: запущена",
    inactive: "Служба Zapret: остановлена",
    failed: "Служба Zapret: ошибка (failed)",
    activating: "Служба Zapret: запускается…",
    deactivating: "Служба Zapret: останавливается…",
    unknown: "Служба Zapret: неизвестно",
  };
  const enMap: Record<string, string> = {
    active: "Zapret service: running",
    inactive: "Zapret service: stopped",
    failed: "Zapret service: failed",
    activating: "Zapret service: starting…",
    deactivating: "Zapret service: stopping…",
    unknown: "Zapret service: unknown",
  };
  return (ru ? ruMap : enMap)[active] ?? (ru ? ruMap.unknown : enMap.unknown);
}

function applyErrorText(ru: boolean, code: string): string {
  const ruM: Record<string, string> = {
    invalid_name: "Некорректное имя стратегии",
    not_in_working_list: "Стратегия не в списке проверенных",
    file_not_found: "Файл стратегии не найден",
  };
  const enM: Record<string, string> = {
    invalid_name: "Invalid strategy name",
    not_in_working_list: "Strategy not in verified list",
    file_not_found: "Strategy file not found",
  };
  const m = ru ? ruM : enM;
  if (code in m) return m[code];
  if (code === "systemctl failed") return ru ? "Не удалось перезапустить службу" : "Could not restart service";
  return code.length > 80 ? code.slice(0, 80) + "…" : code;
}

function gamePresetErrorText(ru: boolean, code: string): string {
  const ruM: Record<string, string> = {
    game_presets_unavailable: "Модуль пресетов недоступен (проверьте Zapret DPI Manager)",
    invalid_preset: "Неизвестный пресет",
  };
  const enM: Record<string, string> = {
    game_presets_unavailable: "Game presets unavailable (check Zapret DPI Manager)",
    invalid_preset: "Unknown preset",
  };
  const m = ru ? ruM : enM;
  if (code in m) return m[code];
  if (code === "systemctl failed") return ru ? "Не удалось перезапустить службу" : "Could not restart service";
  return code.length > 80 ? code.slice(0, 80) + "…" : code;
}

function gameFilterStatusLine(ru: boolean, s: ZapretState): string {
  const prefix = ru ? "GameFilter: " : "GameFilter: ";
  if (s.game_preset_name) return prefix + s.game_preset_name;
  if (s.gamefilter_enabled) return prefix + (ru ? "включено" : "enabled");
  return prefix + (ru ? "отключено" : "disabled");
}

function ipsetFilterStatusLine(_ru: boolean, s: ZapretState): string {
  const m = s.ipset_filter_mode || "none";
  return `IPsetFilter: ${m}`;
}

function ipsetErrorText(ru: boolean, code: string): string {
  const ruM: Record<string, string> = {
    invalid_ipset_mode: "Некорректный режим IPset",
    ipset_utils_missing: "Нет файла utils/ipset-all.txt (нужен для loaded)",
  };
  const enM: Record<string, string> = {
    invalid_ipset_mode: "Invalid IPset mode",
    ipset_utils_missing: "utils/ipset-all.txt missing (required for loaded)",
  };
  const m = ru ? ruM : enM;
  if (code in m) return m[code];
  if (code === "systemctl failed") return ru ? "Не удалось перезапустить службу" : "Could not restart service";
  return code.length > 80 ? code.slice(0, 80) + "…" : code;
}

const NONE_PRESET = "none";

type ManagerInstallResult = {
  status: string;
  detail?: string | null;
};

type LogTailResult = { tail: string };

/** Главный экран: установка менеджера вместо кнопок службы, пока приложение не установлено. */
function ManagerInstallHome({ ru, onInstalled }: { ru: boolean; onInstalled: () => void }) {
  const [busy, setBusy] = useState(false);
  const [lastDetail, setLastDetail] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current != null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  const startPolling = useCallback(() => {
    clearPoll();
    let n = 0;
    pollRef.current = setInterval(() => {
      n += 1;
      if (n > 90) {
        clearPoll();
        return;
      }
      void api
        .callPluginMethod<{}, { manager_installed?: boolean }>("get_zapret_state", {})
        .then((r) => {
          if (r.success && r.result?.manager_installed === true) {
            clearPoll();
            onInstalled();
          }
        })
        .catch(() => {});
    }, 4000);
  }, [clearPoll, onInstalled]);

  const runInstall = async () => {
    setBusy(true);
    setLastDetail(null);
    try {
      const r = await api.callPluginMethod<{}, ManagerInstallResult>("install_zapret_dpi_manager", {});
      if (r.success && r.result) {
        const st = r.result.status;
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
          const d = r.result.detail || "error";
          setLastDetail(d);
          const lr = await api.callPluginMethod<{}, LogTailResult>("get_manager_install_log_tail", {});
          if (lr.success && lr.result?.tail?.trim()) {
            setLastDetail(`${d}\n---\n${lr.result.tail}`);
          }
        }
      } else {
        setLastDetail(ru ? "Вызов установки не удался" : "Install call failed");
      }
    } catch (e) {
      setLastDetail(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelSection>
      <PanelSectionRow>
        <span style={{ ...panelBodyNoIndent, fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" }}>
          {ru
            ? "Zapret DPI Manager не установлен (нужен каталог /home/deck/Zapret_DPI_Manager с приложением). Установите его кнопкой ниже или вручную с GitHub — затем здесь появятся кнопки управления службой и стратегиями."
            : "Zapret DPI Manager is not installed (expected at /home/deck/Zapret_DPI_Manager). Install with the button below or manually from GitHub — then service and strategy controls will appear here."}
        </span>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={busy} onClick={() => void runInstall()}>
          {busy
            ? ru
              ? "Запуск…"
              : "Starting…"
            : ru
              ? "Установить Zapret DPI Manager"
              : "Install Zapret DPI Manager"}
        </ButtonItem>
      </PanelSectionRow>
      {lastDetail ? (
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, marginTop: 12, fontSize: 11, color: "#e57373", whiteSpace: "pre-wrap" }}>
            {lastDetail}
          </span>
        </PanelSectionRow>
      ) : null}
    </PanelSection>
  );
}

/** Экран установки службы zapret (аналог ManagerInstallHome), пока нет /opt/zapret и unit-файла. */
function ZapretServiceInstallHome({ ru, onInstalled }: { ru: boolean; onInstalled: () => void }) {
  const [busy, setBusy] = useState(false);
  const [lastDetail, setLastDetail] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current != null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  const startPolling = useCallback(() => {
    clearPoll();
    let n = 0;
    pollRef.current = setInterval(() => {
      n += 1;
      if (n > 90) {
        clearPoll();
        return;
      }
      void api
        .callPluginMethod<{}, ZapretState>("get_zapret_state", {})
        .then((r) => {
          if (r.success && r.result?.zapret_service_installed === true) {
            clearPoll();
            onInstalled();
          }
        })
        .catch(() => {});
    }, 4000);
  }, [clearPoll, onInstalled]);

  const runInstall = async () => {
    setBusy(true);
    setLastDetail(null);
    try {
      const r = await api.callPluginMethod<{}, ManagerInstallResult>("install_zapret_service", {});
      if (r.success && r.result) {
        const st = r.result.status;
        if (st === "already_installed") {
          api.toaster.toast({
            title: "Zapret DPI",
            body: ru ? "Служба Zapret уже установлена." : "Zapret service is already installed.",
          });
          onInstalled();
        } else if (st === "started") {
          api.toaster.toast({
            title: "Zapret DPI",
            body: ru
              ? "Установка службы запущена в фоне. Подождите. Лог: /tmp/deckyzapretdpi_zapret_install.log (режим рабочего стола)."
              : "Service install started in the background. Wait. Log: /tmp/deckyzapretdpi_zapret_install.log (Desktop mode).",
          });
          startPolling();
        } else {
          const d = r.result.detail || "error";
          setLastDetail(d);
          const lr = await api.callPluginMethod<{}, LogTailResult>("get_zapret_service_install_log_tail", {});
          if (lr.success && lr.result?.tail?.trim()) {
            setLastDetail(`${d}\n---\n${lr.result.tail}`);
          }
        }
      } else {
        setLastDetail(ru ? "Вызов установки не удался" : "Install call failed");
      }
    } catch (e) {
      setLastDetail(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelSection>
      <PanelSectionRow>
        <span style={{ ...panelBodyNoIndent, fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" }}>
          {ru
            ? "Служба Zapret не установлена: нужны каталог /opt/zapret и файл /usr/lib/systemd/system/zapret.service. Установите кнопкой ниже или через Zapret DPI Manager на рабочем столе."
            : "Zapret service is missing: need /opt/zapret and /usr/lib/systemd/system/zapret.service. Install with the button below or use Zapret DPI Manager on the desktop."}
        </span>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={busy} onClick={() => void runInstall()}>
          {busy
            ? ru
              ? "Запуск…"
              : "Starting…"
            : ru
              ? "Установить службу Zapret DPI"
              : "Install Zapret DPI service"}
        </ButtonItem>
      </PanelSectionRow>
      {lastDetail ? (
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, marginTop: 12, fontSize: 11, color: "#e57373", whiteSpace: "pre-wrap" }}>
            {lastDetail}
          </span>
        </PanelSectionRow>
      ) : null}
    </PanelSection>
  );
}

const Content = () => {
  const ru = navigator.language?.toLowerCase().startsWith("ru");
  const [state, setState] = useState<ZapretState | null>(null);
  const [busy, setBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [gfBusy, setGfBusy] = useState(false);
  const [ipsetBusy, setIpsetBusy] = useState(false);
  const [gamePresets, setGamePresets] = useState<GamePresetRow[]>([]);

  const refresh = async () => {
    try {
      setState(await get_zapret_state());
    } catch {
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
        ipset_filter_mode: "none",
      });
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    list_game_presets()
      .then((r) => setGamePresets(r.presets ?? []))
      .catch(() => setGamePresets([]));
  }, []);

  const active = state?.service === "active";
  const svcKey =
    state?.service === "active"
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

  const dropdownOptions = useMemo(() => {
    const names = state?.working_strategies ?? [];
    return names.map((name) => ({ data: name, label: name }));
  }, [state?.working_strategies]);

  const selectedDropdown = useMemo(() => {
    const label = state?.strategy_label;
    if (!label || label === "Не выбрано" || label === "Custom Strategy") return null;
    const found = dropdownOptions.find((o) => o.data === label);
    return found ?? null;
  }, [state?.strategy_label, dropdownOptions]);

  const emptyHint = ru
    ? "Список пуст. Откройте настройки плагина (шестерёнка) → «Автоподбор стратегий» и запустите автоподбор, как в Zapret DPI Manager."
    : "List is empty. Open plugin settings (gear) → “Strategy auto-pick” and run auto-pick, same as in Zapret DPI Manager.";

  const presetDropdownOptions = useMemo(() => {
    const noneLabel = ru ? "Ничего" : "None";
    const head = [{ data: NONE_PRESET, label: noneLabel }];
    const tail = gamePresets.map((p) => ({ data: p.id, label: p.name }));
    return head.concat(tail);
  }, [ru, gamePresets]);

  const selectedPresetOption = useMemo(() => {
    const pid = state?.game_preset_id;
    if (!pid) return presetDropdownOptions[0] ?? null;
    const hit = presetDropdownOptions.find((o) => o.data === pid);
    return hit ?? presetDropdownOptions[0] ?? null;
  }, [state?.game_preset_id, presetDropdownOptions]);

  const ipsetModeOptions = useMemo(
    () =>
      ru
        ? [
            { data: "none", label: "none — тестовый IP, без списка" },
            { data: "loaded", label: "loaded — проверка по списку ipset" },
            { data: "any", label: "any — любой IP в фильтре" },
          ]
        : [
            { data: "none", label: "none — test IP, no list" },
            { data: "loaded", label: "loaded — match ipset list" },
            { data: "any", label: "any — every IP filtered" },
          ],
    [ru],
  );

  const selectedIpsetOption = useMemo(() => {
    const m = state?.ipset_filter_mode || "none";
    const hit = ipsetModeOptions.find((o) => o.data === m);
    return hit ?? ipsetModeOptions[0];
  }, [state?.ipset_filter_mode, ipsetModeOptions]);

  const runToggleGameFilter = () => {
    setGfBusy(true);
    toggle_gamefilter()
      .then(setState)
      .catch(() =>
        setState((prev) =>
          prev
            ? {
                ...prev,
                gamefilter_ok: false,
                gamefilter_message: ru ? "Ошибка переключения GameFilter" : "GameFilter toggle failed",
              }
            : prev,
        ),
      )
      .finally(() => setGfBusy(false));
  };

  const openGameFilterEnableModal = () => {
    const warnRu =
      "Фильтр GameFilter — экспериментальная функция. Возможны чёрный экран при переходе в игровой режим, долгая загрузка, проблемы с YouTube и Discord и другие нестабильности. Пользуйтесь на свой страх и риск.";
    const warnEn =
      "GameFilter is experimental. You may see a black screen when switching to Gaming Mode, slow boot, broken YouTube/Discord, or other issues. Use at your own risk.";
    let modal: ReturnType<typeof showModal>;
    modal = showModal(
      <ConfirmModal
        strTitle={ru ? "ВНИМАНИЕ!" : "WARNING"}
        strDescription={ru ? warnRu : warnEn}
        strOKButtonText={ru ? "Включить" : "Enable"}
        strCancelButtonText={ru ? "Отмена" : "Cancel"}
        onOK={() => {
          modal.Close();
          runToggleGameFilter();
        }}
        closeModal={() => modal.Close()}
        onCancel={() => modal.Close()}
      />,
    );
  };

  if (!state) {
    return (
      <PanelSection>
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, fontSize: 13 }}>{ru ? "Загрузка…" : "Loading…"}</span>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  if (state.manager_installed !== true) {
    return <ManagerInstallHome ru={ru} onInstalled={() => void refresh()} />;
  }

  if (state.zapret_service_installed !== true) {
    return <ZapretServiceInstallHome ru={ru} onInstalled={() => void refresh()} />;
  }

  return (
    <PanelSection>
      <PanelSectionRow>
        <span style={{ ...panelBodyNoIndent, fontSize: 13 }}>{serviceStatusText(ru, svcKey)}</span>
      </PanelSectionRow>
      <PanelSectionRow>
        <span style={{ ...panelBodyNoIndent, fontSize: 13 }}>
          {ru ? "Стратегия: " : "Strategy: "}
          {state?.strategy_label ?? "—"}
        </span>
      </PanelSectionRow>
      {state?.strategy_detail ? (
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" }}>
            {state.strategy_detail}
          </span>
        </PanelSectionRow>
      ) : null}
      {state ? (
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, fontSize: 13 }}>{gameFilterStatusLine(ru, state)}</span>
        </PanelSectionRow>
      ) : null}
      {state ? (
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, fontSize: 13 }}>{ipsetFilterStatusLine(ru, state)}</span>
        </PanelSectionRow>
      ) : null}
      <PanelSectionRow>
        <div style={{ height: 8 }} />
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          disabled={busy || !state}
          onClick={async () => {
            setBusy(true);
            try {
              setState(await toggle_zapret());
            } finally {
              setBusy(false);
            }
          }}
        >
          {active
            ? ru
              ? "Остановить Zapret DPI"
              : "Stop Zapret DPI"
            : ru
              ? "Включить Zapret DPI"
              : "Enable Zapret DPI"}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={{ height: 8 }} />
      </PanelSectionRow>
      {state?.apply_message != null && state.apply_ok === false ? (
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, fontSize: 12, color: "#e57373" }}>
            {applyErrorText(ru, state.apply_message)}
          </span>
        </PanelSectionRow>
      ) : null}
      {state?.apply_ok === true ? (
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, fontSize: 12, color: "#81c784" }}>
            {ru ? "Стратегия применена, служба перезапущена" : "Strategy applied, service restarted"}
          </span>
        </PanelSectionRow>
      ) : null}
      {state?.gamefilter_message != null && state.gamefilter_ok === false ? (
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, fontSize: 12, color: "#e57373" }}>
            {gamePresetErrorText(ru, state.gamefilter_message)}
          </span>
        </PanelSectionRow>
      ) : null}
      {state?.gamefilter_ok === true ? (
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, fontSize: 12, color: "#81c784" }}>
            {ru ? "GameFilter: изменения применены, служба перезапущена" : "GameFilter: changes applied, service restarted"}
          </span>
        </PanelSectionRow>
      ) : null}
      {dropdownOptions.length > 0 ? (
        <PanelSectionRow>
          <DropdownItem
            label={ru ? "Выбрать стратегию" : "Choose strategy"}
            rgOptions={dropdownOptions}
            selectedOption={selectedDropdown}
            disabled={applyBusy}
            strDefaultLabel={ru ? "Выберите стратегию…" : "Choose strategy…"}
            renderButtonValue={(element) => (selectedDropdown ? selectedDropdown.label : element)}
            onChange={async (opt) => {
              const name = opt?.data as string;
              if (!name) return;
              setApplyBusy(true);
              try {
                const next = await apply_working_strategy(name);
                setState(next);
              } catch {
                setState((prev) =>
                  prev
                    ? {
                        ...prev,
                        apply_ok: false,
                        apply_message: ru ? "Ошибка применения" : "Apply failed",
                      }
                    : prev,
                );
              } finally {
                setApplyBusy(false);
              }
            }}
          />
        </PanelSectionRow>
      ) : (
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, fontSize: 12, opacity: 0.75, whiteSpace: "pre-wrap" }}>{emptyHint}</span>
        </PanelSectionRow>
      )}
      <PanelSectionRow>
        <div style={{ height: 8 }} />
      </PanelSectionRow>
      <PanelSectionRow>
        <DropdownItem
          label={ru ? "Режим GameFilter" : "GameFilter mode"}
          rgOptions={presetDropdownOptions}
          selectedOption={selectedPresetOption}
          disabled={gfBusy || !state?.game_presets_available}
          strDefaultLabel={ru ? "Включить пресет для игры" : "Enable game preset"}
          renderButtonValue={() => {
            if (!selectedPresetOption || selectedPresetOption.data === NONE_PRESET) {
              return ru ? "Включить пресет для игры" : "Enable game preset";
            }
            return selectedPresetOption.label;
          }}
          onChange={async (opt) => {
            const raw = opt?.data as string | undefined;
            if (raw == null) return;
            const preset_id = raw === NONE_PRESET ? null : raw;
            setGfBusy(true);
            try {
              const next = await set_game_preset(preset_id);
              setState(next);
            } catch {
              setState((prev) =>
                prev
                  ? {
                      ...prev,
                      gamefilter_ok: false,
                      gamefilter_message: ru ? "Ошибка применения пресета" : "Preset apply failed",
                    }
                  : prev,
              );
            } finally {
              setGfBusy(false);
            }
          }}
        />
      </PanelSectionRow>
      {!state?.game_presets_available ? (
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, fontSize: 11, opacity: 0.7, whiteSpace: "pre-wrap" }}>
            {ru
              ? "Пресеты недоступны: не найден core/game_presets.py в каталоге Zapret DPI Manager."
              : "Presets unavailable: core/game_presets.py not found in Zapret DPI Manager."}
          </span>
        </PanelSectionRow>
      ) : null}
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          disabled={gfBusy || !state}
          onClick={() => {
            if (state?.gamefilter_enabled) runToggleGameFilter();
            else openGameFilterEnableModal();
          }}
        >
          {state?.gamefilter_enabled
            ? ru
              ? "Отключить GameFilter"
              : "Disable GameFilter"
            : ru
              ? "Включить GameFilter"
              : "Enable GameFilter"}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <span style={{ ...panelBodyNoIndent, fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" }}>
          {ru
            ? "Выберите один из вариантов работы GameFilter:\n• с пресетом для игры\n• просто включить фильтр"
            : "Choose one of the ways to use GameFilter:\n• with a game preset\n• enable the filter only"}
        </span>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={{ height: 8 }} />
      </PanelSectionRow>
      <PanelSectionRow>
        <DropdownItem
          label={ru ? "Режим IPsetFilter" : "IPsetFilter mode"}
          rgOptions={ipsetModeOptions}
          selectedOption={selectedIpsetOption}
          disabled={ipsetBusy || !state}
          strDefaultLabel={ru ? "Выберите режим…" : "Choose mode…"}
          renderButtonValue={(element) => (selectedIpsetOption ? selectedIpsetOption.label : element)}
          onChange={async (opt) => {
            const mode = opt?.data as string | undefined;
            if (!mode || mode === state?.ipset_filter_mode) return;
            setIpsetBusy(true);
            try {
              const next = await set_ipset_filter_mode(mode);
              setState(next);
            } catch {
              setState((prev) =>
                prev
                  ? {
                      ...prev,
                      ipset_ok: false,
                      ipset_message: ru ? "Ошибка применения IPset" : "IPset apply failed",
                    }
                  : prev,
              );
            } finally {
              setIpsetBusy(false);
            }
          }}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <span style={{ ...panelBodyNoIndent, fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" }}>
          {ru
            ? "Полезно, если ресурс без Zapret работает, а с Zapret — нет."
            : "Useful when a site works without Zapret but not with it."}
        </span>
      </PanelSectionRow>
      {state?.ipset_message != null && state.ipset_ok === false ? (
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, fontSize: 12, color: "#e57373" }}>
            {ipsetErrorText(ru, state.ipset_message)}
          </span>
        </PanelSectionRow>
      ) : null}
      {state?.ipset_ok === true ? (
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, fontSize: 12, color: "#81c784" }}>
            {ru ? "IPsetFilter: режим применён, служба перезапущена" : "IPsetFilter: mode applied, service restarted"}
          </span>
        </PanelSectionRow>
      ) : null}
    </PanelSection>
  );
};

/** Заголовок и шестерёнка как в DeckyWARP (BsGearFill + DialogButton). */
const TitleView = () => {
  const openSettings = () => {
    Navigation.CloseSideMenus();
    Navigation.Navigate("/deckyzapretdpi/settings/autopicker");
  };

  return (
    <Focusable
      style={{
        display: "flex",
        padding: "0",
        width: "100%",
        boxShadow: "none",
        alignItems: "center",
        justifyContent: "space-between",
      }}
      className={staticClasses.Title}
    >
      <div style={{ marginLeft: 8 }}>Zapret DPI</div>
      <DialogButton
        style={{ height: "28px", width: "40px", minWidth: 0, padding: "10px 12px" }}
        onClick={openSettings}
      >
        <BsGearFill style={{ marginTop: "-4px", display: "block" }} />
      </DialogButton>
    </Focusable>
  );
};

export default definePlugin((serverAPI: ServerAPI) => {
  setServerAPI(serverAPI);

  serverAPI.routerHook.addRoute("/deckyzapretdpi/settings", () => (
    <SettingsPageRouter serverAPI={serverAPI} />
  ));

  return {
    titleView: <TitleView />,
    content: <Content />,
    icon: <FaShieldAlt />,
  };
});
