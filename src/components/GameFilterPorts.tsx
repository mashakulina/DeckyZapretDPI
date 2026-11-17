import { ButtonItem, PanelSectionRow, TextField } from "decky-frontend-lib";
import { useEffect, useState } from "react";
import type { ZapretState } from "../index";

type ExpectedSettings = { mode: string; ports: ZapretState["gamefilter_custom_ports"]; error: ZapretState["gamefilter_ports_error"] };

type Props = {
  state: ZapretState;
  ru: boolean;
  disabled: boolean;
  save: (mode: string, ports: Record<string, string> | null, reset: boolean, expected: ExpectedSettings) => Promise<ZapretState>;
  onSaved: (state: ZapretState) => void;
  onBusyChange: (busy: boolean) => void;
  onEditingChange: (editing: boolean) => void;
};
const wrap = { width: "100%", minWidth: 0, overflowWrap: "anywhere" as const, whiteSpace: "normal" as const };

export function GameFilterPorts({ state, ru, disabled, save, onSaved, onBusyChange, onEditingChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [tcp, setTcp] = useState("");
  const [udp, setUdp] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const eligible = !!state.gamefilter_enabled && !state.game_preset_id && !!state.gamefilter_ports_available;
  const currentMode = state.gamefilter_protocol_mode || "both";
  // Compare primitive values: fresh polling objects must not invalidate a draft.
  const settingsKey = (settings: ExpectedSettings) => JSON.stringify([
    settings.mode, settings.ports == null, settings.ports?.tcp ?? null,
    settings.ports?.udp ?? null, settings.error ?? null,
  ]);
  const saved: ExpectedSettings = { mode: currentMode, ports: state.gamefilter_custom_ports, error: state.gamefilter_ports_error };
  const [expected, setExpected] = useState<ExpectedSettings>(saved);
  const stale = editing && settingsKey(saved) !== settingsKey(expected);
  const mode = currentMode;
  const visible = editing && eligible && expected.mode === currentMode;
  const close = () => { setEditing(false); onEditingChange(false); };
  useEffect(() => {
    if (!eligible || (editing && expected.mode !== currentMode)) { setEditing(false); setMessage(""); onEditingChange(false); }
  }, [eligible, currentMode, editing, expected.mode, onEditingChange]);
  useEffect(() => () => onEditingChange(false), [onEditingChange]);
  const begin = () => {
    const ports = state.gamefilter_ports_error ? null : state.gamefilter_custom_ports ?? state.gamefilter_default_ports;
    setTcp(ports?.tcp || "");
    setUdp(ports?.udp || "");
    setMessage("");
    setExpected({ ...saved, ports: saved.ports ? { ...saved.ports } : saved.ports });
    onEditingChange(true);
    setEditing(true);
  };
  const apply = async (reset: boolean) => {
    if (stale || !visible || pending) return;
    setPending(true);
    onBusyChange(true);
    setMessage("");
    try {
      const ports: Record<string, string> = mode === "both" ? { tcp, udp } : mode === "tcp" ? { tcp } : { udp };
      const result = await save(mode, reset ? null : ports, reset, expected);
      onSaved(result);
      if (result.gamefilter_ok === false) setMessage(result.gamefilter_message || (ru ? "Ошибка сохранения" : "Save failed"));
      else { close(); setMessage(ru ? "Порты сохранены" : "Ports saved"); }
    } catch (error) {
      setMessage((ru ? "Ошибка сохранения: " : "Save failed: ") + String(error));
    } finally { setPending(false); onBusyChange(false); }
  };
  const display = (protocol: "tcp" | "udp") => {
    if (!state.gamefilter_enabled || (currentMode !== "both" && currentMode !== protocol)) return ru ? "отключён" : "disabled";
    if (state.gamefilter_ports_error) return ru ? "ошибка чтения" : "read error";
    const custom = state.gamefilter_custom_ports;
    const value = (custom ?? state.gamefilter_default_ports)?.[protocol];
    const isDefault = !custom || value === state.gamefilter_default_ports?.[protocol];
    return value ? `${value} (${isDefault ? (ru ? "по умолчанию" : "default") : (ru ? "свои" : "custom")})` : (ru ? "недоступно" : "unavailable");
  };
  return <>
    <PanelSectionRow><div style={{ ...wrap, fontSize: 12 }}>
      {state.game_preset_id && !state.gamefilter_enabled
        ? (ru ? "Порты задаёт выбранный пресет игры." : "Ports are configured by the selected game preset.")
        : <>TCP: {display("tcp")}<br />UDP: {display("udp")}</>}
    </div></PanelSectionRow>
    {!state.gamefilter_ports_available && <PanelSectionRow><div style={wrap}>{ru ? "Редактор портов недоступен. Обновите Zapret DPI Manager." : "Port editing unavailable. Update Zapret DPI Manager."}</div></PanelSectionRow>}
    {state.gamefilter_ports_error && <PanelSectionRow><div style={{ ...wrap, color: "#e57373", fontSize: 12 }}>{state.gamefilter_ports_error}</div></PanelSectionRow>}
    {eligible && !visible && <PanelSectionRow><ButtonItem layout="below" disabled={disabled || pending} onClick={begin}>{ru ? "Изменить порты" : "Edit ports"}</ButtonItem></PanelSectionRow>}
    {visible && <>
      {stale && <>
        <PanelSectionRow><div role="alert" style={wrap}>{ru ? "Настройки GameFilter изменились. Черновик сохранён. Загрузите текущие настройки или отмените редактирование." : "GameFilter settings changed. Your draft is preserved. Reload current settings or cancel editing."}</div></PanelSectionRow>
        <PanelSectionRow><ButtonItem layout="below" disabled={pending} onClick={begin}>{ru ? "Загрузить текущие настройки" : "Reload current settings"}</ButtonItem></PanelSectionRow>
      </>}
      {(mode === "both" || mode === "tcp") && <PanelSectionRow><TextField label={ru ? "Порты TCP" : "TCP ports"} description="443,27000-27100" style={{ width: "100%", boxSizing: "border-box" }} value={tcp} disabled={disabled || pending} onChange={(event) => setTcp(event.target.value)} /></PanelSectionRow>}
      {(mode === "both" || mode === "udp") && <PanelSectionRow><TextField label={ru ? "Порты UDP" : "UDP ports"} description="443,27000-27100" style={{ width: "100%", boxSizing: "border-box" }} value={udp} disabled={disabled || pending} onChange={(event) => setUdp(event.target.value)} /></PanelSectionRow>}
      <PanelSectionRow><ButtonItem layout="below" disabled={disabled || pending || stale} onClick={() => apply(false)}>{pending ? (ru ? "Применение…" : "Applying…") : (ru ? "Применить порты" : "Apply ports")}</ButtonItem></PanelSectionRow>
      <PanelSectionRow><ButtonItem layout="below" disabled={disabled || pending || stale} onClick={() => apply(true)}>{ru ? "Порты по умолчанию" : "Reset ports to defaults"}</ButtonItem></PanelSectionRow>
      <PanelSectionRow><ButtonItem layout="below" disabled={pending} onClick={close}>{ru ? "Отмена" : "Cancel"}</ButtonItem></PanelSectionRow>
    </>}
    {message && <PanelSectionRow><div role="status" style={{ ...wrap, fontSize: 12 }}>{message}</div></PanelSectionRow>}
  </>;
}
