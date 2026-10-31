@echo off
setlocal
where py >nul 2>&1
if not errorlevel 1 goto runpy
where python >nul 2>&1
if errorlevel 1 goto missing
python "%~dp0install_windows.py"
goto finished
:runpy
py -3 "%~dp0install_windows.py"
:finished
pause
exit /b
:missing
echo Instale Python 3.10 ou mais recente em https://www.python.org/downloads/windows/
pause
exit /b 1
