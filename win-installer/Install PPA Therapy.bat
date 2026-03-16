@echo off
title PPA Speech Therapy Suite — Installer
cd /d "%~dp0"

echo.
echo  PPA Speech Therapy Suite - Windows Installer
echo  ================================================
echo.
echo  Starting installer...
echo.

REM Check if PowerShell is available
where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: PowerShell is required but was not found.
    echo  Please install PowerShell 5.1 or later from:
    echo  https://github.com/PowerShell/PowerShell/releases
    pause
    exit /b 1
)

REM Run the PowerShell installer with execution policy bypass for this session only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
