import { SidebarNavigation, ServerAPI } from "decky-frontend-lib";
import AutopickerTab from "./settings/AutopickerTab";
import InfoTab from "./settings/InfoTab";
import UpdatesTab from "./settings/UpdatesTab";

interface Props {
  serverAPI: ServerAPI;
}

const ru = navigator.language?.toLowerCase().startsWith("ru");

export default function SettingsPageRouter({ serverAPI }: Props) {
  return (
    <SidebarNavigation
      pages={[
        {
          title: ru ? "Автоподбор стратегий" : "Strategy auto-pick",
          route: "/deckyzapretdpi/settings/autopicker",
          content: <AutopickerTab serverAPI={serverAPI} />,
        },
        {
          title: ru ? "Обновление" : "Updates",
          route: "/deckyzapretdpi/settings/updates",
          content: <UpdatesTab serverAPI={serverAPI} />,
        },
        {
          title: ru ? "Информация" : "Information",
          route: "/deckyzapretdpi/settings/info",
          content: <InfoTab serverAPI={serverAPI} />,
        },
      ]}
    />
  );
}
