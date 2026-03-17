#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  PPA Speech Therapy Suite — macOS Installer
#  Version 4 · March 2026
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Resolve the directory that contains this script and the bundle ────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_SRC="$SCRIPT_DIR/ppa-speech-therapy-bundle.jsx"
USER_GUIDE_SRC="$SCRIPT_DIR/ppa-speech-therapy-user-guide.pdf"
TECH_DOCS_SRC="$SCRIPT_DIR/ppa-speech-therapy-docs.pdf"

# ── Colours ───────────────────────────────────────────────────────────────────
BOLD='\033[1m'
TEAL='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m' # reset

hr()  { printf "${DIM}%s${NC}\n" "────────────────────────────────────────────────────────────────────────────"; }
hdr() { echo; hr; printf "${TEAL}${BOLD}  %s${NC}\n" "$1"; hr; echo; }
ok()  { printf "${GREEN}  ✓  %s${NC}\n" "$1"; }
inf() { printf "     %s\n" "$1"; }
warn(){ printf "${YELLOW}  ⚠  %s${NC}\n" "$1"; }
err() { printf "${RED}  ✗  %s${NC}\n" "$1"; }
ask() { printf "${BOLD}  ▶  %s${NC} " "$1"; }

# ── Banner ────────────────────────────────────────────────────────────────────
clear
echo
printf "${TEAL}${BOLD}"
cat <<'BANNER'
   ╔══════════════════════════════════════════════════════════════╗
   ║         🌿  PPA Speech Therapy Suite  —  macOS Installer    ║
   ║                       Version 4  ·  March 2026              ║
   ╚══════════════════════════════════════════════════════════════╝
BANNER
printf "${NC}\n"
inf "This installer will set up PPA Speech Therapy Suite on your Mac."
inf "It creates a Vite project, configures your Anthropic API key,"
inf "and adds a Launch icon to your Desktop."
echo

# ── Verify bundle and docs are present ────────────────────────────────────────
if [[ ! -f "$BUNDLE_SRC" ]]; then
  err "ppa-speech-therapy-bundle.jsx not found next to the installer."
  inf "Please make sure all installer files are in the same folder and try again."
  echo; read -r -p "  Press Return to close…"; exit 1
fi
if [[ ! -f "$USER_GUIDE_SRC" || ! -f "$TECH_DOCS_SRC" ]]; then
  err "PDF documentation files not found next to the installer."
  inf "Please make sure ppa-speech-therapy-user-guide.pdf and ppa-speech-therapy-docs.pdf"
  inf "are in the same folder as the installer and try again."
  echo; read -r -p "  Press Return to close…"; exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 1 of 5 — Checking prerequisites"
# ─────────────────────────────────────────────────────────────────────────────

# ── Node.js ───────────────────────────────────────────────────────────────────
NODE_OK=false
NODE_CMD=""

for candidate in node /usr/local/bin/node /opt/homebrew/bin/node "$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)/bin/node"; do
  if command -v "$candidate" &>/dev/null 2>&1 || [[ -x "$candidate" ]]; then
    VER=$("$candidate" --version 2>/dev/null | sed 's/v//')
    MAJOR=$(echo "$VER" | cut -d. -f1)
    if [[ "$MAJOR" -ge 18 ]]; then
      NODE_OK=true
      NODE_CMD="$candidate"
      ok "Node.js $VER found"
      break
    fi
  fi
done

if [[ "$NODE_OK" == false ]]; then
  warn "Node.js 18 or later was not found."
  echo
  inf "Install it using one of these methods, then re-run this installer:"
  echo
  inf "  Option A — Homebrew (recommended):"
  inf "    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  inf "    brew install node"
  echo
  inf "  Option B — Official installer:"
  inf "    https://nodejs.org  →  download the LTS .pkg and install it"
  echo
  inf "  Option C — nvm (version manager):"
  inf "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
  inf "    source ~/.zshrc  (or ~/.bashrc)"
  inf "    nvm install --lts"
  echo
  read -r -p "  Press Return to close…"; exit 1
