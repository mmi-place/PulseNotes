@echo off
setlocal

set "ROOT=%~dp0"
set "ROOT_FORWARD=%ROOT:\=/%"
for /f "usebackq delims=" %%I in (`wsl.exe wslpath -a "%ROOT_FORWARD%"`) do set "WSL_ROOT=%%I"

if not defined WSL_ROOT (
  echo Impossible de convertir le chemin du projet pour WSL.
  pause
  exit /b 1
)

start "PulseNotes - Vite" /D "%ROOT%src" cmd.exe /k npm run dev
start "PulseNotes - PHP" wsl.exe bash -lc "cd '%WSL_ROOT%php' && php -m | grep -qi pdo_sqlite || { echo 'Extension PHP pdo_sqlite manquante.'; echo 'Installez-la puis relancez rundev.bat.'; read; exit 1; }; php -S 127.0.0.1:8787 router.php"

echo PulseNotes demarre sur http://localhost:5173
endlocal
