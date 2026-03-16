PPA Speech Therapy Suite — Windows Installer
Version 4 · March 2026
═════════════════════════════════════════════

CONTENTS
────────
  Install PPA Therapy.bat       ← Double-click to install
  install.ps1                   ← PowerShell installer (run by the .bat file)
  ppa-speech-therapy-bundle.jsx ← Application bundle
  README.txt                    ← This file


REQUIREMENTS
────────────
  • Windows 10 or Windows 11
  • PowerShell 5.1 or later  (included in Windows 10/11)
  • Node.js 18 or later  (the installer will guide you if missing)
  • An Anthropic API key  (get one at https://console.anthropic.com)
  • Internet connection  (for the API and npm packages during install)


HOW TO INSTALL
──────────────
1. Make sure all files are in the same folder.

2. Double-click "Install PPA Therapy.bat".

3. If Windows SmartScreen shows a warning:
     Click "More info" → "Run anyway"
   This appears because the file is not code-signed. The script
   only creates a local Vite project — it does not modify the system.

4. Follow the on-screen prompts:
   • Confirm or change the install location
     (default: C:\Users\<you>\AppData\Local\PPA Therapy)
   • Paste your Anthropic API key
   • The installer sets up the project, installs packages, and creates
     a Desktop shortcut and Start Menu entry.

5. After installation, double-click "Launch PPA Therapy" on your Desktop.
   A console window opens and your browser loads the app automatically.


WHAT GETS INSTALLED
───────────────────
  %LOCALAPPDATA%\PPA Therapy\   ← Vite project + app bundle + .env
  Desktop shortcut              ← "Launch PPA Therapy"
  Start Menu                    ← Start → PPA Therapy → Launch / Uninstall


UPDATING
────────
Run the installer again with the new bundle file. Choose the same install
folder and answer Y to overwrite. Your browser data (progress, custom
content) is stored in the browser — it is not touched by reinstall.
Download a full backup from Progress → ⚙ Settings before updating.


UNINSTALLING
────────────
  Start → PPA Therapy → Uninstall PPA Therapy
  — or —
  Delete %LOCALAPPDATA%\PPA Therapy and the Desktop shortcut manually.

Browser data (custom content, session history) is stored separately.
Clear it from browser Settings → Privacy → Cookies and Site Data if needed.


TROUBLESHOOTING
───────────────
"npm is not recognized"
  Node.js is not on your PATH. Install from https://nodejs.org (LTS),
  restart the installer, or open a new Command Prompt and retry.

"Execution of scripts is disabled"
  The .bat file uses -ExecutionPolicy Bypass for this session only.
  If you still see this message, right-click install.ps1 → Run with
  PowerShell, or run in an Administrator PowerShell:
    Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

"App won't load / shows API error"
  Check %LOCALAPPDATA%\PPA Therapy\.env and confirm the key starts
  with sk-ant-api03-...

"Port 5173 already in use"
  The launcher kills any existing process on that port before starting.
  If the problem persists, restart your PC and try again.
