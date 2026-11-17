import { ButtonItem, PanelSection, PanelSectionRow, ServerAPI } from "decky-frontend-lib";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

interface Diagnostics {
  plugin_version: string;
  plugin_path: string;
  manager_version: string;
  manager_path: string;
  missing_modules: string[];
  core_paths: string[];
  log_path: string;
  log_tail: string;
  last_error: { id: string; operation: string; message: string; timestamp: string } | null;
}

const textStyle: CSSProperties = {
  display: "block", width: "100%", minWidth: 0, margin: 0, padding: 0,
  textIndent: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 13,
};

function readableLog(tail: string): string {
  return tail.slice(-16000).split("\n").map((line) => {
    try {
      const entry = JSON.parse(line);
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return line;
      return Object.entries(entry).map(([key, value]) =>
        `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`).join("\n");
    } catch { return line; }
  }).join("\n\n").slice(-16000);
}

export default function DiagnosticsTab({ serverAPI }: { serverAPI: ServerAPI }) {
  const ru = navigator.language?.toLowerCase().startsWith("ru");
  const [data, setData] = useState<Diagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => {
    setBusy(true);
    setError("");
    setData(null);
    try {
      const response = await serverAPI.callPluginMethod<{}, Diagnostics>("get_diagnostics", {});
      if (!response.success) throw new Error("RPC get_diagnostics failed");
      const value = response.result;
      if (!value || !Array.isArray(value.missing_modules) || !Array.isArray(value.core_paths)
        || typeof value.log_tail !== "string") throw new Error("Invalid diagnostics response");
      setData(value);
    } catch {
      setError(ru
        ? "Не удалось прочитать диагностику. Повторите запрос; если ошибка сохраняется, перезапустите плагин в Decky."
        : "Could not read diagnostics. Try again; if this persists, restart the plugin in Decky.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void refresh(); }, [serverAPI]);
  const row = (text: string, color?: string) => (
    <PanelSectionRow><span style={{ ...textStyle, color }}>{text}</span></PanelSectionRow>
  );
  return <PanelSection>
    <PanelSectionRow>
      <ButtonItem layout="below" disabled={busy} onClick={refresh}>
        {busy ? (ru ? "Чтение…" : "Reading…") : (ru ? "Обновить диагностику" : "Refresh diagnostics")}
      </ButtonItem>
    </PanelSectionRow>
    {error ? row(error, "#e57373") : null}
    {data ? <>
      {row(`${ru ? "Установленная версия плагина" : "Installed plugin version"}: ${data.plugin_version || "—"}\n${data.plugin_path || "—"}`)}
      {row(`${ru ? "Версия менеджера" : "Manager version"}: ${data.manager_version || "—"}\n${data.manager_path || "—"}`)}
      {row(data.missing_modules.length
        ? (ru ? "Менеджер несовместим: отсутствуют модули " : "Manager incompatible: missing modules ") + data.missing_modules.join(", ") +
          (ru ? ". Обновите или восстановите Zapret DPI Manager, затем перезапустите плагин в Decky." : ". Update or repair Zapret DPI Manager, then restart the plugin in Decky.")
        : (ru ? "Обязательные модули менеджера найдены. Если ошибка импорта сохраняется, перезапустите плагин в Decky." : "Required manager modules found. If an import error persists, restart the plugin in Decky."), data.missing_modules.length ? "#e57373" : undefined)}
      {row(`${ru ? "Пути загруженного core" : "Loaded core paths"}:\n${data.core_paths.join("\n") || "—"}`)}
      {row(data.last_error
        ? `${ru ? "Последний сбой" : "Last failure"}: ${data.last_error.id}\n${data.last_error.timestamp} · ${data.last_error.operation}\n${data.last_error.message}`
        : (ru ? "Зарегистрированных сбоев нет." : "No failures recorded."))}
      {row(`${ru ? "Файл журнала" : "Log file"}: ${data.log_path || "—"}`)}
      {row(ru ? "Последние записи журнала (ограниченный фрагмент):" : "Recent log entries (bounded excerpt):")}
      <PanelSectionRow><pre style={{ ...textStyle, fontFamily: "monospace", fontSize: 12, maxHeight: 420, overflow: "auto" }}>
        {readableLog(data.log_tail) || (ru ? "Журнал пока пуст." : "Log is empty.")}
      </pre></PanelSectionRow>
    </> : null}
  </PanelSection>;
}
