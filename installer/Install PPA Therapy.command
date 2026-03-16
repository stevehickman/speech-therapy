#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  PPA Speech Therapy Suite — macOS Installer
#  Double-click this file to install.
# ─────────────────────────────────────────────────────────────────────────────

# Change to the folder containing this file so install.sh can find the bundle
cd "$(dirname "$0")"

# Make sure install.sh is executable
chmod +x install.sh

# Run the installer
bash install.sh
