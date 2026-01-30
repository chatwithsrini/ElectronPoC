@echo off
echo ========================================
echo    Electron PoC - Windows Build Script
echo ========================================
echo.

:: Kill all Electron processes
echo [1/5] Stopping Electron processes...
taskkill /F /IM electron.exe /T 2>nul
if %ERRORLEVEL% EQU 0 (
    echo       Electron processes stopped
) else (
    echo       No running Electron processes found
)

:: Wait for processes to fully terminate
echo [2/5] Waiting for processes to terminate...
timeout /t 5 /nobreak >nul
echo       Done

:: Remove release folder if it exists
echo [3/5] Cleaning release directory...
if exist release (
    powershell -Command "Start-Sleep -Seconds 2; Remove-Item -Path release -Recurse -Force -ErrorAction SilentlyContinue"
    timeout /t 2 /nobreak >nul
    echo       Release directory cleaned
) else (
    echo       No release directory to clean
)

:: Build the application
echo [4/5] Building application...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo *** BUILD FAILED ***
    echo Check the error messages above
    pause
    exit /b 1
)
echo       Build completed successfully

:: Package with electron-builder
echo [5/5] Packaging with electron-builder...
call electron-builder --win
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo *** PACKAGING FAILED ***
    echo Check the error messages above
    pause
    exit /b 1
)

echo.
echo ========================================
echo    BUILD COMPLETED SUCCESSFULLY!
echo ========================================
echo.
echo The installer is located in: release\
dir /b release\*.exe 2>nul
echo.
pause
