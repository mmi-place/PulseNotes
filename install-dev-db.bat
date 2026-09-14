@echo off
setlocal
set "ROOT=%~dp0"

where pwsh.exe >nul 2>nul
if errorlevel 1 (
  set "POWERSHELL=powershell.exe"
) else (
  set "POWERSHELL=pwsh.exe"
)

%POWERSHELL% -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\install-dev-db.ps1" %*
if errorlevel 1 (
  echo.
  echo Echec de la preparation MySQL.
  if /I not "%~1"=="--start-only" pause
  exit /b 1
)

echo.
echo MySQL PulseNotes est pret. Lancez rundev-global.bat pour l'utiliser.
if /I not "%~1"=="--start-only" pause
exit /b 0
