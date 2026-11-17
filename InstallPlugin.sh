#!/bin/bash
# Standalone bootstrap, including curl | bash. Installer validates release versions
# and required main.py/manager_bridge.py/plugin_diagnostics.py before replacement.
set -euo pipefail
TMP_DIR="$(mktemp -d /tmp/deckyzapretdpi-bootstrap.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT
# Fetch trusted installer code from the official repository; release data/archive
# is independently fetched and validated by the transactional installer.
curl -fsSL 'https://raw.githubusercontent.com/mashakulina/DeckyZapretDPI/main/plugin_updater.py' -o "$TMP_DIR/plugin_updater.py"
curl -fsSL 'https://raw.githubusercontent.com/mashakulina/DeckyZapretDPI/main/plugin_diagnostics.py' -o "$TMP_DIR/plugin_diagnostics.py"
sudo python3 "$TMP_DIR/plugin_updater.py" --root /home/deck/homebrew/plugins/DeckyZapretDPI
