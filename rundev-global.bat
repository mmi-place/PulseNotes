@echo off
setlocal
call "%~dp0scripts\rundev-mode.bat" global
exit /b %errorlevel%
