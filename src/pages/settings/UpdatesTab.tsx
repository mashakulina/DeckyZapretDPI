import { ButtonItem, PanelSection, PanelSectionRow, ServerAPI } from "decky-frontend-lib";
import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";

const panelBodyNoIndent: CSSProperties = {
  display: "block",
  width: "100%",
  margin: 0,
  padding: 0,
  textIndent: 0,
  boxSizing: "border-box",
};

type VersionInfo = {
  ok: boolean;
  current_version: string;
  error: string | null;
  error_code: string | null;
};

/** Ответ `check_plugin_updates` (как логика DeckyWARP). */
type PluginUpdateCheckResult = {
  status: "checking" | "up_to_date" | "update_available" | "error";
  latest?: string;
  current?: string;
  changelog?: string;
  detail?: string;
};

type UpdatePluginResult = {
  status: string;
};

interface Props {
  serverAPI: ServerAPI;
}

export default function UpdatesTab({ serverAPI }: Props) {
  const ru = navigator.language?.toLowerCase().startsWith("ru");
  const [localVer, setLocalVer] = useState<string>("");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<PluginUpdateCheckResult | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);

  const loadLocal = useCallback(async () => {
    try {
      const r = await serverAPI.callPluginMethod<{}, VersionInfo>("get_plugin_version", {});
      if (r.success && r.result) {
        if (r.result.ok) {
          setLocalVer(r.result.current_version);
          setLocalErr(null);
        } else {
          setLocalVer("");
          setLocalErr(r.result.error || r.result.error_code || "error");
        }
      }
    } catch {
      setLocalVer("");
      setLocalErr(ru ? "Не удалось прочитать версию" : "Could not read version");
    }
  }, [serverAPI, ru]);

  useEffect(() => {
    void loadLocal();
  }, [loadLocal]);

  const runCheck = async () => {
    setCheckBusy(true);
    setCheckResult(null);
    try {
      const r = await serverAPI.callPluginMethod<{}, PluginUpdateCheckResult>("check_plugin_updates", {});
      if (r.success && r.result) {
        setCheckResult(r.result);
        await loadLocal();
      } else {
        setCheckResult({
          status: "error",
          detail: ru ? "Не удалось вызвать проверку обновлений" : "Could not run update check",
        });
      }
    } catch {
      setCheckResult({
        status: "error",
        detail: ru ? "Сеть или плагин недоступны" : "Network or plugin unavailable",
      });
    } finally {
      setCheckBusy(false);
    }
  };

  const runInstall = async () => {
    setInstallBusy(true);
    try {
      const r = await serverAPI.callPluginMethod<{}, UpdatePluginResult>("update_plugin", {});
      if (r.success && r.result?.status) {
        const s = r.result.status;
        if (s === "update_started" || s === "update_started_with_sudo") {
          serverAPI.toaster.toast({
            title: ru ? "Zapret DPI" : "Zapret DPI",
            body: ru
              ? "Обновление запущено. Плагин скоро перезапустится."
              : "Update started. The plugin will restart shortly.",
          });
        } else if (s.startsWith("update_failed")) {
          setCheckResult((prev) => ({
            status: "error",
            detail: s,
            latest: prev?.latest,
            current: prev?.current,
          }));
        }
      }
    } catch (e) {
      setCheckResult((prev) => ({
        status: "error",
        detail: String(e),
        latest: prev?.latest,
        current: prev?.current,
      }));
    } finally {
      setInstallBusy(false);
    }
  };

  const onPrimaryClick = () => {
    if (checkResult?.status === "update_available") {
      void runInstall();
    } else {
      void runCheck();
    }
  };

  const primaryLabel = (): string => {
    if (installBusy) return ru ? "Установка…" : "Installing…";
    if (checkBusy) return ru ? "Проверяем…" : "Checking…";
    if (checkResult?.status === "update_available") {
      return ru ? "Установить обновление" : "Install update";
    }
    return ru ? "Проверить обновления" : "Check for updates";
  };

  const statusText = (): string => {
    if (!checkResult) return "";
    if (checkResult.status === "checking") return ru ? "Проверка…" : "Checking…";
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
  const showChangelog =
    checkResult?.status === "update_available" &&
    typeof checkResult.changelog === "string" &&
    checkResult.changelog.length > 0;

  return (
    <PanelSection>
      <PanelSectionRow>
        <span style={{ ...panelBodyNoIndent, fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" }}>
          {ru ? "Версия плагина:" : "Plugin version:"}{" "}
          {localErr ? (
            <span style={{ color: "#e57373" }}>{localErr}</span>
          ) : (
            <span style={{ fontWeight: 500 }}>{localVer || "—"}</span>
          )}
        </span>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={checkBusy || installBusy} onClick={() => void onPrimaryClick()}>
          {primaryLabel()}
        </ButtonItem>
      </PanelSectionRow>
      {showStatusBlock ? (
        <PanelSectionRow>
          <span
            style={{
              ...panelBodyNoIndent,
              marginTop: 14,
              fontSize: 12,
              opacity: 0.85,
              whiteSpace: "pre-wrap",
            }}
          >
            {statusText()}
          </span>
        </PanelSectionRow>
      ) : null}
      {showChangelog ? (
        <PanelSectionRow>
          <div
            style={{
              marginTop: 8,
              maxHeight: 220,
              overflowY: "auto",
              width: "100%",
              fontSize: 12,
              opacity: 0.9,
            }}
          >
            <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>{checkResult.changelog}</pre>
          </div>
        </PanelSectionRow>
      ) : null}
    </PanelSection>
  );
}
