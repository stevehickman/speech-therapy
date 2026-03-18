# =============================================================================
#  PPA Speech Therapy Suite — Windows Installer
#  Version 4 · March 2026
#  Run via: Install PPA Therapy.bat  (included in this package)
# =============================================================================
#Requires -Version 5.1

param(
    [switch]$Unattended  # future: skip prompts, use defaults
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Resolve script directory ──────────────────────────────────────────────────
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$BundleSrc      = Join-Path $ScriptDir "ppa-speech-therapy-bundle.jsx"
$UserGuideSrc   = Join-Path $ScriptDir "ppa-speech-therapy-user-guide.pdf"
$TechDocsSrc    = Join-Path $ScriptDir "ppa-speech-therapy-docs.pdf"

# ── Console helpers ───────────────────────────────────────────────────────────
function Write-Hr {
    Write-Host ("─" * 76) -ForegroundColor DarkGray
}
function Write-Hdr([string]$Title) {
    Write-Host ""
    Write-Hr
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Hr
    Write-Host ""
}
function Write-Ok([string]$Msg)   { Write-Host "  ✓  $Msg" -ForegroundColor Green }
function Write-Inf([string]$Msg)  { Write-Host "     $Msg" }
function Write-Warn([string]$Msg) { Write-Host "  ⚠  $Msg" -ForegroundColor Yellow }
function Write-Err([string]$Msg)  { Write-Host "  ✗  $Msg" -ForegroundColor Red }

function Pause-Exit([int]$Code = 0) {
    Write-Host ""
    Write-Host "  Press Enter to close…" -NoNewline
    $null = Read-Host
    exit $Code
}

# ── Banner ────────────────────────────────────────────────────────────────────
Clear-Host
Write-Host ""
Write-Host "   ╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "   ║      🌿  PPA Speech Therapy Suite  —  Windows Installer     ║" -ForegroundColor Cyan
Write-Host "   ║                    Version 4  ·  March 2026                 ║" -ForegroundColor Cyan
Write-Host "   ╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Inf "This installer will set up PPA Speech Therapy Suite on your PC."
Write-Inf "It creates a Vite project, configures your Anthropic API key,"
Write-Inf "and adds a shortcut to your Desktop and Start Menu."
Write-Host ""

# ── Verify bundle and docs ────────────────────────────────────────────────────
if (-not (Test-Path $BundleSrc)) {
    Write-Err "ppa-speech-therapy-bundle.jsx not found next to the installer."
    Write-Inf "Please make sure all installer files are in the same folder."
    Pause-Exit 1
}
if (-not (Test-Path $UserGuideSrc) -or -not (Test-Path $TechDocsSrc)) {
    Write-Err "PDF documentation files not found next to the installer."
    Write-Inf "Please make sure ppa-speech-therapy-user-guide.pdf and ppa-speech-therapy-docs.pdf"
    Write-Inf "are in the same folder as the installer and try again."
    Pause-Exit 1
}

# =============================================================================
Write-Hdr "Step 1 of 5 — Checking prerequisites"
# =============================================================================

# ── Node.js ───────────────────────────────────────────────────────────────────
$NodeCmd = $null
$NpmCmd  = $null

# Probe common locations
$NodeCandidates = @(
    "node",
    "$env:ProgramFiles\nodejs\node.exe",
    "$env:ProgramFiles(x86)\nodejs\node.exe",
    "$env:APPDATA\nvm\v*\node.exe",
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
)

foreach ($candidate in $NodeCandidates) {
    $resolved = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($resolved) {
        try {
            $ver = & $resolved.Source --version 2>$null
            $major = [int]($ver -replace 'v(\d+)\..*','$1')
            if ($major -ge 18) {
                $NodeCmd = $resolved.Source
                $NpmCmd  = Join-Path (Split-Path $NodeCmd) "npm.cmd"
                if (-not (Test-Path $NpmCmd)) { $NpmCmd = "npm" }
                Write-Ok "Node.js $ver found at $NodeCmd"
                break
            }
        } catch {}
    }
}

# Also try globbing nvm path
if (-not $NodeCmd) {
    $nvmNodes = Get-ChildItem "$env:APPDATA\nvm\v*\node.exe" -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1
    if ($nvmNodes) {
        $ver = & $nvmNodes.FullName --version 2>$null
        $major = [int]($ver -replace 'v(\d+)\..*','$1')
        if ($major -ge 18) {
            $NodeCmd = $nvmNodes.FullName
            $NpmCmd  = Join-Path (Split-Path $NodeCmd) "npm.cmd"
            Write-Ok "Node.js $ver found (nvm)"
        }
    }
}

if (-not $NodeCmd) {
    Write-Warn "Node.js 18 or later was not found."
    Write-Host ""
    Write-Inf "Install it using one of these methods, then re-run this installer:"
    Write-Host ""
    Write-Inf "  Option A — Official installer (recommended):"
    Write-Inf "    https://nodejs.org  →  download the Windows LTS installer (.msi)"
    Write-Inf "    Run the .msi and keep all defaults, then restart this installer."
    Write-Host ""
    Write-Inf "  Option B — winget (Windows Package Manager):"
    Write-Inf "    Open a new PowerShell window and run:"
    Write-Inf "    winget install OpenJS.NodeJS.LTS"
    Write-Host ""
    Write-Inf "  Option C — nvm-windows:"
    Write-Inf "    https://github.com/coreybutler/nvm-windows/releases"
    Write-Inf "    Download nvm-setup.exe, install, then run: nvm install lts"
    Write-Host ""
    Pause-Exit 1
}

# =============================================================================
Write-Hdr "Step 2 of 5 — Choose install location"
# =============================================================================

$DefaultDir = Join-Path $env:LOCALAPPDATA "PPA Therapy"
Write-Host "  ▶  Install folder [$DefaultDir]: " -NoNewline
$UserDir = Read-Host
if ([string]::IsNullOrWhiteSpace($UserDir)) { $InstallDir = $DefaultDir }
else { $InstallDir = $UserDir.Trim('"').Trim() }

if (Test-Path $InstallDir) {
    Write-Warn "Folder already exists: $InstallDir"
    Write-Host "  ▶  Overwrite? (y/N): " -NoNewline
    $confirm = Read-Host
    if ($confirm -notmatch '^[Yy]$') {
        Write-Inf "Installation cancelled."
        Pause-Exit 0
    }
    Remove-Item -Recurse -Force $InstallDir
}

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Write-Ok "Install directory: $InstallDir"

# =============================================================================
Write-Hdr "Step 3 of 5 — Anthropic API key"
# =============================================================================

Write-Inf "The app calls the Anthropic API directly from the browser."
Write-Inf "You need a Claude API key — get one at https://console.anthropic.com"
Write-Host ""
Write-Host "  ▶  Paste your API key (starts with sk-ant-…): " -NoNewline

# Read without echoing
$ApiKeySecure = Read-Host -AsSecureString
$ApiKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ApiKeySecure)
)
Write-Host ""   # newline after hidden input

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    Write-Warn "No API key entered — you can add it later by editing:"
    Write-Inf  "  $InstallDir\.env"
    Write-Inf  "  Replace YOUR_KEY_HERE with your key."
    $ApiKey = "YOUR_KEY_HERE"
} elseif (-not $ApiKey.StartsWith("sk-ant-")) {
    Write-Warn "Key doesn't look like an Anthropic key — installing anyway."
    Write-Inf  "Edit $InstallDir\.env to correct it if needed."
}
Write-Ok "API key recorded"

