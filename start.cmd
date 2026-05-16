@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "TAURI_CLI_VERSION=2.10.1"

where node >nul 2>nul
if errorlevel 1 (
  echo [TauriTavern] Node.js was not found in PATH.
  echo Please install Node.js 18+ and reopen this script.
  pause
  exit /b 1
)

if not exist "scripts\start.mjs" (
  echo [TauriTavern] scripts\start.mjs was not found.
  pause
  exit /b 1
)

if /I "%~1"=="--help" goto help_direct
if /I "%~1"=="-h" goto help_direct
if not "%~1"=="" goto run_direct

:menu
cls
echo ========================================
echo            TauriTavern Launcher
echo ========================================
echo Default frontend: new
echo Legacy frontend is deprecated and will be removed soon.
echo.
echo [1] New frontend    ^| Desktop dev
echo [2] Legacy frontend ^| Desktop dev
echo [3] New frontend    ^| Desktop build
echo [4] Legacy frontend ^| Desktop build
echo [5] New frontend    ^| Android dev
echo [6] Legacy frontend ^| Android dev
echo [7] New frontend    ^| Android build
echo [8] Legacy frontend ^| Android build
echo [H] Help
echo [Q] Quit
echo.
choice /c 12345678HQ /n /m "Select an option: "
set "CHOICE=%ERRORLEVEL%"

if "%CHOICE%"=="10" goto end
if "%CHOICE%"=="9" goto help
if "%CHOICE%"=="8" call :run_and_pause --mode build --frontend legacy --platform android & goto menu
if "%CHOICE%"=="7" call :run_and_pause --mode build --frontend new --platform android & goto menu
if "%CHOICE%"=="6" call :run_and_pause --mode dev --frontend legacy --platform android & goto menu
if "%CHOICE%"=="5" call :run_and_pause --mode dev --frontend new --platform android & goto menu
if "%CHOICE%"=="4" call :run_and_pause --mode build --frontend legacy --platform desktop & goto menu
if "%CHOICE%"=="3" call :run_and_pause --mode build --frontend new --platform desktop & goto menu
if "%CHOICE%"=="2" call :run_and_pause --mode dev --frontend legacy --platform desktop & goto menu
if "%CHOICE%"=="1" call :run_and_pause --mode dev --frontend new --platform desktop & goto menu

goto end

:help
call node scripts\start.mjs --help
echo.
pause
goto menu

:help_direct
call node scripts\start.mjs --help
exit /b %ERRORLEVEL%

:ensure_root_dependencies
if exist "node_modules\.bin\tauri.cmd" exit /b 0
if exist "node_modules\.bin\tauri" exit /b 0

echo.
echo [TauriTavern] Root dependencies are missing.
echo [TauriTavern] They are needed for the local Tauri CLI and build tooling.
choice /c YN /n /m "Install root dependencies now? [Y/N]: "
if errorlevel 2 exit /b 1
call npm install --no-package-lock
if errorlevel 1 (
  echo.
  echo [TauriTavern] Root dependency installation failed.
  exit /b 1
)
exit /b 0

:ensure_windows_tauri_cli
set "NODE_MAJOR="
for /f "usebackq delims=" %%i in (`node -p "process.versions.node.split('.')[0]" 2^>nul`) do set "NODE_MAJOR=%%i"
if not defined NODE_MAJOR exit /b 0
if %NODE_MAJOR% LSS 24 exit /b 0
if exist ".tools\cargo\bin\cargo-tauri.exe" exit /b 0
where cargo-tauri.exe >nul 2>nul
if not errorlevel 1 exit /b 0
where cargo >nul 2>nul
if errorlevel 1 (
  echo.
  echo [TauriTavern] Node.js %NODE_MAJOR% detected on Windows.
  echo [TauriTavern] The npm-based Tauri CLI may fail in this environment.
  echo [TauriTavern] Install Rust/Cargo or use Node.js 23 or earlier.
  exit /b 1
)
call cargo tauri -V >nul 2>nul
if not errorlevel 1 exit /b 0
echo.
echo [TauriTavern] Windows + Node.js %NODE_MAJOR% detected.
echo [TauriTavern] Bootstrapping repo-local cargo-tauri for reliable launches...
choice /c YN /n /m "Install repo-local cargo-tauri now? [Y/N]: "
if errorlevel 2 exit /b 1
call cargo install tauri-cli --version %TAURI_CLI_VERSION% --locked --root .tools\cargo
if errorlevel 1 (
  echo.
  echo [TauriTavern] Repo-local cargo-tauri installation failed.
  exit /b 1
)
exit /b 0

:ensure_frontend_dependencies
if exist "frontend\node_modules" exit /b 0

echo.
echo [TauriTavern] Frontend dependencies are missing.
echo [TauriTavern] They are needed for the default SolidJS frontend.
choice /c YN /n /m "Install frontend dependencies now? [Y/N]: "
if errorlevel 2 exit /b 1
call npm --prefix frontend install
if errorlevel 1 (
  echo.
  echo [TauriTavern] Frontend dependency installation failed.
  exit /b 1
)
exit /b 0

:maybe_bootstrap
call :ensure_root_dependencies
if errorlevel 1 exit /b 1

call :ensure_windows_tauri_cli
if errorlevel 1 exit /b 1

echo %* | findstr /i /c:"--frontend legacy" >nul
if not errorlevel 1 exit /b 0

call :ensure_frontend_dependencies
if errorlevel 1 exit /b 1
exit /b 0

:run_and_pause
echo.
call :maybe_bootstrap %*
if errorlevel 1 (
  echo [TauriTavern] Launch cancelled.
  echo.
  pause
  exit /b 1
)

echo [TauriTavern] Running: node scripts\start.mjs %*
call node scripts\start.mjs %*
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" echo [TauriTavern] Exit code: %EXIT_CODE%
pause
exit /b %EXIT_CODE%

:run_direct
call :maybe_bootstrap %*
if errorlevel 1 exit /b 1

call node scripts\start.mjs %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [TauriTavern] Exit code: %EXIT_CODE%
  pause
)
exit /b %EXIT_CODE%

:end
exit /b 0