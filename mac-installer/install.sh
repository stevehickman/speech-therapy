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
hdr "Step 1 of 5 — Checking and installing prerequisites"
# ─────────────────────────────────────────────────────────────────────────────

# ── Helper: probe for a working Node ≥ 18 ────────────────────────────────────
probe_node() {
  NODE_OK=false
  NODE_CMD=""
  local nvm_latest
  nvm_latest=$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)
  for candidate in node /usr/local/bin/node /opt/homebrew/bin/node \
                   "$HOME/.nvm/versions/node/$nvm_latest/bin/node"; do
    if command -v "$candidate" &>/dev/null 2>&1 || [[ -x "$candidate" ]]; then
      local VER MAJOR
      VER=$("$candidate" --version 2>/dev/null | sed 's/v//')
      MAJOR=$(echo "$VER" | cut -d. -f1)
      if [[ "$MAJOR" -ge 18 ]]; then
        NODE_OK=true
        NODE_CMD="$candidate"
        ok "Node.js $VER found"
        return 0
      fi
    fi
  done
  return 1
}

# ── Node.js ───────────────────────────────────────────────────────────────────
probe_node || true   # sets NODE_OK / NODE_CMD

if [[ "$NODE_OK" == false ]]; then
  warn "Node.js 18 or later was not found — attempting automatic install…"
  echo

  # ── Find or install Homebrew ──────────────────────────────────────────────
  BREW_CMD=""
  for brew_path in brew /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if command -v "$brew_path" &>/dev/null 2>&1 || [[ -x "$brew_path" ]]; then
      BREW_CMD="$brew_path"
      break
    fi
  done

  if [[ -z "$BREW_CMD" ]]; then
    inf "Homebrew not found — installing Homebrew first…"
    inf "(You may be prompted for your Mac login password.)"
    echo
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Re-probe for brew after install
    for brew_path in /opt/homebrew/bin/brew /usr/local/bin/brew; do
      if [[ -x "$brew_path" ]]; then
        BREW_CMD="$brew_path"
        ok "Homebrew installed"
        break
      fi
    done
  else
    ok "Homebrew found at $BREW_CMD"
  fi

  # ── Use Homebrew to install Node ──────────────────────────────────────────
  if [[ -n "$BREW_CMD" ]]; then
    inf "Installing Node.js via Homebrew…"
    "$BREW_CMD" install node 2>&1 | grep -E '(Installed|Already|Error|node)' | sed 's/^/     /' || true
    # Add Homebrew bin to PATH for this session
    export PATH="$("$BREW_CMD" --prefix)/bin:$PATH"
    probe_node || true
  fi

  # ── If still not found, print manual instructions and exit ────────────────
  if [[ "$NODE_OK" == false ]]; then
    err "Could not install Node.js automatically."
    echo
    inf "Please install it manually using one of these methods, then re-run this installer:"
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
fi

# ── npm ───────────────────────────────────────────────────────────────────────
# npm always ships alongside node; resolve it from the same bin directory.
NODE_BIN_DIR="$(dirname "$NODE_CMD")"
NPM_CMD="$NODE_BIN_DIR/npm"

if [[ ! -x "$NPM_CMD" ]]; then
  warn "npm not found alongside Node.js — attempting repair…"

  # Try corepack (bundled with Node 16+): enables a managed npm shim
  COREPACK_CMD="$NODE_BIN_DIR/corepack"
  if [[ -x "$COREPACK_CMD" ]]; then
    inf "Enabling npm via corepack…"
    "$COREPACK_CMD" enable npm 2>/dev/null || true
  fi

  # If corepack didn't produce npm, try reinstalling Node via Homebrew
  if [[ ! -x "$NPM_CMD" ]]; then
    BREW_FOR_REPAIR=""
    for b in brew /opt/homebrew/bin/brew /usr/local/bin/brew; do
      if command -v "$b" &>/dev/null 2>&1 || [[ -x "$b" ]]; then
        BREW_FOR_REPAIR="$b"; break
      fi
    done
    if [[ -n "$BREW_FOR_REPAIR" ]]; then
      inf "Reinstalling Node.js via Homebrew to repair npm…"
      "$BREW_FOR_REPAIR" reinstall node 2>&1 | grep -E '(Installed|Error)' | sed 's/^/     /' || true
    fi
  fi

  if [[ ! -x "$NPM_CMD" ]]; then
    err "npm is not available. Please reinstall Node.js from https://nodejs.org and try again."
    echo; read -r -p "  Press Return to close…"; exit 1
  fi
