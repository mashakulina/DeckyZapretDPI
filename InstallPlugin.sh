#!/bin/bash
# Установка DeckyZapretDPI из последнего релиза GitHub (zipball, как DeckyWARP).
set -euo pipefail

PLUGIN_DIR="/home/deck/homebrew/plugins/DeckyZapretDPI"
API_URL="https://api.github.com/repos/mashakulina/DeckyZapretDPI/releases/latest"

echo "== Stopping plugin_loader =="
sudo systemctl stop plugin_loader.service || true

echo "== Removing old plugin =="
sudo rm -rf "$PLUGIN_DIR"

TMP_DIR="$(mktemp -d /tmp/deckyzapretdpi_install.XXXXXX)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cd "$TMP_DIR"

echo "== Fetching latest release =="
if command -v jq >/dev/null 2>&1; then
  ASSET_URL="$(curl -fsSL "$API_URL" | jq -r '.zipball_url')"
else
  ASSET_URL="$(curl -fsSL "$API_URL" | grep '"zipball_url":' | head -1 | cut -d '"' -f 4)"
fi

if [[ -z "${ASSET_URL:-}" || "$ASSET_URL" == "null" ]]; then
  echo "ERROR: could not fetch zipball_url from GitHub API"
  exit 1
fi

echo "== Downloading release archive =="
curl -fSL -o release.zip "$ASSET_URL"

echo "== Extracting =="
unzip -qo release.zip

INNER_DIR="$(find . -maxdepth 1 -mindepth 1 -type d | head -n 1)"
if [[ -z "$INNER_DIR" || ! -d "$INNER_DIR" ]]; then
  echo "ERROR: could not find root folder inside archive"
  exit 1
fi

if [[ ! -f "$INNER_DIR/main.py" || ! -f "$INNER_DIR/plugin.json" || ! -f "$INNER_DIR/dist/index.js" ]]; then
  echo "ERROR: archive is missing main.py, plugin.json, or dist/index.js"
  exit 1
fi

echo "== Installing to $PLUGIN_DIR =="
sudo mkdir -p "$PLUGIN_DIR"
sudo cp -a "$INNER_DIR"/. "$PLUGIN_DIR/"

echo "== Starting plugin_loader =="
sudo systemctl start plugin_loader.service || true

trap - EXIT
cleanup

echo "✅ DeckyZapretDPI installed from latest release."
echo "🔄 Restart Steam or Decky if the plugin does not appear."
