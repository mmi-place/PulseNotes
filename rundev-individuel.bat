@echo off
setlocal
call "%~dp0scripts\rundev-mode.bat" personal
exit /b %errorlevel%
