#!/usr/bin/env bash
# build-bundle.sh — Rebuild the bundle and update both installers.
# Usage: ./build-bundle.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_SCRIPT="$SCRIPT_DIR/ppa-source/bundle.js"
BUNDLE_OUTPUT="$SCRIPT_DIR/ppa-source/ppa-speech-therapy-bundle.jsx"
MAC_INSTALLER="$SCRIPT_DIR/mac-installer/ppa-speech-therapy-bundle.jsx"
WIN_INSTALLER="$SCRIPT_DIR/win-installer/ppa-speech-therapy-bundle.jsx"

echo "Running bundle.js..."
node "$BUNDLE_SCRIPT"

echo "Copying bundle to mac-installer..."
cp "$BUNDLE_OUTPUT" "$MAC_INSTALLER"

echo "Copying bundle to win-installer..."
cp "$BUNDLE_OUTPUT" "$WIN_INSTALLER"

echo "Done. Bundle updated in both installers."
