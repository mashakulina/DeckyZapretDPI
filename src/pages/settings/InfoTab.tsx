import { ButtonItem, PanelSection, PanelSectionRow, ServerAPI } from "decky-frontend-lib";
import type { CSSProperties } from "react";
import { openExternalUrl } from "../../utils/openExternalUrl";

const panelBodyNoIndent: CSSProperties = {
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

interface Props {
  serverAPI: ServerAPI;
}

export default function InfoTab(_props: Props) {
  const ru = navigator.language?.toLowerCase().startsWith("ru");

  const introRu = "Плагин работает совместно с Zapret DPI Manager — графической оболочкой для службы Zapret на Steam Deck.";
  const introEn =
    "This plugin works together with Zapret DPI Manager — the desktop GUI for the Zapret service on Steam Deck.";

  const flowRu =
    "Стратегии и некоторые доработки берутся из версии Zapret для Windows (автор Flowseal).";
  const flowEn = "Strategies and some enhancements come from the Windows Zapret project by Flowseal.";

  const malRu = "Служба Zapret DPI основана на разработке ImMALWARE.";
  const malEn = "The Zapret DPI service builds on work by ImMALWARE.";

  return (
    <PanelSection>
      <PanelSectionRow>
        <span style={{ ...panelBodyNoIndent, fontSize: 13, opacity: 0.9, whiteSpace: "pre-wrap" }}>
          {ru ? introRu : introEn}
        </span>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => openExternalUrl(URL_MANAGER)}>
          {ru ? "Zapret DPI Manager (GitHub)" : "Zapret DPI Manager (GitHub)"}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => openExternalUrl(URL_PLUGIN)}>
          {ru ? "Плагин DeckyZapretDPI (GitHub)" : "DeckyZapretDPI plugin (GitHub)"}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <span
          style={{
            ...panelBodyNoIndent,
            fontSize: 12,
            opacity: 0.85,
            whiteSpace: "pre-wrap",
            marginTop: 14,
          }}
        >
          {ru ? flowRu : flowEn}
        </span>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => openExternalUrl(URL_FLOWSEAL)}>
          Flowseal (GitHub)
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <span
          style={{
            ...panelBodyNoIndent,
            fontSize: 12,
            opacity: 0.85,
            whiteSpace: "pre-wrap",
            marginTop: 14,
          }}
        >
          {ru ? malRu : malEn}
        </span>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => openExternalUrl(URL_IMMALWARE)}>
          ImMALWARE (GitHub)
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}
