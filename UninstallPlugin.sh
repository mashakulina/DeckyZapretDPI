#!/bin/bash
# Удаление DeckyZapretDPI из каталога плагинов Decky (без затрагивания Zapret DPI Manager).
set +e

PLUGIN_DIR="/home/deck/homebrew/plugins/DeckyZapretDPI"

echo "== Stopping plugin_loader =="
sudo systemctl stop plugin_loader.service || true

echo "== Removing plugin =="
sudo rm -rf "$PLUGIN_DIR"

echo "== Starting plugin_loader =="
sudo systemctl start plugin_loader.service || true

echo "✅ DeckyZapretDPI uninstalled."