fi

# Resolve npm alongside node
NPM_CMD="$(dirname "$NODE_CMD")/npm"
if ! command -v "$NPM_CMD" &>/dev/null 2>&1 && ! [[ -x "$NPM_CMD" ]]; then
  NPM_CMD="npm"
fi

# ── Xcode command-line tools (needed for npm builds) ─────────────────────────
if ! xcode-select -p &>/dev/null 2>&1; then
  warn "Xcode command-line tools not found — attempting silent install…"
  inf "(A system dialog may appear asking you to install them.)"
  xcode-select --install 2>/dev/null || true
  inf "After the install completes, re-run this installer."
  echo; read -r -p "  Press Return to close…"; exit 1
fi
ok "Xcode command-line tools present"

# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 2 of 5 — Choose install location"
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_DIR="$HOME/PPA Therapy"
ask "Install folder [${DEFAULT_DIR}]:"
read -r USER_DIR
INSTALL_DIR="${USER_DIR:-$DEFAULT_DIR}"

# Expand ~ if user typed it
INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"

if [[ -d "$INSTALL_DIR" ]]; then
  warn "Folder already exists: $INSTALL_DIR"
  ask "Overwrite? (y/N):"
  read -r CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    inf "Installation cancelled."
    echo; read -r -p "  Press Return to close…"; exit 0
  fi
  rm -rf "$INSTALL_DIR"
fi

mkdir -p "$INSTALL_DIR"
ok "Install directory: $INSTALL_DIR"

# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 3 of 5 — Anthropic API key"
# ─────────────────────────────────────────────────────────────────────────────

inf "The app calls the Anthropic API directly from the browser."
inf "You need a Claude API key — get one at https://console.anthropic.com"
echo
ask "Paste your API key (starts with sk-ant-…):"
read -r -s API_KEY
echo   # newline after hidden input

if [[ -z "$API_KEY" ]]; then
  warn "No API key entered — you can add it later by editing:"
  inf "  $INSTALL_DIR/.env"
  inf "  Change: VITE_ANTHROPIC_API_KEY=YOUR_KEY_HERE"
  API_KEY="YOUR_KEY_HERE"
elif [[ "$API_KEY" != sk-ant-* ]]; then
  warn "Key doesn't look like an Anthropic key — installing anyway."
  inf "Edit $INSTALL_DIR/.env to correct it if needed."
fi
ok "API key recorded"

# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 4 of 5 — Creating the project"
# ─────────────────────────────────────────────────────────────────────────────

inf "Creating Vite project…"
cd "$INSTALL_DIR"
"$NPM_CMD" create vite@latest . -- --template react --yes 2>&1 | grep -v "^$" | sed 's/^/     /' || true
ok "Vite project created"

# ── Copy bundle ───────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR/src"
cp "$BUNDLE_SRC" "$INSTALL_DIR/src/ppa-speech-therapy-bundle.jsx"
ok "Bundle copied to src/"

# ── Copy documentation PDFs ───────────────────────────────────────────────────
cp "$USER_GUIDE_SRC" "$INSTALL_DIR/ppa-speech-therapy-user-guide.pdf"
cp "$TECH_DOCS_SRC"  "$INSTALL_DIR/ppa-speech-therapy-docs.pdf"
ok "Documentation PDFs copied"

# ── Patch App.jsx ─────────────────────────────────────────────────────────────
cat > "$INSTALL_DIR/src/App.jsx" <<'APPJSX'
import App from './ppa-speech-therapy-bundle.jsx';
export default App;
APPJSX
ok "src/App.jsx configured"

# API headers are now baked into fetchAnthropicApi() in shared.jsx — no bundle patch needed.

# ── Write .env ────────────────────────────────────────────────────────────────
cat > "$INSTALL_DIR/.env" <<ENVFILE
# PPA Speech Therapy Suite — Anthropic API key
# Get your key at: https://console.anthropic.com
VITE_ANTHROPIC_API_KEY=$API_KEY
ENVFILE