fi

NPM_VER=$("$NPM_CMD" --version 2>/dev/null)
ok "npm $NPM_VER ready ($(realpath "$NPM_CMD" 2>/dev/null || echo "$NPM_CMD"))"

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
# Required runtime packages (beyond what the Vite template provides)
REQUIRED_PKGS=(react react-dom mespeak)

inf "Running npm install (this may take a minute)…"
cd "$INSTALL_DIR"
"$NPM_CMD" install --silent 2>&1 | tail -3 | sed 's/^/     /' || true
ok "npm packages installed"

# ── Verify and top-up any missing packages ────────────────────────────────────
MISSING=()
for pkg in "${REQUIRED_PKGS[@]}"; do
  if [[ ! -d "$INSTALL_DIR/node_modules/$pkg" ]]; then
    MISSING+=("$pkg")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  inf "Installing missing packages: ${MISSING[*]}…"
  "$NPM_CMD" install "${MISSING[@]}" --silent 2>&1 | tail -3 | sed 's/^/     /' || true
  ok "Installed: ${MISSING[*]}"
else
  ok "All required packages present"
fi

# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 5 of 5 — Creating Desktop launcher"
# ─────────────────────────────────────────────────────────────────────────────

LAUNCHER="$HOME/Desktop/Launch PPA Therapy.command"

# NODE_CMD and NPM_CMD are baked in at install time so this launcher always
# uses the exact same Node/npm version that was used to set up the project,
# even if the user later installs additional Node versions.
cat > "$LAUNCHER" <<LAUNCHER
#!/usr/bin/env bash
# PPA Speech Therapy Suite — Desktop Launcher

INSTALL_DIR="$INSTALL_DIR"

# ── Pinned Node/npm paths (set by installer) ──────────────────────────────────
PINNED_NODE="$NODE_CMD"
PINNED_NPM="$NPM_CMD"

# Use pinned paths if they still exist; fall back to whatever is on PATH.
if [[ -x "\$PINNED_NODE" ]]; then
  NODE_BIN_DIR="\$(dirname "\$PINNED_NODE")"
  export PATH="\$NODE_BIN_DIR:\$PATH"
  NPM_RUN="\$PINNED_NPM"
else
  echo "⚠  Pinned Node.js not found at \$PINNED_NODE"
  echo "   Falling back to system Node — re-run the installer to re-pin."
  echo
  # Source shell profiles so nvm / Homebrew node are on PATH
  for rc in "\$HOME/.zshrc" "\$HOME/.bashrc" "\$HOME/.bash_profile" "\$HOME/.profile"; do
    [[ -f "\$rc" ]] && source "\$rc" 2>/dev/null && break
  done
  export PATH="\$PATH:/opt/homebrew/bin:/usr/local/bin"
  NPM_RUN="\$(command -v npm 2>/dev/null || echo npm)"
fi

# Check app is still there
if [[ ! -d "\$INSTALL_DIR" ]]; then
  osascript -e 'display alert "PPA Therapy folder not found" message "Expected at: $INSTALL_DIR\n\nRe-run the installer to set up again." as warning'
  exit 1
fi

# Kill any previous dev server on port 5173
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

cd "\$INSTALL_DIR"
echo "Starting PPA Speech Therapy Suite…"
echo "Node:  \$(node --version 2>/dev/null)  (\$(command -v node))"
echo "npm:   \$("\$NPM_RUN" --version 2>/dev/null)  (\$NPM_RUN)"
echo "Opening browser at http://localhost:5173"
echo "(Close this window or press Ctrl+C to stop the server)"
echo

# Open browser after a short delay for the server to start
(sleep 2 && open http://localhost:5173) &

"\$NPM_RUN" run dev
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
