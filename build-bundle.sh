#!/usr/bin/env bash
# build-bundle.sh — Rebuild the bundle, sync installer copies, and update
#                   the dependency lists in both install scripts automatically.
# Usage: ./build-bundle.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_SCRIPT="$SCRIPT_DIR/ppa-source/bundle.js"
BUNDLE_OUTPUT="$SCRIPT_DIR/ppa-source/ppa-speech-therapy-bundle.jsx"
MAC_BUNDLE="$SCRIPT_DIR/mac-installer/ppa-speech-therapy-bundle.jsx"
WIN_BUNDLE="$SCRIPT_DIR/win-installer/ppa-speech-therapy-bundle.jsx"
MAC_INSTALL="$SCRIPT_DIR/mac-installer/install.sh"
WIN_INSTALL="$SCRIPT_DIR/win-installer/install.ps1"

# ── 1. Generate the bundle ────────────────────────────────────────────────────
echo "Running bundle.js..."
node "$BUNDLE_SCRIPT"

# ── 2. Extract external npm packages from the bundle ─────────────────────────
# Parse `import ... from "pkg"` lines where the specifier is not relative.
# Strip sub-paths to get root package names:
#   "mespeak/src/mespeak_config.json" → "mespeak"
#   "@scope/pkg/subpath"             → "@scope/pkg"
echo "Detecting npm dependencies from bundle..."

PKGS=()
while IFS= read -r pkg; do
  PKGS+=("$pkg")
done < <(grep -E '^import .+ from "[^./]' "$BUNDLE_OUTPUT" \
  | sed -E 's/.*from "([^"]+)".*/\1/' \
  | sed -E 's|^(@[^/]+/[^/]+).*|\1|; s|^([^@][^/]*).*|\1|' \
  | sort -u)

# react-dom is required by the Vite template's main.jsx (not imported by the
# bundle itself, but always needed to mount the React app).
if [[ ! " ${PKGS[*]:-} " =~ " react-dom " ]]; then
  PKGS+=(react-dom)
fi

# Sort final list for deterministic output
IFS=$'\n' PKGS=($(printf '%s\n' "${PKGS[@]}" | sort -u)); unset IFS

echo "  Packages detected: ${PKGS[*]}"

# ── 3. Update mac-installer/install.sh REQUIRED_PKGS ─────────────────────────
MAC_PKGS_STR="${PKGS[*]}"
sed -i '' "s|^REQUIRED_PKGS=([^)]*)|REQUIRED_PKGS=(${MAC_PKGS_STR})|" "$MAC_INSTALL"
echo "  Updated REQUIRED_PKGS in mac-installer/install.sh"

# ── 4. Update win-installer/install.ps1 \$RequiredPkgs ───────────────────────
# Build:  "react", "react-dom", "mespeak"
WIN_PKGS_QUOTED=$(printf '"%s", ' "${PKGS[@]}" | sed 's/, $//')
# Use BSD sed with two single-quote-bounded fragments so the shell expands only
# WIN_PKGS_QUOTED and nothing else (avoids issues with $ in the PS1 variable name).
sed -i '' 's/\$RequiredPkgs = @([^)]*)/\$RequiredPkgs = @('"${WIN_PKGS_QUOTED}"')/' "$WIN_INSTALL"
echo "  Updated \$RequiredPkgs in win-installer/install.ps1"

# ── 5. Copy bundle to installer directories ──────────────────────────────────
echo "Copying bundle to mac-installer..."
cp "$BUNDLE_OUTPUT" "$MAC_BUNDLE"

echo "Copying bundle to win-installer..."
cp "$BUNDLE_OUTPUT" "$WIN_BUNDLE"

echo ""
echo "Done. Bundle and installer dependency lists updated."
