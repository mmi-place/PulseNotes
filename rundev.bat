@echo off
setlocal

echo.
echo  PulseNotes - mode de developpement
echo  ----------------------------------
echo  [G] Global      - MySQL dans Docker
echo  [I] Individuel  - SQLite locale
echo.
choice /C GI /N /M "Choisissez G ou I : "

if errorlevel 2 (
  call "%~dp0rundev-individuel.bat"
) else (
  call "%~dp0rundev-global.bat"
)
exit /b %errorlevel%
