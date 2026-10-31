@echo off
setlocal
where py >nul 2>&1
if not errorlevel 1 goto checkpy
goto checkpython
:checkpy
py -3 -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 goto runpy
:checkpython
where python >nul 2>&1
if errorlevel 1 goto missing
python -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if errorlevel 1 goto missing
python "%~dp0server.py" %*
goto finished
:runpy
py -3 "%~dp0server.py" %*
:finished
if errorlevel 1 pause
exit /b
:missing
echo Instale Python 3.10 ou mais recente em https://www.python.org/downloads/windows/
echo Depois abra este arquivo novamente. Se usar o instalador classico, habilite Add Python to PATH.
pause
exit /b 1
