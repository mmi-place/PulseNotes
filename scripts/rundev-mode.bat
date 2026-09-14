@echo off
setlocal

set "MODE=%~1"
set "ROOT=%~dp0..\"
set "ROOT_FORWARD=%ROOT:\=/%"
for /f "usebackq delims=" %%I in (`wsl.exe wslpath -a "%ROOT_FORWARD%"`) do set "WSL_ROOT=%%I"

if not defined WSL_ROOT (
  echo Impossible de convertir le chemin du projet pour WSL.
  pause
  exit /b 1
)

if /I "%MODE%"=="global" (
  echo Demarrage du conteneur MySQL dedie a PulseNotes...
  call "%ROOT%install-dev-db.bat" --start-only
  if errorlevel 1 exit /b 1
) else if /I "%MODE%"=="personal" (
  echo Demarrage individuel avec SQLite, sans Docker.
) else (
  echo Mode de developpement inconnu : %MODE%
  exit /b 1
)

start "PulseNotes - Vite" /D "%ROOT%src" cmd.exe /k npm run dev
start "PulseNotes - PHP %MODE%" wsl.exe bash -lc "cd '%WSL_ROOT%' && bash scripts/run-dev-api.sh '%MODE%'"

echo PulseNotes %MODE% demarre sur http://localhost:5173
exit /b 0
