@echo off
REM ================================================================
REM Custom Installer Build Script (Windows)
REM ================================================================
REM This script builds the Electron application with custom installer
REM Usage: build-installer.bat
REM ================================================================

echo ==========================================
echo Electron POC - Custom Installer Builder
echo ==========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Warning: node_modules not found. Running npm install...
    call npm install
    if errorlevel 1 (
        echo Error: npm install failed!
        pause
        exit /b 1
    )
    echo Success: Dependencies installed
    echo.
)

REM Clean previous build
echo Cleaning previous build...
if exist "release" rmdir /s /q "release"
if exist "dist" rmdir /s /q "dist"
echo Success: Cleaned
echo.

REM Build styles
echo Building styles...
call npm run build:styles
if errorlevel 1 (
    echo Error: Style build failed!
    pause
    exit /b 1
)
echo Success: Styles built
echo.

REM Build application
echo Building application with Vite...
call npm run build
if errorlevel 1 (
    echo Error: Application build failed!
    pause
    exit /b 1
)
echo Success: Application built
echo.

REM Build installer
echo Building custom installer...
echo This may take a few minutes...
call npm run dist:win:x64
if errorlevel 1 (
    echo Error: Installer build failed!
    pause
    exit /b 1
)
echo Success: Installer built successfully
echo.

REM Check output
echo ==========================================
echo Build Complete!
echo ==========================================
if exist "release" (
    echo.
    echo Output files:
    dir /b release\*.exe 2>nul
    echo.
    echo Installer location:
    for /r "release" %%f in (*.exe) do echo    -^> %%f
    echo.
) else (
    echo Warning: release directory not found
)

echo ==========================================
echo Next Steps:
echo ==========================================
echo 1. Test the installer on this Windows machine
echo 2. Try different test scenarios (see CUSTOM_INSTALLER_README.md)
echo 3. Verify requirements validation works
echo.
echo To test:
echo   - Run the installer (should check system requirements)
echo   - Test on older Windows or low-spec VM (should fail)
echo.
echo For more information, see CUSTOM_INSTALLER_README.md
echo.
pause
