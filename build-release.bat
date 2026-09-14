@echo off
setlocal
set "TARGET=%~1"
if /I "%TARGET%"=="main" set "TARGET=global"
if /I "%TARGET%"=="individuel" set "TARGET=personal"
if /I "%TARGET%"=="personnel" set "TARGET=personal"
if "%TARGET%"=="" set "TARGET=all"

echo.
echo  PulseNotes - construction %TARGET%
echo  --------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-release.ps1" "%TARGET%"
if errorlevel 1 (
  echo.
  echo  Echec de la construction.
  exit /b 1
)
echo.
echo  Terminee. Livrables disponibles dans output\
exit /b %errorlevel%