# Also write a .env.example for reference
cat > "$INSTALL_DIR/.env.example" <<'ENVEX'
VITE_ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
ENVEX
ok ".env file written"

# ── Optional: clean up default Vite boilerplate assets ───────────────────────
# Remove the default CSS and assets that Vite generates (we don't use them)
cat > "$INSTALL_DIR/src/index.css" <<'CSS'
body { margin: 0; }
CSS
rm -f "$INSTALL_DIR/src/assets/react.svg" "$INSTALL_DIR/public/vite.svg" 2>/dev/null || true
ok "Default Vite boilerplate cleaned up"

# ── npm install ───────────────────────────────────────────────────────────────
inf "Running npm install (this may take a minute)…"
cd "$INSTALL_DIR"
"$NPM_CMD" install --silent 2>&1 | tail -3 | sed 's/^/     /' || true
ok "npm packages installed"

# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 5 of 5 — Creating Desktop launcher"
# ─────────────────────────────────────────────────────────────────────────────

LAUNCHER="$HOME/Desktop/Launch PPA Therapy.command"

# Write the launcher — sources shell profile so nvm/Homebrew node is found
cat > "$LAUNCHER" <<LAUNCHER
#!/usr/bin/env bash
# PPA Speech Therapy Suite — Desktop Launcher

# Source shell config so Node.js / nvm is on PATH
for rc in "\$HOME/.zshrc" "\$HOME/.bashrc" "\$HOME/.bash_profile" "\$HOME/.profile"; do
  [[ -f "\$rc" ]] && source "\$rc" 2>/dev/null && break
done

# Also add common Homebrew and nvm paths
export PATH="\$PATH:/opt/homebrew/bin:/usr/local/bin:\$HOME/.nvm/versions/node/\$(ls \$HOME/.nvm/versions/node 2>/dev/null | sort -V | tail -1)/bin"

INSTALL_DIR="$INSTALL_DIR"

# Check app is still there
if [[ ! -d "\$INSTALL_DIR" ]]; then
  osascript -e 'display alert "PPA Therapy folder not found" message "Expected at: $INSTALL_DIR\n\nRe-run the installer to set up again." as warning'
  exit 1
fi

# Kill any previous dev server on port 5173
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

cd "\$INSTALL_DIR"
echo "Starting PPA Speech Therapy Suite…"
echo "Opening browser at http://localhost:5173"
echo "(Close this window or press Ctrl+C to stop the server)"
echo

# Open browser after a short delay for the server to start
(sleep 2 && open http://localhost:5173) &

npm run dev
LAUNCHER

chmod +x "$LAUNCHER"
ok "Desktop launcher created: ~/Desktop/Launch PPA Therapy.command"

# ── Done ──────────────────────────────────────────────────────────────────────
echo
hr
printf "${GREEN}${BOLD}  🎉  Installation complete!${NC}\n"
hr
echo
inf "Installed to:   $INSTALL_DIR"
inf "Desktop icon:   Launch PPA Therapy.command"
echo
if [[ "$API_KEY" == "YOUR_KEY_HERE" ]]; then
  warn "Remember to add your API key:"
  inf "  Edit $INSTALL_DIR/.env"
  inf "  Replace YOUR_KEY_HERE with your key from https://console.anthropic.com"
  echo
fi
inf "To start the app:  double-click 'Launch PPA Therapy' on your Desktop"
inf "To update the app: re-run this installer (settings and data are preserved"
inf "                   if you keep the same install folder and answer 'y' to overwrite)."
echo

ask "Launch now? (Y/n):"
read -r LAUNCH_NOW
if [[ ! "$LAUNCH_NOW" =~ ^[Nn]$ ]]; then
  open "$LAUNCHER"
fi

echo
read -r -p "  Press Return to close this window…"
