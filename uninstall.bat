@echo off
chcp 65001 >nul
title Discord Extensions Uninstaller
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    pause
)
