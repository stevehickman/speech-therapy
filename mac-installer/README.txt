PPA Speech Therapy Suite — macOS Installer
Version 4 · March 2026
═══════════════════════════════════════════

CONTENTS
────────
  Install PPA Therapy.command   ← Double-click to install
  install.sh                    ← Installer script (run by the .command file)
  ppa-speech-therapy-bundle.jsx ← Application bundle
  README.txt                    ← This file


REQUIREMENTS
────────────
  • macOS 12 Monterey or later (Intel or Apple Silicon)
  • Node.js 18 or later  (the installer will guide you if missing)
  • An Anthropic API key (get one at https://console.anthropic.com)
  • Internet connection (for the API and npm packages)


HOW TO INSTALL
──────────────
1. Make sure all three files are in the same folder.

2. Double-click "Install PPA Therapy.command".
   • macOS may show a security warning on first run.
     If so: right-click → Open → Open (to approve it once).

3. Follow the on-screen prompts:
   • Confirm or change the install location  (default: ~/PPA Therapy)
   • Paste your Anthropic API key
   • The installer sets up the app, installs packages, and creates
     a "Launch PPA Therapy" icon on your Desktop.

4. After installation, double-click "Launch PPA Therapy" on your Desktop
   to start the app. It opens automatically in your browser.


UPDATING
────────
To install a new version, run the installer again with the updated bundle.
Your session data and custom content live in the browser and are not
affected by updates.  Download a full backup from Progress → ⚙ Settings
before updating as a precaution.


TROUBLESHOOTING
───────────────
"command not found: npm"
  Node.js is not on your PATH.  Install it via https://nodejs.org (LTS)
  or run: brew install node

"App won't load / blank page"
  Check your API key in ~/PPA Therapy/.env and make sure it starts with
  sk-ant-api03-…

"The .command file opens TextEdit instead of Terminal"
  Right-click the .command file → Open With → Terminal.app


UNINSTALLING
────────────
1. Delete ~/PPA Therapy  (or whatever install folder you chose).
2. Delete "Launch PPA Therapy.command" from your Desktop.
3. Browser data (custom content, progress) is stored separately in your
   browser.  Clear it from browser Settings → Privacy → Site Data if needed.
