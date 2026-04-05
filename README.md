# Плпагин Zapret DPI

На Steam Deck обход сетевых ограничений часто настраивают через **Zapret** и программу **[Zapret DPI Manager для Steam Deck](https://github.com/mashakulina/Zapret-DPI-for-Steam-Deck)** в режиме рабочего стола. Этот плагин нужен, чтобы **не выходить в рабочий стол каждый раз**: из **игрового режима**, в меню Decky, можно смотреть состояние обхода, включать и выключать его, выбирать стратегию, пользоваться пресетами для игр и другими настройками, которые вы уже задали в менеджере.

Если менеджер ещё не ставили, плагин предложит установить его прямо отсюда (удобнее довести установку до конца уже в **режиме рабочего стола**, если что-то пойдёт не так).

В списке плагинов Decky он отображается как **«Zapret DPI»**. Нужен установленный [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader).

---

## Установка

Откройте **Konsole** в режиме рабочего стола и введите эту команду:

```bash
bash <(curl -s https://raw.githubusercontent.com/mashakulina/DeckyZapretDPI/main/InstallPlugin.sh)
```

После установки перезапустите Steam или откройте меню Decky — плагин должен появиться в списке.

---

## Удаление

Откройте **Konsole** в режиме рабочего стола и введите эту команду:

```bash
bash <(curl -s https://raw.githubusercontent.com/mashakulina/DeckyZapretDPI/main/UninstallPlugin.sh)
```

Удаляется только плагин; **Zapret DPI Manager** и сам обход на консоли не трогаются.