# =============================================================================
Write-Hdr "Step 4 of 5 — Creating the project"
# =============================================================================

Write-Inf "Creating Vite project…"
Set-Location $InstallDir

# npm create vite with --yes to skip prompts
& $NpmCmd create vite@latest . -- --template react --yes 2>&1 | Where-Object { $_ -match '\S' } | ForEach-Object { Write-Inf $_ }
Write-Ok "Vite project created"

# ── Copy bundle ───────────────────────────────────────────────────────────────
Copy-Item $BundleSrc (Join-Path $InstallDir "src\ppa-speech-therapy-bundle.jsx") -Force
Write-Ok "Bundle copied to src\"

# ── Copy documentation PDFs ───────────────────────────────────────────────────
Copy-Item $UserGuideSrc (Join-Path $InstallDir "ppa-speech-therapy-user-guide.pdf") -Force
Copy-Item $TechDocsSrc  (Join-Path $InstallDir "ppa-speech-therapy-docs.pdf") -Force
Write-Ok "Documentation PDFs copied"

# ── Patch App.jsx ─────────────────────────────────────────────────────────────
@"
import App from './ppa-speech-therapy-bundle.jsx';
export default App;
"@ | Set-Content (Join-Path $InstallDir "src\App.jsx") -Encoding UTF8
Write-Ok "src\App.jsx configured"

# API headers are now baked into fetchAnthropicApi() in shared.jsx — no bundle patch needed.

# ── Write .env ────────────────────────────────────────────────────────────────
@"
# PPA Speech Therapy Suite — Anthropic API key
# Get your key at: https://console.anthropic.com
VITE_ANTHROPIC_API_KEY=$ApiKey
"@ | Set-Content (Join-Path $InstallDir ".env") -Encoding UTF8

@"
VITE_ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
"@ | Set-Content (Join-Path $InstallDir ".env.example") -Encoding UTF8
Write-Ok ".env file written"

# ── Clean up default Vite boilerplate ─────────────────────────────────────────
@"
body { margin: 0; }
"@ | Set-Content (Join-Path $InstallDir "src\index.css") -Encoding UTF8
@("src\assets\react.svg","public\vite.svg") | ForEach-Object {
    $p = Join-Path $InstallDir $_
    if (Test-Path $p) { Remove-Item $p -Force }
}
Write-Ok "Default Vite boilerplate cleaned up"

