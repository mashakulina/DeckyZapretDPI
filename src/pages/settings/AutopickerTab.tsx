import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  ServerAPI,
  ToggleField,
} from "decky-frontend-lib";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const panelBodyNoIndent: CSSProperties = {
  display: "block",
  width: "100%",
  margin: 0,
  padding: 0,
  textIndent: 0,
  boxSizing: "border-box",
};

type Status = {
  running: boolean;
  phase: string;
  message: string;
  error: string | null;
  working_count: number;
  mode: string;
  log_text?: string;
};

interface Props {
  serverAPI: ServerAPI;
}

export default function AutopickerTab({ serverAPI }: Props) {
  const ru = navigator.language?.toLowerCase().startsWith("ru");
  const [names, setNames] = useState<string[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [st, setSt] = useState<Status | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const refreshStatus = async () => {
    try {
      const r = await serverAPI.callPluginMethod<{}, Status>("get_autopicker_status", {});
      if (r.success) setSt(r.result);
    } catch {
      /* ignore */
    }
  };

  const loadNames = async () => {
    try {
      const r = await serverAPI.callPluginMethod<{ strategies: string[] }, { strategies: string[] }>(
        "list_strategy_files",
        {},
      );
      if (r.success && r.result.strategies) {
        setNames(r.result.strategies);
        setPicked({});
      }
    } catch {
      setNames([]);
    }
  };

  useEffect(() => {
    loadNames();
  }, []);

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [st?.log_text]);

  const selectedList = names.filter((n) => picked[n]);

  const start = async (all: boolean) => {
    setBusy(true);
    try {
      const strategies = all ? null : selectedList.length > 0 ? selectedList : null;
      const r = await serverAPI.callPluginMethod<
        { strategies: string[] | null },
        { ok: boolean; detail: string }
      >("start_autopicker", { strategies });
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
    } finally {
      setBusy(false);
      refreshStatus();
    }
  };

  const stop = async () => {
    await serverAPI.callPluginMethod("stop_autopicker", {});
    refreshStatus();
  };

  const running = st?.running === true;

  const statusText =
    st == null
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

  const introRu =
    "Запустите тестирование всех стратегий, чтобы программа подобрала самые оптимальные стратегии.\nИли можете выбрать конкретные стратегии из списка и запустить автоподбор с выбранными стратегиями. Будут проверены только они.";
  const introEn =
    "Run testing for all strategies so the program can pick the most suitable ones.\nOr select specific strategies from the list and run auto-selection with those strategies only. Only they will be checked.";

  return (
    <PanelSection>
      <PanelSectionRow>
        <span style={{ ...panelBodyNoIndent, fontSize: 13, opacity: 0.9, whiteSpace: "pre-wrap" }}>
          {ru ? introRu : introEn}
        </span>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={running || busy} onClick={() => start(true)}>
          {ru ? "Тестировать все стратегии" : "Test all strategies"}
        </ButtonItem>
      </PanelSectionRow>
      {names.slice(0, 60).map((n) => (
        <PanelSectionRow key={n}>
          <ToggleField
            label={n}
            checked={!!picked[n]}
            disabled={running || busy}
            onChange={(c) => setPicked((p) => ({ ...p, [n]: c }))}
          />
        </PanelSectionRow>
      ))}
      {names.length > 60 ? (
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, fontSize: 11, opacity: 0.7 }}>… {names.length - 60} more</span>
        </PanelSectionRow>
      ) : null}
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={running || busy} onClick={() => start(false)}>
          {ru ? "Запустить тест с выбранными стратегиями" : "Run test with selected strategies"}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={!running} onClick={stop}>
          {ru ? "Остановить тест" : "Stop test"}
        </ButtonItem>
      </PanelSectionRow>
      {statusText ? (
        <PanelSectionRow>
          <span style={{ ...panelBodyNoIndent, fontSize: 12, opacity: 0.85, whiteSpace: "pre-wrap" }}>{statusText}</span>
        </PanelSectionRow>
      ) : null}
      <PanelSectionRow>
        <div style={{ ...panelBodyNoIndent, width: "100%" }}>
          <span style={{ ...panelBodyNoIndent, fontSize: 12, opacity: 0.75, marginBottom: 4 }}>
            {ru ? "Информация об автоподборе" : "Auto-selection information"}
          </span>
          <div
            ref={logRef}
            style={{
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
            }}
          >
            {st?.log_text?.length ? st.log_text : ru ? "(пусто — запустите тест)" : "(empty — start a test)"}
          </div>
        </div>
      </PanelSectionRow>
    </PanelSection>
  );
}
