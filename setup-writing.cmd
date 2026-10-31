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
python "%~dp0setup_proofreader.py" %*
goto finished
:runpy
py -3 "%~dp0setup_proofreader.py" %*
:finished
set "SETUP_RESULT=%errorlevel%"
pause
exit /b %SETUP_RESULT%
:missing
echo Instale Python 3.10 ou mais recente e tente novamente.
pause
exit /b 1
