@echo off
:: Run this script as Administrator to build the Windows installer with the custom app icon.
:: Right-click build-win-admin.cmd -> Run as administrator
:: Or: open an elevated Command Prompt, cd to this folder, then run build-win-admin.cmd

cd /d "%~dp0"
call npm run dist:win
pause