# ── npm install ───────────────────────────────────────────────────────────────
Write-Inf "Running npm install (this may take a minute)…"
& $NpmCmd install --silent 2>&1 | Select-Object -Last 4 | ForEach-Object { Write-Inf $_ }
Write-Ok "npm packages installed"

Write-Inf "Installing speech synthesis package (mespeak)…"
& $NpmCmd install mespeak --silent 2>&1 | Select-Object -Last 4 | ForEach-Object { Write-Inf $_ }
Write-Ok "Speech synthesis package installed"

# =============================================================================
Write-Hdr "Step 5 of 5 — Creating Desktop shortcut & Start Menu entry"
# =============================================================================

# ── Write a launcher .bat ─────────────────────────────────────────────────────
$LauncherBat = Join-Path $InstallDir "launch.bat"
@"
@echo off
title PPA Speech Therapy Suite
cd /d "$InstallDir"

REM Kill any existing process on port 5173
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173"') do taskkill /f /pid %%a 2>nul

echo Starting PPA Speech Therapy Suite...
echo Browser will open at http://localhost:5173
echo Close this window or press Ctrl+C to stop the server.
echo.

REM Open browser after 3 seconds
start /min "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5173"

npm run dev
"@ | Set-Content $LauncherBat -Encoding ASCII

# ── Desktop shortcut ─────────────────────────────────────────────────────────
$WshShell  = New-Object -ComObject WScript.Shell
$Shortcut  = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Launch PPA Therapy.lnk")
$Shortcut.TargetPath       = $LauncherBat
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.Description      = "PPA Speech Therapy Suite"
$Shortcut.IconLocation     = "%SystemRoot%\System32\SHELL32.dll,13"  # computer icon
$Shortcut.WindowStyle      = 1
$Shortcut.Save()
Write-Ok "Desktop shortcut created"

# ── Start Menu entry ──────────────────────────────────────────────────────────
$StartMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\PPA Therapy"
New-Item -ItemType Directory -Path $StartMenuDir -Force | Out-Null

$StartShortcut  = $WshShell.CreateShortcut("$StartMenuDir\Launch PPA Therapy.lnk")
$StartShortcut.TargetPath       = $LauncherBat
$StartShortcut.WorkingDirectory = $InstallDir
$StartShortcut.Description      = "PPA Speech Therapy Suite"
$StartShortcut.IconLocation     = "%SystemRoot%\System32\SHELL32.dll,13"
$StartShortcut.WindowStyle      = 1
$StartShortcut.Save()
Write-Ok "Start Menu entry created  (Start → PPA Therapy → Launch PPA Therapy)"

# Also add an Uninstall shortcut to Start Menu
$UninstallBat = Join-Path $InstallDir "uninstall.bat"
@"
@echo off
title PPA Therapy — Uninstaller
echo This will remove PPA Speech Therapy Suite.
echo Your browser data (progress, custom content) will NOT be deleted.
echo.
set /p CONFIRM=Type YES to confirm uninstall: 
if /i not "%CONFIRM%"=="YES" goto :cancel
rmdir /s /q "$InstallDir"
del /f "%USERPROFILE%\Desktop\Launch PPA Therapy.lnk" 2>nul
rmdir /s /q "$StartMenuDir" 2>nul
echo.
echo Uninstall complete.
pause
exit /b 0
:cancel
echo Cancelled.
pause
"@ | Set-Content $UninstallBat -Encoding ASCII

$UninstallShortcut  = $WshShell.CreateShortcut("$StartMenuDir\Uninstall PPA Therapy.lnk")
$UninstallShortcut.TargetPath       = $UninstallBat
$UninstallShortcut.WorkingDirectory = $InstallDir
$UninstallShortcut.Description      = "Uninstall PPA Speech Therapy Suite"
$UninstallShortcut.IconLocation     = "%SystemRoot%\System32\SHELL32.dll,131"
$UninstallShortcut.WindowStyle      = 1
$UninstallShortcut.Save()
Write-Ok "Uninstall entry added to Start Menu"

# =============================================================================
Write-Host ""
Write-Hr
Write-Host "  🎉  Installation complete!" -ForegroundColor Green
Write-Hr
Write-Host ""
Write-Inf "Installed to:   $InstallDir"
Write-Inf "Desktop icon:   Launch PPA Therapy"
Write-Inf "Start Menu:     Start → PPA Therapy → Launch PPA Therapy"
Write-Host ""

if ($ApiKey -eq "YOUR_KEY_HERE") {
    Write-Warn "Remember to add your API key:"
    Write-Inf  "  Edit $InstallDir\.env"
    Write-Inf  "  Replace YOUR_KEY_HERE with your key from https://console.anthropic.com"
    Write-Host ""
}

Write-Inf "To start the app: double-click 'Launch PPA Therapy' on your Desktop."
Write-Host ""

Write-Host "  ▶  Launch now? (Y/n): " -NoNewline
$launchNow = Read-Host
if ($launchNow -notmatch '^[Nn]$') {
    Start-Process $LauncherBat
}

Pause-Exit 0
